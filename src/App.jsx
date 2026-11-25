import { useState } from 'react'
import { useLang } from './i18n.jsx'
import { useSerial } from './SerialContext.jsx'
import { isWebSerialSupported } from './serial/port.js'
import InstallPage from './pages/InstallPage.jsx'
import MonitorPage from './pages/MonitorPage.jsx'
import DevicePage from './pages/DevicePage.jsx'

const TABS = [
  { id: 'install', label: 'tab.install', Page: InstallPage },
  { id: 'monitor', label: 'tab.monitor', Page: MonitorPage },
  { id: 'device', label: 'tab.device', Page: DevicePage },
]

function initialTab() {
  const id = window.location.hash.replace('#', '')
  return TABS.some((t) => t.id === id) ? id : 'install'
}

export default function App() {
  const { t, lang, setLang } = useLang()
  const [tab, setTab] = useState(initialTab)
  const supported = isWebSerialSupported()

  function choose(id) {
    setTab(id)
    window.history.replaceState(null, '', '#' + id)
  }

  const Page = TABS.find((x) => x.id === tab).Page

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>{t('app.title')}</h1>
          <p className="muted">{t('app.tagline')}</p>
        </div>
        <div className="lang">
          {['en', 'de'].map((l) => (
            <button key={l} className={l === lang ? 'active' : ''} onClick={() => setLang(l)} aria-pressed={l === lang}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      {!window.isSecureContext && <div className="error-box">{t('browser.insecure')}</div>}
      {!supported && <div className="error-box">{t('browser.unsupported')}</div>}

      {supported && (
        <>
          <PortBar />
          <nav className="tabs" role="tablist">
            {TABS.map((x) => (
              <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'active' : ''} onClick={() => choose(x.id)}>
                {t(x.label)}
              </button>
            ))}
          </nav>
          <main>
            <Page />
          </main>
        </>
      )}

      <Help />

      <footer className="footer muted small">
        {t('footer.desktop')} <a href="https://github.com/ambiback/ambiback-flasher">AmbiBack USB Flasher</a> ·{' '}
        <a href="https://github.com/ambiback/ambiback-firmware">AmbiBack {t('footer.firmware')}</a> ·{' '}
        <a href="https://github.com/ambiback/ambiback-web-flasher">Source</a> · v{__APP_VERSION__}
      </footer>
    </div>
  )
}

const KNOWN_VENDORS = { 0x10c4: 'Silicon Labs CP210x', 0x1a86: 'WCH CH340', 0x0403: 'FTDI', 0x303a: 'Espressif USB' }

function PortBar() {
  const { t } = useLang()
  const { session, portState } = useSerial()
  const [error, setError] = useState(null)

  async function connect() {
    setError(null)
    try {
      await session.requestPort()
      await session.open(115200)
    } catch (e) {
      if (e.name !== 'NotFoundError') setError(e.message)
    }
  }

  const info = portState.info
  const name = info && info.usbVendorId ? KNOWN_VENDORS[info.usbVendorId] || `USB ${info.usbVendorId.toString(16)}:${(info.usbProductId || 0).toString(16)}` : ''

  let stateText = t('port.none')
  let dot = 'off'
  if (portState.busy) {
    stateText = t('port.busy')
    dot = 'busy'
  } else if (portState.isOpen) {
    stateText = `${t('port.connected')} · ${portState.baud} baud`
    dot = 'on'
  } else if (portState.hasPort) {
    stateText = t('port.closed')
  }

  return (
    <div className="portbar">
      <span className={`dot ${dot}`} aria-hidden="true" />
      <span className="grow">
        {stateText}
        {name && <span className="muted"> · {name}</span>}
        {portState.error === 'disconnected' && <span className="error"> · {t('port.lost')}</span>}
      </span>
      <button onClick={connect} disabled={portState.busy}>
        {portState.hasPort ? t('port.change') : t('port.connect')}
      </button>
      {portState.hasPort && (
        <button className="secondary" onClick={() => session.forget()} disabled={portState.busy}>
          {t('port.disconnect')}
        </button>
      )}
      {error && <span className="error small">{error}</span>}
    </div>
  )
}

function Help() {
  const { t } = useLang()
  return (
    <details className="card help">
      <summary>{t('help.title')}</summary>
      <ul>
        <li>{t('help.drivers')}</li>
        <li>{t('help.port')}</li>
        <li>{t('help.boot')}</li>
        <li>{t('help.privacy')}</li>
      </ul>
    </details>
  )
}
