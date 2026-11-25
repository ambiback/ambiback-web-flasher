// Turns a byte stream into text lines. Control bytes except tab are dropped,
// so binary protocol bytes (Improv) don't garble the monitor.
export class LineSplitter {
  constructor(onLine) {
    this.onLine = onLine
    this.decoder = new TextDecoder('utf-8', { fatal: false })
    this.partial = ''
  }

  push(bytes) {
    const text = this.decoder.decode(bytes, { stream: true })
    const parts = (this.partial + text).split(/\r?\n/)
    this.partial = parts.pop()
    for (const p of parts) this.onLine(clean(p))
    if (this.partial.length > 4096) {
      this.onLine(clean(this.partial))
      this.partial = ''
    }
  }

  flush() {
    if (this.partial) this.onLine(clean(this.partial))
    this.partial = ''
  }
}

// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000b-\u001f\u007f]/g

function clean(s) {
  return s.replace(CONTROL_RE, '')
}
