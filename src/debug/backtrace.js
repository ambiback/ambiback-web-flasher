// Decode ESP32 crash output with a symbol map made by the firmware CI (build/make-symbols.py).
// symbols.json: { version, buildId, device, symbols: [[start, size, function, "file:line"], ...] } sorted by start.

const ADDR_RE = /0x[0-9a-fA-F]{8}/g

// Lines with code addresses worth decoding.
export function extractAddresses(line) {
  const trimmed = line.trim()
  if (/^Backtrace:/i.test(trimmed)) {
    // "Backtrace: 0xPC:0xSP 0xPC:0xSP ..." -> only the PC of each pair
    return [...trimmed.matchAll(/(0x[0-9a-fA-F]{8}):0x[0-9a-fA-F]{8}/g)].map((m) => parseInt(m[1], 16))
  }
  if (/^(PC|EXCVADDR|A0)\s*:/.test(trimmed) || /^Guru Meditation/.test(trimmed)) {
    return (trimmed.match(ADDR_RE) || []).map((a) => parseInt(a, 16))
  }
  return []
}

export function isCodeAddress(addr) {
  // IRAM 0x40080000-0x400BFFFF, flash code 0x400C2000-0x40BFFFFF (ESP32)
  return addr >= 0x40000000 && addr < 0x40c00000
}

export function lookup(symbols, addr) {
  let lo = 0
  let hi = symbols.length - 1
  let best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (symbols[mid][0] <= addr) {
      best = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  if (best < 0) return null
  const [start, size, name, location] = symbols[best]
  if (size > 0 && addr >= start + size) return null
  return { name, location, offset: addr - start }
}

export function decodeLine(map, line) {
  if (!map) return []
  return extractAddresses(line)
    .filter(isCodeAddress)
    .map((addr) => ({ addr, sym: lookup(map.symbols, addr) }))
}

export function formatAddr(addr) {
  return '0x' + addr.toString(16).padStart(8, '0')
}
