import { useEffect, useRef, useState } from 'react'
import { useLang } from '../i18n.jsx'
import { useSerial } from '../SerialContext.jsx'
import { loadManifest, loadParts } from '../firmware/catalog.js'
import { BootModeError, flashDevice } from '../serial/flasher.js'
import WifiSetup from '../components/WifiSetup.jsx'

export default function InstallPage() {
  const { t } = useLang()
  const { session, versions, versionsError, addLine } = useSerial()
  const [version, setVersion] = useState(null)
  const [manifest, setManifest] = useState(null)
  const [manifestError, setManifestError] = useState(null)
  const [deviceId, setDeviceId] = useState(() => {
    try {
      return localStorage.getItem('device') || null
    } catch {
      return null
    }
  })
  const [eraseAll, setEraseAll] = useState(false)
  const [phase, setPhase] = useState('idle') // idle | running | done | error
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [log, setLog] = useState([])
  const [showWifi, setShowWifi] = useState(true)
  const logRef = useRef(null)

  const selectedVersion = version || (versions && versions[0] && versions[0].version)
  const entry = versions && versions.find((v) => v.version === selectedVersion)

  useEffect(() => {
    if (!entry) return
    let cancelled = false
    loadManifest(entry)
      .then((m) => !cancelled && (setManifest(m), setManifestError(null)))
      .catch((e) => !cancelled && setManifestError(e.message))
    return () => {
      cancelled = true
    }
  }, [entry])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  const devices = manifest ? Object.entries(manifest.devices) : []
  const device = manifest && deviceId ? manifest.devices[deviceId] : null

  function chooseDevice(id) {
    setDeviceId(id)
    try {
      localStorage.setItem('device', id)
    } catch {
      /* storage blocked */
    }
  }

  async function install() {
    if (!device) return
    const append = (s) => setLog((l) => [...l.slice(-500), s])
    setLog([])
    setError(null)
    setProgress(0)
    setPhase('running')
    setShowWifi(true)
    try {
      await session.ensurePort()
      const parts = await loadParts(manifest, deviceId, (name) => setStatus(`${t('install.download')} ${name}…`))
      append(`Firmware ${manifest.version} for ${device.label}: ${parts.map((p) => p.name).join(', ')}`)
      setStatus(t('install.connecting'))
      addLine(`— flashing ${device.label} ${manifest.version} —`, 'sys')
      await session.withPortReleased((port) =>
        flashDevice(port, {
          parts,
          baud: device.baud || 921600,
          flashMode: (device.flash && device.flash.mode) || 'dio',
          flashFreq: (device.flash && device.flash.freq) || '80m',
          eraseAll,
          log: append,
          progress: (fraction, label) => {
            setProgress(fraction)
            setStatus(label === 'erase' ? t('install.erasing') : label === 'done' ? t('install.done') : `${t('install.writing')} ${label}…`)
          },
        })
      )
      setPhase('done')
      setStatus(t('install.done'))
    } catch (err) {
      if (err && err.name === 'NotFoundError') {
        // user closed the port chooser
        setPhase('idle')
        setStatus('')
        return
      }
      setPhase('error')
      setError({ message: err.message || String(err), boot: err instanceof BootModeError })
      append(String(err && err.stack ? err.stack : err))
    }
  }

  if (!versions) return <p className="muted">{t('install.loading')}</p>
  if (versions.length === 0)
    return (
      <div className="card">
        <p>{t('install.noFirmware')}</p>
        {versionsError && <p className="muted small">{versionsError}</p>}
      </div>
    )

  return (
    <div className="stack">
      <section className="card">
        <h2>{t('install.step1')}</h2>
        {manifestError && <p className="error">{manifestError}</p>}
        <div className="device-grid">
          {devices.map(([id, d]) => (
            <button
              key={id}
              className={`device ${id === deviceId ? 'selected' : ''}`}
              onClick={() => chooseDevice(id)}
              disabled={phase === 'running'}
              aria-pressed={id === deviceId}
            >
              <img src={`devices/${id}.png`} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
              <span>{d.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>{t('install.step2')}</h2>
        <div className="row wrap">
          <label className="inline">
            {t('install.version')}
            <select value={selectedVersion} onChange={(e) => setVersion(e.target.value)} disabled={phase === 'running'}>
              {versions.map((v, i) => (
                <option key={v.version} value={v.version}>
                  {v.version}
                  {v.date ? ` (${v.date})` : ''}
                  {i === 0 ? ` – ${t('install.latest')}` : ''}
                </option>
              ))}
            </select>
          </label>
          {manifest && <span className="muted small">ESP32 core {manifest.core}</span>}
        </div>
        <label className="check">
          <input type="checkbox" checked={eraseAll} onChange={(e) => setEraseAll(e.target.checked)} disabled={phase === 'running'} />
          {t('install.erase')}
        </label>
      </section>

      <section className="card">
        <h2>{t('install.step3')}</h2>
        <button className="primary big" onClick={install} disabled={!device || phase === 'running'}>
          {phase === 'done' || phase === 'error' ? t('install.again') : t('install.start')}
        </button>
        {!device && <p className="muted small">{t('install.selectDevice')}</p>}
        {phase !== 'idle' && (
          <div className="progress-wrap">
            <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="muted">
              {status} {phase === 'running' && progress > 0 ? `${Math.round(progress * 100)}%` : ''}
            </p>
          </div>
        )}
        {error && (
          <div className="error-box">
            <strong>{t('install.failed')}:</strong> {error.message}
            {error.boot && <p>{t('install.bootHelp')}</p>}
          </div>
        )}
        {log.length > 0 && (
          <details>
            <summary>{t('install.log')}</summary>
            <pre className="log small" ref={logRef}>
              {log.join('\n')}
            </pre>
          </details>
        )}
      </section>

      {phase === 'done' && showWifi && (
        <section className="card">
          <h2>{t('wifi.title')}</h2>
          <WifiSetup waitForBoot onSkip={() => setShowWifi(false)} />
        </section>
      )}
    </div>
  )
}
