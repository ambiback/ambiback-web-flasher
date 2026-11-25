#!/usr/bin/env node
// Copies AmbiBack firmware builds into public/firmware/ so the site serves them same-origin.
//
//   node scripts/fetch-firmware.mjs                    newest releases of ambiback/ambiback-firmware
//   node scripts/fetch-firmware.mjs --count 3          keep only the 3 newest versions
//   node scripts/fetch-firmware.mjs --zip build.zip    add a local ambiback-firmware-<version>.zip (CI artifact)
//   node scripts/fetch-firmware.mjs --run 1234567890   add the "ambiback-firmware" artifact of a workflow run (needs gh CLI)
//
// GITHUB_TOKEN is used for API calls when set (higher rate limit).

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const outDir = join(root, 'public', 'firmware')

const args = process.argv.slice(2)
const opt = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : def
}
const all = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []))

const repo = opt('--repo', 'ambiback/ambiback-firmware')
const count = Number(opt('--count', '5'))
const zips = all('--zip')
const runs = all('--run')
const skipReleases = args.includes('--no-releases') || zips.length > 0 || runs.length > 0

mkdirSync(outDir, { recursive: true })

// temp dir may be on another drive, so copy instead of rename
function moveDir(from, to) {
  cpSync(from, to, { recursive: true })
  rmSync(from, { recursive: true, force: true })
}

function extract(zipFile, dest) {
  mkdirSync(dest, { recursive: true })
  try {
    execFileSync('unzip', ['-q', '-o', zipFile, '-d', dest], { stdio: 'inherit' })
  } catch {
    execFileSync('tar', ['-xf', zipFile, '-C', dest], { stdio: 'inherit' })
  }
}

// Find the folder that holds manifest.json (zips may have one top-level folder).
function findManifestDir(dir) {
  if (existsSync(join(dir, 'manifest.json'))) return dir
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      const found = findManifestDir(p)
      if (found) return found
    }
  }
  return null
}

function verify(dir, manifest) {
  if (manifest.schema !== 1) throw new Error('unsupported manifest schema ' + manifest.schema)
  for (const [id, device] of Object.entries(manifest.devices)) {
    for (const part of device.parts) {
      const file = join(dir, part.path)
      if (!existsSync(file)) throw new Error(`${id}: missing ${part.path}`)
      if (part.sha256) {
        const hash = createHash('sha256').update(readFileSync(file)).digest('hex')
        if (hash !== part.sha256.toLowerCase()) throw new Error(`${id}: checksum mismatch ${part.path}`)
      }
    }
  }
}

function addZip(zipFile, meta = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'ambiback-fw-'))
  try {
    extract(zipFile, tmp)
    const dir = findManifestDir(tmp)
    if (!dir) throw new Error('no manifest.json in ' + zipFile)
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
    verify(dir, manifest)
    if (meta.channel) manifest.channel = meta.channel
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
    const dest = join(outDir, manifest.version)
    rmSync(dest, { recursive: true, force: true })
    moveDir(dir, dest)
    console.log(`added ${manifest.version} (${Object.keys(manifest.devices).length} devices)`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

async function download(url, file) {
  const headers = { 'User-Agent': 'ambiback-web-flasher' }
  if (process.env.GITHUB_TOKEN && url.startsWith('https://api.github.com')) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
}

async function fetchReleases() {
  const headers = { 'User-Agent': 'ambiback-web-flasher', Accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, { headers })
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  const releases = (await res.json()).filter((r) => !r.draft)
  let taken = 0
  for (const r of releases) {
    if (taken >= count) break
    const asset = r.assets.find((a) => /^ambiback-firmware-.+\.zip$/.test(a.name))
    if (!asset) continue
    const tmp = mkdtempSync(join(tmpdir(), 'ambiback-dl-'))
    try {
      const file = join(tmp, asset.name)
      console.log(`downloading ${r.tag_name}: ${asset.name}`)
      await download(asset.browser_download_url, file)
      addZip(file, { channel: r.prerelease ? 'beta' : 'stable' })
      taken++
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }
  if (taken === 0) console.log(`no release of ${repo} has an ambiback-firmware-*.zip asset yet`)
}

function addRun(runId) {
  const tmp = mkdtempSync(join(tmpdir(), 'ambiback-run-'))
  try {
    execFileSync('gh', ['run', 'download', runId, '--repo', repo, '--name', 'ambiback-firmware', '--dir', tmp], { stdio: 'inherit' })
    const zip = readdirSync(tmp).find((n) => n.endsWith('.zip'))
    if (zip) addZip(join(tmp, zip), { channel: 'dev' })
    else {
      // artifact already unpacked by gh
      const dir = findManifestDir(tmp)
      if (!dir) throw new Error('artifact has no manifest.json')
      const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
      verify(dir, manifest)
      manifest.channel = 'dev'
      writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
      const dest = join(outDir, manifest.version)
      rmSync(dest, { recursive: true, force: true })
      moveDir(dir, dest)
      console.log(`added ${manifest.version} from run ${runId}`)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

function compareVersions(a, b) {
  const pa = a.split(/[.-]/).map((x) => (isNaN(x) ? x : Number(x)))
  const pb = b.split(/[.-]/).map((x) => (isNaN(x) ? x : Number(x)))
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === pb[i]) continue
    if (pa[i] === undefined) return -1
    if (pb[i] === undefined) return 1
    return pa[i] < pb[i] ? -1 : 1
  }
  return 0
}

function writeIndex() {
  const versions = []
  for (const name of readdirSync(outDir)) {
    const file = join(outDir, name, 'manifest.json')
    if (!existsSync(file)) continue
    const m = JSON.parse(readFileSync(file, 'utf8'))
    versions.push({ version: m.version, date: m.date || null, channel: m.channel || 'stable', core: m.core || null, path: `${name}/` })
  }
  versions.sort((a, b) => compareVersions(b.version, a.version))
  writeFileSync(join(outDir, 'index.json'), JSON.stringify({ schema: 1, versions }, null, 2))
  console.log(`index.json: ${versions.map((v) => v.version).join(', ') || '(empty)'}`)
}

for (const z of zips) addZip(resolve(z), { channel: 'dev' })
for (const r of runs) addRun(r)
if (!skipReleases) await fetchReleases()
writeIndex()
