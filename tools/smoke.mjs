// Быстрая проверка «всё открывается»: поднимает копию сервера во временной папке и обходит экран и редактор.
// Запуск: npm run smoke [-- --data] [-- --out <папка>]
//   --data — взять копию рабочих data/ (без паролей, входов и медиатеки), иначе данные по умолчанию.
// Рабочие data/ и media/ только читаются. Перед запуском нужен dist/ (npm run build).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const withData = args.includes('--data')
const outArg = args.indexOf('--out')

if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  console.error('Нет dist/index.html — сначала npm run build')
  process.exit(1)
}

// копирование папки своей рекурсией (fs.cpSync на Windows падает на кириллических путях)
function copyDir(from, to, skip = () => false) {
  fs.mkdirSync(to, { recursive: true })
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip(e.name)) continue
    const a = path.join(from, e.name)
    const b = path.join(to, e.name)
    if (e.isDirectory()) copyDir(a, b, skip)
    else fs.copyFileSync(a, b)
  }
}

const freePort = (start) =>
  new Promise((resolve) => {
    const s = net.createServer()
    s.once('error', () => resolve(freePort(start + 1)))
    s.listen(start, () => s.close(() => resolve(start)))
  })

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tablo-smoke-'))
const outDir = outArg >= 0 ? path.resolve(args[outArg + 1]) : path.join(tmp, '..', path.basename(tmp) + '-shots')
fs.mkdirSync(outDir, { recursive: true })

const results = []
const check = (name, ok, info = '') => results.push({ name, ok, info })
let server = null
let browser = null

try {
  // копия сервера
  const copy = path.join(tmp, 'app')
  fs.mkdirSync(copy)
  for (const f of ['api.js', 'server.js', 'package.json']) fs.copyFileSync(path.join(ROOT, f), path.join(copy, f))
  for (const d of ['server', 'dist']) copyDir(path.join(ROOT, d), path.join(copy, d))
  fs.mkdirSync(path.join(copy, 'src'))
  fs.copyFileSync(path.join(ROOT, 'src', 'deckText.js'), path.join(copy, 'src', 'deckText.js'))
  if (withData && fs.existsSync(path.join(ROOT, 'data'))) {
    const secret = ['auth.json', 'sessions.json', 'users.json', 'media.json', 'backup.json']
    copyDir(path.join(ROOT, 'data'), path.join(copy, 'data'), (n) => secret.includes(n))
  }

  const port = await freePort(8090)
  const base = `http://localhost:${port}`
  let log = ''
  server = spawn(process.execPath, ['server.js'], { cwd: copy, env: { ...process.env, PORT: String(port) } })
  server.stdout.on('data', (d) => (log += d))
  server.stderr.on('data', (d) => (log += d))
  let up = false
  for (let i = 0; i < 50 && !up; i++) {
    try {
      await fetch(base + '/api/data'); up = true
    } catch {
      await new Promise((r) => setTimeout(r, 200))
    }
  }
  check('сервер запустился', up, up ? base : log.trim())
  if (!up) throw new Error('сервер не ответил')

  browser = await chromium.launch()
  const errors = []
  async function open(label, url, w, h, ready) {
    const page = await browser.newPage({ viewport: { width: w, height: h } })
    const errs = []
    page.on('pageerror', (e) => errs.push(e.message))
    page.on('console', (m) => m.type() === 'error' && !/background\.jpg/.test(m.location().url || '') && !/status of 404/.test(m.text()) && errs.push(m.text()))
    page.on('response', (r) => r.status() >= 400 && !/\/(background\.jpg|api\/(data|playlist|decks))$/.test(r.url()) && errs.push(`${r.status()} ${r.url()}`))
    await page.route('**/api/screens', (r) => (r.request().method() === 'POST' ? r.fulfill({ json: { ok: true } }) : r.continue()))
    let ok = false
    let info = ''
    try {
      await page.goto(base + url)
      await page.waitForSelector(ready, { timeout: 5000 })
      await page.waitForTimeout(800)
      ok = true
    } catch (e) {
      info = `не появилось «${ready}» за 5 с`
    }
    await page.screenshot({ path: path.join(outDir, label.replace(/[^\wа-я]+/gi, '_') + '.png') })
    check(label, ok, info)
    check(label + ': без ошибок консоли', errs.length === 0, errs.slice(0, 3).join(' | '))
    errors.push(...errs)
    await page.close()
  }

  await open('экран 1920×1080', '/', 1920, 1080, '.slide.active')
  await open('экран 1280×720', '/', 1280, 720, '.slide.active')
  for (const s of ['schedule', 'playlist', 'decks', 'media']) {
    await open(`редактор #${s}`, `/admin#${s}`, 1600, 900, '.nav-btn.on ~ *, .nav-btn.on, main.work > *')
  }
} catch (e) {
  check('прогон', false, e.message)
} finally {
  if (browser) await browser.close().catch(() => {})
  if (server) {
    server.kill()
    await new Promise((r) => (server.exitCode !== null ? r() : server.once('exit', r)))
  }
  for (let i = 0; i < 5; i++) {
    try {
      fs.rmSync(tmp, { recursive: true, force: true })
      break
    } catch {
      await new Promise((r) => setTimeout(r, 300))
    }
  }
}

console.log('\nЧто проверено:')
for (const r of results) console.log(`  ${r.ok ? 'ок    ' : 'ОШИБКА'}  ${r.name}${r.ok || !r.info ? '' : ' — ' + r.info}`)
console.log('\nСкриншоты:', outDir)
const bad = results.filter((r) => !r.ok).length
console.log(bad ? `\nПровалено проверок: ${bad}` : '\nВсё в порядке')
process.exit(bad ? 1 : 0)
