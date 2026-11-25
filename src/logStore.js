import { extractAddresses } from './debug/backtrace.js'

const MAX_LINES = 5000

// Serial log kept outside React state; components subscribe with useSyncExternalStore.
export class LogStore {
  constructor() {
    this.lines = []
    this.nextId = 1
    this.paused = false
    this.version = 0
    this.pending = false
    this.listeners = new Set()
    this.subscribe = this.subscribe.bind(this)
    this.getVersion = this.getVersion.bind(this)
  }

  subscribe(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getVersion() {
    return this.version
  }

  notify() {
    if (this.pending) return
    this.pending = true
    const run = () => {
      this.pending = false
      this.version++
      for (const fn of this.listeners) fn()
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
    else setTimeout(run, 16)
  }

  add(text, kind = 'rx') {
    if (this.paused && kind === 'rx') return
    this.lines.push({ id: this.nextId++, time: new Date(), text, kind, hasAddr: extractAddresses(text).length > 0 })
    if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES)
    this.notify()
  }

  clear() {
    this.lines.length = 0
    this.notify()
  }

  setPaused(p) {
    this.paused = p
  }
}
