// Improv Wi-Fi Serial protocol, https://www.improv-wifi.com/serial/
// Packet: "IMPROV" | version (1) | type (1) | length (1) | data | checksum (sum of all previous bytes & 0xFF)

export const IMPROV_HEADER = [0x49, 0x4d, 0x50, 0x52, 0x4f, 0x56] // "IMPROV"
export const IMPROV_VERSION = 1

export const PacketType = { CURRENT_STATE: 0x01, ERROR_STATE: 0x02, RPC: 0x03, RPC_RESULT: 0x04 }
export const State = { READY: 0x02, PROVISIONING: 0x03, PROVISIONED: 0x04 }
export const ImprovError = {
  NONE: 0x00,
  INVALID_RPC: 0x01,
  UNKNOWN_RPC: 0x02,
  UNABLE_TO_CONNECT: 0x03,
  NOT_AUTHORIZED: 0x04,
  UNKNOWN: 0xff,
}
export const Command = { WIFI_SETTINGS: 0x01, GET_STATE: 0x02, GET_INFO: 0x03, GET_WIFI_NETWORKS: 0x04 }

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function buildPacket(type, data) {
  const out = new Uint8Array(6 + 3 + data.length + 1)
  out.set(IMPROV_HEADER, 0)
  out[6] = IMPROV_VERSION
  out[7] = type
  out[8] = data.length
  out.set(data, 9)
  let sum = 0
  for (let i = 0; i < out.length - 1; i++) sum += out[i]
  out[out.length - 1] = sum & 0xff
  return out
}

export function buildRpc(command, strings = []) {
  const parts = strings.map((s) => encoder.encode(s))
  for (const p of parts) if (p.length > 255) throw new Error('Improv string too long')
  const payloadLen = parts.reduce((n, p) => n + 1 + p.length, 0)
  if (payloadLen > 253) throw new Error('Improv payload too long')
  const data = new Uint8Array(2 + payloadLen)
  data[0] = command
  data[1] = payloadLen
  let i = 2
  for (const p of parts) {
    data[i++] = p.length
    data.set(p, i)
    i += p.length
  }
  return buildPacket(PacketType.RPC, data)
}

// Parse the strings of an RPC result: data = command | total length | (len | bytes)*
export function parseRpcResult(data) {
  const command = data[0]
  const total = data[1]
  const strings = []
  let i = 2
  const end = Math.min(data.length, 2 + total)
  while (i < end) {
    const len = data[i++]
    strings.push(decoder.decode(data.subarray(i, i + len)))
    i += len
  }
  return { command, strings }
}

// Stream parser: feed bytes, get complete packets. Non-Improv bytes are ignored here
// (the monitor shows them separately).
export class ImprovParser {
  constructor(onPacket) {
    this.onPacket = onPacket
    this.buf = []
  }

  push(bytes) {
    for (const b of bytes) {
      const pos = this.buf.length
      if (pos < 6) {
        if (b === IMPROV_HEADER[pos]) this.buf.push(b)
        else this.buf = b === IMPROV_HEADER[0] ? [b] : []
        continue
      }
      this.buf.push(b)
      if (this.buf.length >= 9) {
        const len = this.buf[8]
        if (this.buf.length === 9 + len + 1) {
          const packet = this.buf
          this.buf = []
          let sum = 0
          for (let i = 0; i < packet.length - 1; i++) sum += packet[i]
          if ((sum & 0xff) !== packet[packet.length - 1]) continue
          if (packet[6] !== IMPROV_VERSION) continue
          this.onPacket({ type: packet[7], data: Uint8Array.from(packet.slice(9, 9 + len)) })
        }
      }
    }
  }
}
