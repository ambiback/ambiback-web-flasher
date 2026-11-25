// Firmware files are served from the same site under firmware/ (copied there by the deploy
// workflow, see scripts/fetch-firmware.mjs). index.json lists the versions, each version
// folder has the manifest.json made by the ambiback-firmware CI.

const BASE = new URL('firmware/', document.baseURI)

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`)
  return res.json()
}

export async function loadIndex() {
  const index = await getJson(new URL('index.json', BASE))
  if (index.schema !== 1) throw new Error('Unsupported firmware index schema ' + index.schema)
  return index.versions
}

const manifestCache = new Map()

export async function loadManifest(entry) {
  if (!manifestCache.has(entry.version)) {
    const base = new URL(entry.path, BASE)
    const promise = getJson(new URL('manifest.json', base)).then((m) => {
      if (m.schema !== 1) throw new Error('Unsupported manifest schema ' + m.schema)
      return { ...m, baseUrl: base }
    })
    promise.catch(() => manifestCache.delete(entry.version))
    manifestCache.set(entry.version, promise)
  }
  return manifestCache.get(entry.version)
}

export async function sha256Hex(data) {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Download and check all parts of one device. Returns [{name, address, data}].
export async function loadParts(manifest, deviceId, onFile = () => {}) {
  const device = manifest.devices[deviceId]
  if (!device) throw new Error('Unknown device ' + deviceId)
  const out = []
  for (const part of device.parts) {
    const name = part.path.split('/').pop()
    onFile(name)
    const res = await fetch(new URL(part.path, manifest.baseUrl))
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${part.path}`)
    const data = new Uint8Array(await res.arrayBuffer())
    if (part.sha256) {
      const hash = await sha256Hex(data)
      if (hash !== part.sha256.toLowerCase()) throw new Error(`Checksum mismatch: ${part.path}`)
    }
    out.push({ name, address: part.offset, data })
  }
  return out
}

export async function loadSymbols(manifest, deviceId) {
  const device = manifest.devices[deviceId]
  if (!device || !device.symbols) return null
  return getJson(new URL(device.symbols, manifest.baseUrl))
}

// Map the device define printed in the boot banner (e.g. ESP32_NAKED) to the manifest id.
export function findDeviceByDefine(manifest, define) {
  for (const [id, d] of Object.entries(manifest.devices)) if (d.define === define) return id
  return null
}
