import { useState } from 'react'
import { useLang } from '../i18n.jsx'
import { useSerial } from '../SerialContext.jsx'
import { factoryDefaultCommand, infoCommand, ledTestCommand, rebootCommand } from '../serial/ambiCommands.js'
import WifiSetup from '../components/WifiSetup.jsx'

export default function DevicePage() {
  const { t } = useLang()
  const { session, improv, portState, addLine } = useSerial()
  const [message, setMessage] = useState(null)
  const [improvInfo, setImprovInfo] = useState(null)
  const [wifiKey, setWifiKey] = useState(0)

  async function run(label, fn) {
    setMessage(null)
    try {
      if (!session.isOpen) await session.open(115200)
      addLine(`→ ${label}`, 'sys')
      await fn()
      setMessage({ ok: true, text: t('device.sent') })
    } catch (e) {
      if (e && e.name === 'NotFoundError') return
      setMessage({ ok: false, text: e.message })
    }
  }

  const send = (label, bytes) => run(label, () => session.write(bytes))

  async function askImprov() {
    setImprovInfo(null)
    try {
      if (!session.isOpen) await session.open(115200)
      setImprovInfo(await improv.getInfo())
    } catch {
      setImprovInfo({ none: true })
    }
  }

  const disabled = !!portState.busy

  return (
    <div className="stack">
      {!portState.hasPort && <p className="note">{t('device.needPort')}</p>}
      <section className="card">
        <div className="button-grid">
          <button onClick={() => send('%INFO:', infoCommand())} disabled={disabled}>
            {t('device.info')}
          </button>
          <button onClick={() => send('%LEDDATA:', ledTestCommand())} disabled={disabled}>
            {t('device.ledtest')}
          </button>
          <button onClick={() => send('%REBOOT:', rebootCommand())} disabled={disabled}>
            {t('device.reboot')}
          </button>
          <button onClick={() => run('reset', () => session.hardReset())} disabled={disabled}>
            {t('device.reset')}
          </button>
          <button
            className="danger"
            onClick={() => window.confirm(t('device.factoryConfirm')) && send('%FACTORYDEFAULT:', factoryDefaultCommand())}
            disabled={disabled}
          >
            {t('device.factory')}
          </button>
        </div>
        {message && <p className={message.ok ? 'muted small' : 'error'}>{message.text}</p>}
      </section>

      <section className="card">
        <h3>{t('device.improv')}</h3>
        <button className="secondary" onClick={askImprov} disabled={disabled}>
          {t('device.improvAsk')}
        </button>
        {improvInfo && improvInfo.none && <p className="muted small">{t('device.improvNone')}</p>}
        {improvInfo && !improvInfo.none && (
          <dl className="kv">
            <dt>Firmware</dt>
            <dd>{improvInfo.firmware}</dd>
            <dt>Version</dt>
            <dd>{improvInfo.version}</dd>
            <dt>Chip</dt>
            <dd>{improvInfo.chip}</dd>
            <dt>Name</dt>
            <dd>{improvInfo.name}</dd>
          </dl>
        )}
      </section>

      <section className="card">
        <h3>{t('device.wifi')}</h3>
        {portState.hasPort ? (
          <WifiSetup key={wifiKey} />
        ) : (
          <button onClick={() => session.requestPort().then(() => setWifiKey((k) => k + 1)).catch(() => {})}>{t('port.connect')}</button>
        )}
      </section>
    </div>
  )
}
