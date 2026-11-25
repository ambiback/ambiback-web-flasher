import { useEffect, useRef, useState } from 'react'
import { useLang } from '../i18n.jsx'
import { useSerial } from '../SerialContext.jsx'
import { wifiCommand } from '../serial/ambiCommands.js'

const UI_URL = 'https://ambiback.github.io/ambiback-ui/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Wi-Fi setup over Improv, with the AmbiBack %WIFI: command as fallback for older firmware.
export default function WifiSetup({ waitForBoot = false, onSkip }) {
  const { t } = useLang()
  const { session, improv } = useSerial()
  const [mode, setMode] = useState('probe') // probe | improv | legacy
  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const [networks, setNetworks] = useState([])
  const [busy, setBusy] = useState(null) // scan | connect
  const [result, setResult] = useState(null) // { ok, urls?, legacy?, error? }
  const probed = useRef(false)

  useEffect(() => {
    if (probed.current) return
    probed.current = true
    ;(async () => {
      try {
        if (!session.isOpen) await session.open(115200)
        // After flashing the device boots for a few seconds before Improv answers.
        const tries = waitForBoot ? 5 : 2
        for (let i = 0; i < tries; i++) {
          try {
            await improv.getState(1500)
            setMode('improv')
            return
          } catch {
            await sleep(500)
          }
        }
      } catch {
        /* no port */
      }
      setMode('legacy')
    })()
  }, [session, improv, waitForBoot])

  async function scan() {
    setBusy('scan')
    try {
      const list = await improv.scan()
      const best = new Map()
      for (const n of list) if (!best.has(n.ssid) || best.get(n.ssid).rssi < n.rssi) best.set(n.ssid, n)
      setNetworks([...best.values()].sort((a, b) => b.rssi - a.rssi))
    } catch {
      setNetworks([])
    }
    setBusy(null)
  }

  async function connect(e) {
    e.preventDefault()
    setBusy('connect')
    setResult(null)
    try {
      if (mode === 'improv') {
        const urls = await improv.provision(ssid, password)
        setResult({ ok: true, urls })
      } else {
        await session.write(wifiCommand(ssid, password))
        setResult({ ok: true, legacy: true })
      }
    } catch (err) {
      setResult({ ok: false, error: err.message })
    }
    setBusy(null)
  }

  if (mode === 'probe') return <p className="muted">{t('wifi.checking')}</p>

  const url = result && result.urls && result.urls.find((u) => /^https?:\/\//.test(u))

  return (
    <div className="wifi">
      <form onSubmit={connect} className="form-grid">
        <label>
          {t('wifi.ssid')}
          <div className="row">
            <input
              list="wifi-networks"
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              maxLength={32}
              required
              autoComplete="off"
            />
            {mode === 'improv' && (
              <button type="button" className="secondary" onClick={scan} disabled={!!busy}>
                {busy === 'scan' ? t('wifi.scanning') : t('wifi.scan')}
              </button>
            )}
          </div>
          <datalist id="wifi-networks">
            {networks.map((n) => (
              <option key={n.ssid} value={n.ssid}>
                {n.rssi} dBm{n.secured ? ' 🔒' : ''}
              </option>
            ))}
          </datalist>
        </label>
        <label>
          {t('wifi.password')}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={63}
            autoComplete="off"
          />
        </label>
        <div className="row">
          <button type="submit" disabled={!!busy || !ssid}>
            {t('wifi.connect')}
          </button>
          {onSkip && (
            <button type="button" className="secondary" onClick={onSkip} disabled={busy === 'connect'}>
              {t('wifi.skip')}
            </button>
          )}
        </div>
      </form>
      {busy === 'connect' && <p className="muted">{t('wifi.connecting')}</p>}
      {result && result.ok && result.legacy && <p className="note">{t('wifi.legacy')}</p>}
      {result && result.ok && !result.legacy && (
        <div className="success">
          <p>{t('wifi.ok')}</p>
          {url && (
            <p>
              <a href={url} target="_blank" rel="noreferrer">
                {t('wifi.open')}: {url}
              </a>
            </p>
          )}
          <p>
            <a href={UI_URL} target="_blank" rel="noreferrer">
              {t('wifi.ui')}
            </a>
          </p>
        </div>
      )}
      {result && !result.ok && (
        <p className="error">
          {t('wifi.failed')}: {result.error}
        </p>
      )}
    </div>
  )
}
