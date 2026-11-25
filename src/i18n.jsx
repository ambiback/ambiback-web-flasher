/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useState } from 'react'

const texts = {
  'app.title': ['AmbiBack Web Flasher', 'AmbiBack Web Flasher'],
  'app.tagline': [
    'Install AmbiBack firmware over USB, right in the browser.',
    'AmbiBack-Firmware per USB installieren, direkt im Browser.',
  ],
  'tab.install': ['Install', 'Installieren'],
  'tab.monitor': ['Serial monitor', 'Serieller Monitor'],
  'tab.device': ['Device', 'Gerät'],
  'browser.unsupported': [
    'This browser cannot access USB serial ports. Please use Chrome, Edge or Opera on a desktop computer (Windows, macOS, Linux, ChromeOS).',
    'Dieser Browser kann nicht auf serielle USB-Ports zugreifen. Bitte Chrome, Edge oder Opera auf einem Desktop-Computer verwenden (Windows, macOS, Linux, ChromeOS).',
  ],
  'browser.insecure': [
    'Web Serial needs a secure page (https or localhost).',
    'Web Serial braucht eine sichere Seite (https oder localhost).',
  ],
  'port.connect': ['Connect device', 'Gerät verbinden'],
  'port.change': ['Change port', 'Port wechseln'],
  'port.disconnect': ['Disconnect', 'Trennen'],
  'port.none': ['No device connected', 'Kein Gerät verbunden'],
  'port.connected': ['Connected', 'Verbunden'],
  'port.closed': ['Port selected, closed', 'Port gewählt, geschlossen'],
  'port.busy': ['Flashing…', 'Flashen…'],
  'port.lost': ['The device was unplugged.', 'Das Gerät wurde abgesteckt.'],
  'install.step1': ['1. Choose your device', '1. Gerät wählen'],
  'install.step2': ['2. Choose the firmware version', '2. Firmware-Version wählen'],
  'install.step3': ['3. Install', '3. Installieren'],
  'install.loading': ['Loading firmware list…', 'Firmware-Liste wird geladen…'],
  'install.noFirmware': [
    'No firmware builds are published on this site yet.',
    'Auf dieser Seite sind noch keine Firmware-Builds veröffentlicht.',
  ],
  'install.version': ['Version', 'Version'],
  'install.latest': ['newest', 'neueste'],
  'install.erase': [
    'Erase the whole flash first (removes all saved settings, including Wi-Fi)',
    'Zuerst den ganzen Flash löschen (entfernt alle Einstellungen, auch WLAN)',
  ],
  'install.start': ['Install firmware', 'Firmware installieren'],
  'install.selectDevice': ['Choose a device first.', 'Bitte zuerst ein Gerät wählen.'],
  'install.download': ['Downloading', 'Lade herunter'],
  'install.connecting': ['Connecting to the ESP32…', 'Verbinde mit dem ESP32…'],
  'install.writing': ['Writing', 'Schreibe'],
  'install.erasing': ['Erasing flash…', 'Lösche Flash…'],
  'install.done': ['Firmware installed.', 'Firmware installiert.'],
  'install.failed': ['Installation failed', 'Installation fehlgeschlagen'],
  'install.bootHelp': [
    'The ESP32 did not answer. Hold the BOOT (IO0) button, press and release RESET (EN), release BOOT, then try again. Check that the USB cable carries data and that the USB driver (CP210x or CH340) is installed.',
    'Der ESP32 hat nicht geantwortet. BOOT-Taste (IO0) halten, RESET (EN) kurz drücken, BOOT loslassen und erneut versuchen. Prüfen, ob das USB-Kabel Daten überträgt und der USB-Treiber (CP210x oder CH340) installiert ist.',
  ],
  'install.log': ['Details', 'Details'],
  'install.again': ['Install again', 'Erneut installieren'],
  'wifi.title': ['4. Connect to Wi-Fi', '4. Mit WLAN verbinden'],
  'wifi.checking': ['Waiting for the device to start…', 'Warte auf den Start des Geräts…'],
  'wifi.ssid': ['Network (SSID)', 'Netzwerk (SSID)'],
  'wifi.password': ['Password', 'Passwort'],
  'wifi.scan': ['Search networks', 'Netzwerke suchen'],
  'wifi.scanning': ['Searching…', 'Suche…'],
  'wifi.connect': ['Connect', 'Verbinden'],
  'wifi.connecting': ['Connecting… this can take up to 30 seconds.', 'Verbinde… das kann bis zu 30 Sekunden dauern.'],
  'wifi.skip': ['Skip', 'Überspringen'],
  'wifi.ok': ['The device is connected.', 'Das Gerät ist verbunden.'],
  'wifi.open': ['Open the device', 'Gerät öffnen'],
  'wifi.legacy': [
    'This firmware has no Improv support. The settings were sent with the AmbiBack serial command; check the serial monitor for the result.',
    'Diese Firmware unterstützt Improv nicht. Die Daten wurden mit dem AmbiBack-Seriellbefehl gesendet; das Ergebnis steht im seriellen Monitor.',
  ],
  'wifi.failed': ['Wi-Fi setup failed', 'WLAN-Einrichtung fehlgeschlagen'],
  'wifi.ui': ['Control it with the AmbiBack UI', 'Mit der AmbiBack-Oberfläche steuern'],
  'monitor.baud': ['Baud rate', 'Baudrate'],
  'monitor.filter': ['Filter', 'Filter'],
  'monitor.pause': ['Pause', 'Pause'],
  'monitor.resume': ['Resume', 'Weiter'],
  'monitor.clear': ['Clear', 'Leeren'],
  'monitor.save': ['Save log', 'Log speichern'],
  'monitor.time': ['Timestamps', 'Zeitstempel'],
  'monitor.autoscroll': ['Auto scroll', 'Automatisch scrollen'],
  'monitor.reset': ['Reset device', 'Gerät neu starten'],
  'monitor.empty': [
    'Connect a device to see its output.',
    'Gerät verbinden, um seine Ausgabe zu sehen.',
  ],
  'symbols.title': ['Crash decoding', 'Absturz-Auswertung'],
  'symbols.none': [
    'No symbol map loaded. It loads automatically when the device prints its version at boot, or choose one here.',
    'Keine Symboltabelle geladen. Sie wird automatisch geladen, wenn das Gerät beim Start seine Version ausgibt, oder hier wählen.',
  ],
  'symbols.loaded': ['Symbols loaded for', 'Symbole geladen für'],
  'symbols.mismatch': [
    'The build ID of the device differs from the symbol map; decoded names may be wrong.',
    'Die Build-ID des Geräts passt nicht zur Symboltabelle; die Namen können falsch sein.',
  ],
  'symbols.load': ['Load', 'Laden'],
  'symbols.unknown': ['unknown', 'unbekannt'],
  'device.info': ['Show info', 'Info anzeigen'],
  'device.reboot': ['Reboot (command)', 'Neustart (Befehl)'],
  'device.reset': ['Hardware reset', 'Hardware-Reset'],
  'device.factory': ['Factory defaults', 'Werkseinstellungen'],
  'device.factoryConfirm': [
    'Reset all settings of the device to factory defaults? Wi-Fi settings are lost too.',
    'Alle Einstellungen des Geräts auf Werkseinstellungen zurücksetzen? Auch die WLAN-Daten gehen verloren.',
  ],
  'device.ledtest': ['LED test', 'LED-Test'],
  'device.wifi': ['Wi-Fi settings', 'WLAN-Einstellungen'],
  'device.improv': ['Improv device info', 'Improv-Geräteinfo'],
  'device.improvNone': ['No answer to Improv (older firmware).', 'Keine Antwort auf Improv (ältere Firmware).'],
  'device.improvAsk': ['Ask device', 'Gerät fragen'],
  'device.sent': ['Sent. The answer appears in the serial monitor.', 'Gesendet. Die Antwort erscheint im seriellen Monitor.'],
  'device.needPort': ['Connect a device first.', 'Bitte zuerst ein Gerät verbinden.'],
  'help.title': ['Help', 'Hilfe'],
  'help.drivers': [
    'Windows needs a USB driver for most boards: Silicon Labs CP210x or WCH CH340/CH9102. macOS and Linux usually have them built in.',
    'Windows braucht für die meisten Boards einen USB-Treiber: Silicon Labs CP210x oder WCH CH340/CH9102. macOS und Linux bringen ihn meist mit.',
  ],
  'help.port': [
    'If no port shows up in the list: use another cable (many are charge-only), another USB port, and close other programs that use the port (Arduino IDE, AmbiBack USB Flasher, serial terminals).',
    'Wenn kein Port in der Liste erscheint: anderes Kabel (viele laden nur), anderen USB-Port verwenden und andere Programme schließen, die den Port nutzen (Arduino IDE, AmbiBack USB Flasher, Terminal-Programme).',
  ],
  'help.boot': [
    'Some camera boards have no automatic boot mode. Hold BOOT (IO0), tap RESET, release BOOT, then start the installation.',
    'Manche Kamera-Boards haben keinen automatischen Boot-Modus. BOOT (IO0) halten, RESET kurz drücken, BOOT loslassen, dann die Installation starten.',
  ],
  'help.privacy': [
    'Everything runs in your browser. Wi-Fi passwords go straight to the device over USB and are not sent anywhere else.',
    'Alles läuft im Browser. WLAN-Passwörter gehen direkt per USB an das Gerät und werden nirgendwo sonst hin gesendet.',
  ],
  'footer.desktop': ['Developers: build your own firmware with the', 'Entwickler: eigene Firmware bauen mit dem'],
  'footer.firmware': ['firmware', 'Firmware'],
}

const LangContext = createContext({ lang: 'en', setLang: () => {}, t: (k) => k })

function initialLang() {
  try {
    const saved = localStorage.getItem('lang')
    if (saved === 'en' || saved === 'de') return saved
  } catch {
    /* storage blocked */
  }
  return (navigator.language || '').toLowerCase().startsWith('de') ? 'de' : 'en'
}

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(initialLang)
  const value = useMemo(() => {
    const idx = lang === 'de' ? 1 : 0
    return {
      lang,
      setLang: (l) => {
        setLangState(l)
        try {
          localStorage.setItem('lang', l)
        } catch {
          /* storage blocked */
        }
      },
      t: (key) => (texts[key] ? texts[key][idx] : key),
    }
  }, [lang])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export const useLang = () => useContext(LangContext)
