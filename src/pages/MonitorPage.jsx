import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLang } from '../i18n.jsx'
import { useSerial } from '../SerialContext.jsx'
import { decodeLine, formatAddr } from '../debug/backtrace.js'
import { loadManifest } from '../firmware/catalog.js'

const BAUDS = [9600, 57600, 115200, 230400, 460800, 921600]
const VIEW_LINES = 1500

function pad(n, w = 2) {
  return String(n).padStart(w, '0')
}
function stamp(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

export default function MonitorPage() {
  const { t } = useLang()
  const s = useSerial()
  const { session, portState, log, logVersion, symbols, banner } = s
  const lines = log.lines
  const [filter, setFilter] = useState('')
  const [paused, setPausedState] = useState(false)
  const [showTime, setShowTime] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [error, setError] = useState(null)
  const viewRef = useRef(null)

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase()
    const list = f ? lines.filter((l) => l.text.toLowerCase().includes(f)) : lines
    return list.slice(-VIEW_LINES)
    // logVersion changes whenever lines change (same array instance)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, logVersion, filter])

  useLayoutEffect(() => {
    if (autoScroll && viewRef.current) viewRef.current.scrollTop = viewRef.current.scrollHeight
  }, [visible, autoScroll])

  async function changeBaud(baud) {
    setError(null)
    try {
      await session.open(Number(baud))
    } catch (e) {
      setError(e.message)
    }
  }

  function togglePause() {
    log.setPaused(!paused)
    setPausedState(!paused)
  }

  function save() {
    const text = lines.map((l) => `${stamp(l.time)} ${l.text}`).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ambiback-serial-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  async function reset() {
    setError(null)
    try {
      await session.hardReset()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="row wrap toolbar">
          <label className="inline">
            {t('monitor.baud')}
            <select value={portState.baud} onChange={(e) => changeBaud(e.target.value)} disabled={!portState.hasPort || portState.busy}>
              {BAUDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <input className="grow" placeholder={t('monitor.filter')} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="secondary" onClick={togglePause}>
            {paused ? t('monitor.resume') : t('monitor.pause')}
          </button>
          <button className="secondary" onClick={() => log.clear()}>
            {t('monitor.clear')}
          </button>
          <button className="secondary" onClick={save} disabled={lines.length === 0}>
            {t('monitor.save')}
          </button>
          <button className="secondary" onClick={reset} disabled={!portState.hasPort || portState.busy}>
            {t('monitor.reset')}
          </button>
          <label className="check">
            <input type="checkbox" checked={showTime} onChange={(e) => setShowTime(e.target.checked)} />
            {t('monitor.time')}
          </label>
          <label className="check">
            <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
            {t('monitor.autoscroll')}
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="monitor" ref={viewRef}>
          {visible.length === 0 && <div className="muted">{t('monitor.empty')}</div>}
          {visible.map((l) => (
            <MonitorLine key={l.id} line={l} showTime={showTime} map={symbols && symbols.map} />
          ))}
        </div>
      </section>
      <SymbolPanel symbols={symbols} banner={banner} />
    </div>
  )
}

function MonitorLine({ line, showTime, map }) {
  const decoded = line.hasAddr ? decodeLine(map, line.text) : []
  const cls = line.kind === 'sys' ? 'line sys' : /Guru Meditation|panic|abort\(\)|Backtrace/i.test(line.text) ? 'line crash' : 'line'
  return (
    <div className={cls}>
      {showTime && <span className="ts">{stamp(line.time)} </span>}
      {line.text}
      {decoded.map((d, i) => (
        <div key={i} className="decoded">
          ↳ {formatAddr(d.addr)}: {d.sym ? `${d.sym.name} at ${d.sym.location}` : '??'}
        </div>
      ))}
    </div>
  )
}

function SymbolPanel({ symbols, banner }) {
  const { t } = useLang()
  const { versions, loadSymbolsFor } = useSerial()
  const [version, setVersion] = useState('')
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState('')
  const [error, setError] = useState(null)

  const v = version || (versions && versions[0] && versions[0].version) || ''

  useEffect(() => {
    const entry = versions && versions.find((x) => x.version === v)
    if (!entry) return
    loadManifest(entry)
      .then((m) => setDevices(Object.entries(m.devices).map(([id, d]) => ({ id, label: d.label }))))
      .catch(() => setDevices([]))
  }, [versions, v])

  async function load() {
    setError(null)
    try {
      await loadSymbolsFor(v, deviceId)
    } catch (e) {
      setError(e.message)
    }
  }

  const mismatch = symbols && banner && banner.buildId && symbols.map.buildId && banner.buildId !== symbols.map.buildId

  return (
    <section className="card">
      <h3>{t('symbols.title')}</h3>
      {banner && (
        <p className="small">
          AmbiBack {banner.version} · {banner.define} · build {banner.buildId || t('symbols.unknown')}
        </p>
      )}
      {symbols ? (
        <p className="small">
          {t('symbols.loaded')} {symbols.deviceId} {symbols.version} ({symbols.map.symbols.length} symbols)
        </p>
      ) : (
        <p className="muted small">{t('symbols.none')}</p>
      )}
      {mismatch && <p className="note small">{t('symbols.mismatch')}</p>}
      {versions && versions.length > 0 && (
        <div className="row wrap">
          <select value={v} onChange={(e) => setVersion(e.target.value)}>
            {versions.map((x) => (
              <option key={x.version}>{x.version}</option>
            ))}
          </select>
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">–</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <button className="secondary" onClick={load} disabled={!deviceId}>
            {t('symbols.load')}
          </button>
        </div>
      )}
      {error && <p className="error small">{error}</p>}
    </section>
  )
}
