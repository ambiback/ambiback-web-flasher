# AmbiBack Web Flasher – Agent Guide

Browser app (React 19 + Vite 7, plain JavaScript) that flashes AmbiBack firmware over Web Serial, shows a serial monitor, decodes crash backtraces and sets Wi-Fi over Improv. Deployed to GitHub Pages.

## Contracts with ambiback-firmware

The firmware repo's `release-builds` workflow produces `ambiback-firmware-<version>.zip`:

- `manifest.json` (schema 1): `version`, `core`, `date`, `devices.<id>` with `label`, `define` (ESP32_DEVICE_TYPE name), `baud`, `flash.mode/freq`, `parts[] {offset, path, sha256}`, `symbols`, `buildId`.
- `<id>/symbols.json`: `{version, buildId, device, symbols: [[start, size, function, "file:line"], …]}` sorted by start.
- Boot banner on Serial: `[AmbiBack] version=<v> build=<id> device=<define>`.
- Serial commands: `%NAME:` + raw UTF-8 data, strings end with 0x00, **no length prefix** (`ambiback-firmware/docs/serial-protocol.md`).

Change both sides together when one of these changes. `src/firmware/catalog.js` and `scripts/fetch-firmware.mjs` read the manifest; `src/serial/ambiCommands.js` has the banner parser and commands.

## Rules

- Only one reader may own the serial port. Use `SerialSession.withPortReleased()` for esptool-js; never read the port elsewhere.
- Every user-visible text goes through `t()` in `src/i18n.jsx`, in English and German.
- Keep protocol code free of React and covered by `test/*.test.js` (`npm test`).
- Before committing: `npm run lint && npm test && npm run build`.
- Device pictures are named `public/devices/<id>.png` after the manifest device id.
