// One Web Serial port shared by all features. Only one owner reads at a time:
// the session's own read loop, or esptool-js while flashing (withPortReleased).

// USB-to-serial bridges found on ESP32 boards, plus Espressif native USB.
export const USB_FILTERS = [
  { usbVendorId: 0x10c4 }, // Silicon Labs CP210x
  { usbVendorId: 0x1a86 }, // WCH CH340/CH9102
  { usbVendorId: 0x0403 }, // FTDI
  { usbVendorId: 0x303a }, // Espressif
]

export const isWebSerialSupported = () => typeof navigator !== 'undefined' && 'serial' in navigator

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export class SerialSession {
  constructor() {
    this.port = null
    this.baud = 115200
    this.isOpen = false
    this.reader = null
    this.readLoopDone = null
    this.dataListeners = new Set()
    this.stateListeners = new Set()
  }

  onData(fn) {
    this.dataListeners.add(fn)
    return () => this.dataListeners.delete(fn)
  }

  onState(fn) {
    this.stateListeners.add(fn)
    return () => this.stateListeners.delete(fn)
  }

  emitState(extra = {}) {
    const info = this.port ? this.port.getInfo() : null
    const state = { hasPort: !!this.port, isOpen: this.isOpen, baud: this.baud, info, ...extra }
    for (const fn of this.stateListeners) fn(state)
  }

  async requestPort() {
    const port = await navigator.serial.requestPort({ filters: USB_FILTERS })
    if (this.port && this.port !== port) await this.forget()
    this.port = port
    this.emitState()
    return port
  }

  async ensurePort() {
    if (!this.port) await this.requestPort()
    return this.port
  }

  async open(baud = this.baud) {
    await this.ensurePort()
    if (this.isOpen) {
      if (baud === this.baud) return
      await this.close()
    }
    this.baud = baud
    await this.port.open({ baudRate: baud, bufferSize: 8192 })
    this.isOpen = true
    this.readLoopDone = this.readLoop()
    this.emitState()
  }

  async readLoop() {
    while (this.isOpen && this.port && this.port.readable) {
      this.reader = this.port.readable.getReader()
      try {
        for (;;) {
          const { value, done } = await this.reader.read()
          if (done) break
          if (value && value.length) for (const fn of this.dataListeners) fn(value)
        }
      } catch (err) {
        // Framing/parity errors are recoverable; a lost device is not.
        if (err && err.name === 'NetworkError') {
          this.isOpen = false
          this.emitState({ error: 'disconnected' })
        }
      } finally {
        this.reader.releaseLock()
        this.reader = null
      }
    }
  }

  async close() {
    if (!this.port || !this.isOpen) return
    this.isOpen = false
    try {
      if (this.reader) await this.reader.cancel()
    } catch {
      /* already closed */
    }
    await this.readLoopDone
    try {
      await this.port.close()
    } catch {
      /* already closed */
    }
    this.emitState()
  }

  async forget() {
    await this.close()
    this.port = null
    this.emitState()
  }

  async write(bytes) {
    if (!this.isOpen) throw new Error('Port is not open')
    const writer = this.port.writable.getWriter()
    try {
      await writer.write(bytes)
    } finally {
      writer.releaseLock()
    }
  }

  // Reset into the normal firmware (EN low pulse with IO0 high) on boards with the
  // usual DTR/RTS auto-reset circuit.
  async hardReset() {
    if (!this.isOpen) await this.open()
    await this.port.setSignals({ dataTerminalReady: false, requestToSend: true })
    await sleep(120)
    await this.port.setSignals({ dataTerminalReady: false, requestToSend: false })
  }

  // Close our reader, let fn use the raw port (esptool-js opens it itself), then reopen.
  async withPortReleased(fn, reopenBaud = 115200) {
    await this.ensurePort()
    await this.close()
    this.emitState({ busy: true })
    try {
      return await fn(this.port)
    } finally {
      this.emitState({ busy: false })
      try {
        await this.open(reopenBaud)
      } catch {
        this.emitState({ error: 'reopen' })
      }
    }
  }
}
