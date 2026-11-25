/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { SerialSession } from './serial/port.js'
import { LineSplitter } from './serial/lineSplitter.js'
import { ImprovClient } from './serial/improvClient.js'
import { parseBanner } from './serial/ambiCommands.js'
import { LogStore } from './logStore.js'
import { findDeviceByDefine, loadIndex, loadManifest, loadSymbols } from './firmware/catalog.js'

const SerialContext = createContext(null)

export function SerialProvider({ children }) {
  const [session] = useState(() => new SerialSession())
  const [log] = useState(() => new LogStore())
  const [improv] = useState(() => new ImprovClient(session))

  const [portState, setPortState] = useState({ hasPort: false, isOpen: false, baud: 115200 })
  const [versions, setVersions] = useState(null)
  const [versionsError, setVersionsError] = useState(null)
  const [banner, setBanner] = useState(null)
  const [symbols, setSymbols] = useState(null) // { map, deviceId, version }
  const logVersion = useSyncExternalStore(log.subscribe, log.getVersion)

  useEffect(() => {
    loadIndex()
      .then(setVersions)
      .catch((e) => {
        setVersions([])
        setVersionsError(e.message)
      })
  }, [])

  const loadSymbolsFor = useCallback(
    async (version, deviceId) => {
      const entry = (versions || []).find((v) => v.version === version)
      if (!entry) throw new Error('Version ' + version + ' is not on this site')
      const manifest = await loadManifest(entry)
      const map = await loadSymbols(manifest, deviceId)
      if (!map) throw new Error('No symbol map for ' + deviceId)
      setSymbols({ map, deviceId, version })
      return map
    },
    [versions]
  )

  // Banner seen -> remember the device and load its symbols when this site has that version.
  useEffect(() => {
    if (!banner || !versions) return
    const entry = versions.find((v) => v.version === banner.version)
    if (!entry) return
    loadManifest(entry)
      .then((manifest) => {
        const deviceId = findDeviceByDefine(manifest, banner.define)
        return deviceId ? loadSymbolsFor(banner.version, deviceId) : null
      })
      .catch(() => {
        /* decoding just stays off */
      })
  }, [banner, versions, loadSymbolsFor])

  useEffect(() => {
    const splitter = new LineSplitter((line) => {
      log.add(line)
      const b = parseBanner(line)
      if (b) setBanner(b)
    })
    const offData = session.onData((bytes) => splitter.push(bytes))
    const offState = session.onState((s) => {
      setPortState(s)
      if (s.error === 'disconnected') log.add('— device disconnected —', 'sys')
    })
    const onDisconnect = (e) => {
      if (e.target === session.port) session.forget()
    }
    if (navigator.serial) navigator.serial.addEventListener('disconnect', onDisconnect)
    // Dev only: lets tests feed fake serial data (window.__ambiback.feed('text\n')).
    if (import.meta.env.DEV) {
      window.__ambiback = {
        feed: (text) => {
          const bytes = new TextEncoder().encode(text)
          for (const fn of session.dataListeners) fn(bytes)
        },
      }
    }
    return () => {
      offData()
      offState()
      if (navigator.serial) navigator.serial.removeEventListener('disconnect', onDisconnect)
    }
  }, [session, log])

  const value = {
    session,
    improv,
    portState,
    versions,
    versionsError,
    banner,
    symbols,
    loadSymbolsFor,
    log,
    logVersion,
    addLine: (text, kind) => log.add(text, kind),
  }
  return <SerialContext.Provider value={value}>{children}</SerialContext.Provider>
}

export const useSerial = () => useContext(SerialContext)
