import { test } from 'node:test'
import assert from 'node:assert/strict'
import { infoCommand, ledTestCommand, parseBanner, wifiCommand } from '../src/serial/ambiCommands.js'
import { buildPacket, buildRpc, Command, ImprovParser, PacketType, parseRpcResult } from '../src/serial/improv.js'
import { decodeLine, extractAddresses, lookup } from '../src/debug/backtrace.js'
import { LineSplitter } from '../src/serial/lineSplitter.js'

const ascii = (b) => Buffer.from(b).toString('latin1')

test('simple commands are plain ASCII', () => {
  assert.equal(ascii(infoCommand()), '%INFO:')
})

test('wifi command has no length prefix, even for long keys', () => {
  const key = 'k'.repeat(40)
  const bytes = wifiCommand('My Network', key)
  assert.equal(ascii(bytes), '%WIFI:My Network\0' + key + '\0')
  assert.equal(bytes[0], 0x25) // starts directly with '%'
})

test('wifi command rejects bad input', () => {
  assert.throws(() => wifiCommand('', 'x'))
  assert.throws(() => wifiCommand('s'.repeat(33), 'x'))
  assert.throws(() => wifiCommand('ok', 'k'.repeat(64)))
})

test('LED test packet layout', () => {
  const p = ledTestCommand(3)
  const head = '%LEDDATA:'.length
  assert.equal(p.length, head + 1 + 4 + 3 * 4)
  assert.deepEqual([...p.slice(head, head + 5)], [0, 3, 0, 0, 0])
  assert.deepEqual([...p.slice(head + 5 + 8, head + 5 + 12)], [0, 2, 2, 2])
})

test('boot banner', () => {
  assert.deepEqual(parseBanner('I (12) [AmbiBack] version=0.5.231 build=20261125-1 device=ESP32_NAKED'), {
    version: '0.5.231',
    buildId: '20261125-1',
    define: 'ESP32_NAKED',
  })
  assert.equal(parseBanner('hello'), null)
})

test('improv packet checksum and RPC layout', () => {
  const p = buildRpc(Command.WIFI_SETTINGS, ['ab', 'xyz'])
  assert.equal(ascii(p.slice(0, 6)), 'IMPROV')
  assert.equal(p[6], 1)
  assert.equal(p[7], PacketType.RPC)
  assert.equal(p[8], 2 + 1 + 2 + 1 + 3)
  assert.deepEqual([...p.slice(9, 9 + p[8])], [1, 7, 2, 97, 98, 3, 120, 121, 122])
  const sum = [...p.slice(0, -1)].reduce((a, b) => a + b, 0) & 0xff
  assert.equal(p[p.length - 1], sum)
})

test('improv parser finds packets in noisy stream and checks checksum', () => {
  const got = []
  const parser = new ImprovParser((x) => got.push(x))
  const good = buildPacket(PacketType.CURRENT_STATE, new Uint8Array([2]))
  const bad = buildPacket(PacketType.CURRENT_STATE, new Uint8Array([3]))
  bad[bad.length - 1] ^= 0xff
  const noise = new TextEncoder().encode('boot log IMPRO line\n')
  parser.push(noise)
  parser.push(bad)
  parser.push(good.slice(0, 5))
  parser.push(good.slice(5))
  assert.equal(got.length, 1)
  assert.equal(got[0].type, PacketType.CURRENT_STATE)
  assert.deepEqual([...got[0].data], [2])
})

test('improv RPC result strings', () => {
  const data = new Uint8Array([3, 0, 7, ...Buffer.from('AmbiBack'.slice(0, 7)), 2, 0x30, 0x2e])
  data[1] = data.length - 2
  const r = parseRpcResult(data)
  assert.equal(r.command, 3)
  assert.deepEqual(r.strings, ['AmbiBac', '0.'])
})

const map = {
  symbols: [
    [0x400d0000, 0x100, 'setup()', 'AmbiBack.Controller.ino:120'],
    [0x400d0100, 0x80, 'loop()', 'AmbiBack.Controller.ino:300'],
  ],
}

test('backtrace extraction takes PCs only', () => {
  assert.deepEqual(extractAddresses('Backtrace: 0x400d0104:0x3ffb1f20 0x400d0010:0x3ffb1f40'), [0x400d0104, 0x400d0010])
  assert.deepEqual(extractAddresses('Backtrace:0x400d0104:0x3ffb1f20 |<-CORRUPTED'), [0x400d0104])
  assert.deepEqual(extractAddresses('just 0x400d0104 text'), [])
})

test('symbol lookup', () => {
  assert.equal(lookup(map.symbols, 0x400d0104).name, 'loop()')
  assert.equal(lookup(map.symbols, 0x400d0000).name, 'setup()')
  assert.equal(lookup(map.symbols, 0x400d0180), null)
  assert.equal(lookup(map.symbols, 0x400c0000), null)
  const d = decodeLine(map, 'Backtrace: 0x400d0104:0x3ffb1f20 0x400d0010:0x3ffb1f40')
  assert.deepEqual(
    d.map((x) => x.sym.name),
    ['loop()', 'setup()']
  )
})

test('line splitter handles chunks, CRLF and control bytes', () => {
  const lines = []
  const s = new LineSplitter((l) => lines.push(l))
  const enc = new TextEncoder()
  s.push(enc.encode('hel'))
  s.push(enc.encode('lo\r\nwor'))
  s.push(new Uint8Array([0x01, 0x02]))
  s.push(enc.encode('ld\n'))
  assert.deepEqual(lines, ['hello', 'world'])
})
