// AmbiBack serial commands, see ambiback-firmware docs/serial-protocol.md.
// Every command is plain bytes: "%" NAME ":" followed by optional data.
// Strings are UTF-8 without a length prefix and end with 0x00.

const encoder = new TextEncoder()

function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

export function simpleCommand(name) {
  if (!/^[A-Z]+$/.test(name)) throw new Error('Invalid command name: ' + name)
  return encoder.encode('%' + name + ':')
}

export const infoCommand = () => simpleCommand('INFO')
export const rebootCommand = () => simpleCommand('REBOOT')
export const factoryDefaultCommand = () => simpleCommand('FACTORYDEFAULT')

export const WIFI_SSID_MAX = 32
export const WIFI_KEY_MAX = 64

export function wifiCommand(ssid, key) {
  const bSsid = encoder.encode(ssid)
  const bKey = encoder.encode(key)
  if (bSsid.length === 0 || bSsid.length > WIFI_SSID_MAX) throw new Error('SSID must have 1 to 32 bytes')
  if (bKey.length > WIFI_KEY_MAX - 1) throw new Error('Key must have at most 63 bytes')
  if (bSsid.includes(0) || bKey.includes(0)) throw new Error('SSID and key must not contain NUL')
  return concat([encoder.encode('%WIFI:'), bSsid, new Uint8Array([0]), bKey, new Uint8Array([0])])
}

// LED test like the desktop flasher: a grey ramp over up to 255 LEDs.
// Packet: "%LEDDATA:" 0x00, header [count, startIndex, checksumFlag, checksum], then 4 bytes per LED [0, r, g, b].
// The checksum flag is 0, so the firmware does not check the checksum.
export function ledTestCommand(count = 255) {
  const n = Math.max(1, Math.min(255, count | 0))
  const head = encoder.encode('%LEDDATA:')
  const out = new Uint8Array(head.length + 1 + 4 + n * 4)
  out.set(head, 0)
  let i = head.length
  out[i++] = 0x00
  out[i++] = n
  out[i++] = 0x00
  out[i++] = 0x00
  out[i++] = 0x00
  for (let p = 0; p < n; p++) {
    out[i++] = 0x00
    out[i++] = p
    out[i++] = p
    out[i++] = p
  }
  return out
}

// Boot banner printed by the firmware: "[AmbiBack] version=0.5.231 build=… device=ESP32_NAKED"
const BANNER_RE = /\[AmbiBack\]\s+version=(\S+)\s+build=(\S*)\s+device=(\S+)/

export function parseBanner(line) {
  const m = BANNER_RE.exec(line)
  if (!m) return null
  return { version: m[1], buildId: m[2], define: m[3] }
}
