import { buildRpc, Command, ImprovParser, PacketType, parseRpcResult, State, ImprovError } from './improv.js'

export class ImprovClient {
  constructor(session) {
    this.session = session
    this.state = null
    this.error = ImprovError.NONE
    this.waiters = []
    this.scanResults = null
    this.parser = new ImprovParser((p) => this.handle(p))
    this.unsubscribe = session.onData((bytes) => this.parser.push(bytes))
  }

  dispose() {
    this.unsubscribe()
    for (const w of this.waiters) w.reject(new Error('closed'))
    this.waiters = []
  }

  handle({ type, data }) {
    if (type === PacketType.CURRENT_STATE) {
      this.state = data[0]
      this.resolve((w) => w.kind === 'state' || (w.kind === 'provisioned' && this.state === State.PROVISIONED), this.state)
    } else if (type === PacketType.ERROR_STATE) {
      this.error = data[0]
      if (this.error !== ImprovError.NONE) {
        const err = new Error(errorText(this.error))
        err.code = this.error
        for (const w of this.waiters) w.reject(err)
        this.waiters = []
      }
    } else if (type === PacketType.RPC_RESULT) {
      const result = parseRpcResult(data)
      if (result.command === Command.GET_WIFI_NETWORKS) {
        if (result.strings.length === 0) {
          const list = this.scanResults || []
          this.scanResults = null
          this.resolve((w) => w.kind === 'scan', list)
        } else {
          const [ssid, rssi, secured] = result.strings
          ;(this.scanResults ||= []).push({ ssid, rssi: Number(rssi), secured: secured === 'YES' })
        }
        return
      }
      this.resolve((w) => w.kind === 'rpc' && w.command === result.command, result.strings)
    }
  }

  resolve(match, value) {
    const keep = []
    for (const w of this.waiters) {
      if (match(w)) w.resolve(value)
      else keep.push(w)
    }
    this.waiters = keep
  }

  wait(kind, timeoutMs, extra = {}) {
    return new Promise((resolve, reject) => {
      const w = { kind, ...extra }
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== w)
        reject(new Error('timeout'))
      }, timeoutMs)
      w.resolve = (v) => {
        clearTimeout(timer)
        resolve(v)
      }
      w.reject = (e) => {
        clearTimeout(timer)
        reject(e)
      }
      this.waiters.push(w)
    })
  }

  async rpc(command, strings, kind, timeoutMs) {
    const p = this.wait(kind, timeoutMs, { command })
    await this.session.write(buildRpc(command, strings))
    return p
  }

  // Resolves with the state, rejects with "timeout" when the firmware has no Improv.
  getState(timeoutMs = 2000) {
    return this.rpc(Command.GET_STATE, [], 'state', timeoutMs)
  }

  async getInfo(timeoutMs = 2000) {
    const [firmware, version, chip, name] = await this.rpc(Command.GET_INFO, [], 'rpc', timeoutMs)
    return { firmware, version, chip, name }
  }

  scan(timeoutMs = 15000) {
    this.scanResults = null
    return this.rpc(Command.GET_WIFI_NETWORKS, [], 'scan', timeoutMs)
  }

  // Resolves with the redirect URLs the device sent (e.g. ["http://192.168.1.20/"]).
  async provision(ssid, password, timeoutMs = 30000) {
    const strings = await this.rpc(Command.WIFI_SETTINGS, [ssid, password], 'rpc', timeoutMs)
    return strings
  }
}

export function errorText(code) {
  switch (code) {
    case ImprovError.INVALID_RPC:
      return 'invalid request'
    case ImprovError.UNKNOWN_RPC:
      return 'unknown command'
    case ImprovError.UNABLE_TO_CONNECT:
      return 'unable to connect to the Wi-Fi network'
    case ImprovError.NOT_AUTHORIZED:
      return 'not authorized'
    default:
      return 'unknown error'
  }
}
