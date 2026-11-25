import { ESPLoader, Transport } from 'esptool-js'

// Lower speeds to try when the high upload speed fails (bad cable, slow USB bridge).
const FALLBACK_BAUDS = [460800, 115200]

export class BootModeError extends Error {}

/**
 * Write all parts of one device image.
 * @param {SerialPort} port  closed port (esptool-js opens it)
 * @param {object} opts { parts: [{address, data, name}], baud, flashMode, flashFreq, eraseAll, log, progress }
 *   progress(fraction 0..1, label)
 */
export async function flashDevice(port, opts) {
  const bauds = [opts.baud, ...FALLBACK_BAUDS.filter((b) => b < opts.baud)]
  let lastError = null
  for (const baud of bauds) {
    try {
      await flashOnce(port, { ...opts, baud })
      return { baud }
    } catch (err) {
      lastError = err
      if (err instanceof BootModeError) throw err
      opts.log(`Flashing at ${baud} baud failed: ${err.message || err}`)
    }
  }
  throw lastError
}

async function flashOnce(port, { parts, baud, flashMode, flashFreq, eraseAll, log, progress }) {
  const terminal = {
    clean() {},
    writeLine: (s) => log(s),
    write: (s) => log(s),
  }
  const transport = new Transport(port, false)
  const loader = new ESPLoader({ transport, baudrate: baud, romBaudrate: 115200, terminal })
  try {
    let chip
    try {
      chip = await loader.main('default_reset')
    } catch (err) {
      throw new BootModeError(err.message || String(err))
    }
    log(`Chip: ${chip}, upload speed ${baud} baud`)
    // Chip family check: CHIP_NAME is "ESP32" for the classic ESP32 (D0WD, PICO-D4, …)
    if (loader.chip && loader.chip.CHIP_NAME !== 'ESP32') {
      throw new BootModeError(`This firmware is for the classic ESP32, but the board is a ${loader.chip.CHIP_NAME}.`)
    }

    const total = parts.reduce((n, p) => n + p.data.length, 0)
    const before = parts.map((_, i) => parts.slice(0, i).reduce((n, p) => n + p.data.length, 0))
    if (eraseAll) {
      progress(0, 'erase')
      log('Erasing the whole flash…')
      await loader.eraseFlash()
    }
    await loader.writeFlash({
      fileArray: parts.map((p) => ({ data: p.data, address: p.address })),
      flashMode,
      flashFreq,
      flashSize: 'keep',
      eraseAll: false,
      compress: true,
      reportProgress: (fileIndex, written, size) => {
        const done = before[fileIndex] + (written / size) * parts[fileIndex].data.length
        progress(done / total, parts[fileIndex].name)
      },
    })
    progress(1, 'done')
    log('Resetting the device…')
    await loader.after('hard_reset')
  } finally {
    try {
      await transport.disconnect()
    } catch {
      /* already closed */
    }
  }
}
