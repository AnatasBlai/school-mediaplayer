// Резервные копии data/ и media/ в папку, которую указали в редакторе (раздел «Медиатека» → «Резервная копия»).
// Настройки и итог последней копии — data/backup.json. В папке копии:
//   data/<ГГГГ-ММ-ДД_ЧЧ-ММ-СС>/  — снимок json-файлов из data/ (хранятся последние KEEP снимков)
//   media/                       — зеркало media/: докопируются новые и изменившиеся файлы, удалённые не стираются
//   README.txt                   — как восстановить вручную
// API:
//   GET  /api/backup          → настройки, состояние, сведения о папке (снимки, место на диске)
//   GET  /api/backup/drives   → диски компьютера со свободным местом (подсказки для пути)
//   POST /api/backup/check    { dir } → можно ли писать в папку, есть ли там уже копии
//   PUT  /api/backup          { dir, period, move } — сохранить; move — перенести копии из старой папки в новую
//   POST /api/backup/run      — сделать копию сейчас
//   POST /api/backup/restore  { name, files? } — вернуть данные из снимка (files — только эти json; нет — все); перед этим текущие данные тоже сохраняются
//   GET  /api/backup/snapshot/<имя>/<файл>.json → содержимое файла из снимка (только после входа, имя и файл строго проверяются → 400)
//   GET  /api/backup/mirror   → { files } — что лежит в зеркале media/ папки копий (только после входа; для предпросмотра возврата)
// Ход работы — SSE 'backup' (клиент перечитывает GET /api/backup).
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { broadcast } from './events.js'
import { logEvent, resetGroups } from './journal.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(ROOT, 'data')
const MEDIA = path.join(ROOT, 'media')
const FILE = path.join(DATA, 'backup.json')
const KEEP = 30 // сколько снимков data/ хранить
const PERIODS = { off: 0, day: 24 * 3600e3, week: 7 * 24 * 3600e3, month: 30 * 24 * 3600e3 }
const RETRY = 3600e3 // после ошибки — повтор не чаще раза в час
// файлы data/, которые попадают в снимок (backup.json — настройки самой копии; auth.json, users.json и sessions.json — пароли и входы, screens.json — список экранов,
// их в копии не кладём и не восстанавливаем)
const isDataFile = (f) => f.endsWith('.json') && !['backup.json', 'auth.json', 'users.json', 'sessions.json', 'screens.json'].includes(f)
// у этих файлов при восстановлении ставим свежий updatedAt, иначе экраны посчитают данные старыми и не загрузят
const STAMPED = ['schedule.json', 'playlist.json', 'decks.json']

// ---------- настройки ----------
let settings = null
function load() {
  if (settings) return settings
  try {
    settings = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    settings = {}
  }
  settings = {
    dir: typeof settings.dir === 'string' ? settings.dir : '',
    period: settings.period in PERIODS ? settings.period : 'off',
    lastAt: Number(settings.lastAt) || 0, // последняя удачная копия
    last: settings.last || null, // { at, ok, error, copied, bytes, ms, snapshot }
  }
  return settings
}
async function save() {
  await fsp.mkdir(DATA, { recursive: true })
  await fsp.writeFile(FILE + '.tmp', JSON.stringify(settings, null, 2), 'utf8')
  await fsp.rename(FILE + '.tmp', FILE)
}

// ---------- состояние текущей работы ----------
let job = null // { kind: 'backup' | 'move' | 'restore', done, total, file }
let lastTryAt = 0
const notify = () => broadcast('backup')
let notifyTimer = null
function progress(done, total, file) {
  if (!job) return
  Object.assign(job, { done, total, file })
  // не чаще пары раз в секунду
  if (!notifyTimer) notifyTimer = setTimeout(() => ((notifyTimer = null), notify()), 500)
}

// ---------- проверки пути ----------
function normDir(dir) {
  return path.resolve(String(dir || '').trim().replace(/[\\/]+$/, '') || '.')
}
const inside = (child, parent) => {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}
function badDir(raw) {
  const s = String(raw || '').trim()
  if (!s) return 'Укажите папку'
  if (!path.isAbsolute(s) || (process.platform === 'win32' && !/^[a-zA-Z]:[\\/]/.test(s) && !s.startsWith('\\\\')))
    return 'Нужен полный путь, например D:\\Бэкап табло'
  const dir = normDir(s)
  if (inside(dir, DATA) || inside(dir, MEDIA) || inside(DATA, dir) || inside(MEDIA, dir))
    return 'Папка копии не может быть внутри data/ или media/ (и содержать их)'
  return ''
}

/** Ближайшая существующая папка вверх по пути — для свободного места, когда самой папки ещё нет. */
function existingAncestor(dir) {
  let d = dir
  while (!fs.existsSync(d)) {
    const up = path.dirname(d)
    if (up === d) return null
    d = up
  }
  return d
}
export async function diskSpace(dir) {
  try {
    const d = existingAncestor(dir)
    if (!d) return null
    const s = await fsp.statfs(d)
    return { free: s.bavail * s.bsize, total: s.blocks * s.bsize }
  } catch {
    return null
  }
}

export async function folderSize(dir) {
  let files = 0
  let bytes = 0
  async function walk(d) {
    let list
    try {
      list = await fsp.readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of list) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) await walk(p)
      else {
        files++
        try {
          bytes += (await fsp.stat(p)).size
        } catch {
          /* ignore */
        }
      }
    }
  }
  await walk(dir)
  return { files, bytes }
}

/** Что лежит в папке копии: снимки data/ и зеркало media/. */
async function inspect(dir) {
  const err = badDir(dir)
  if (err) return { ok: false, error: err }
  dir = normDir(dir)
  const out = { ok: true, dir, exists: fs.existsSync(dir), space: await diskSpace(dir), snapshots: [], media: { files: 0, bytes: 0 } }
  if (!out.exists) return out
  try {
    const names = (await fsp.readdir(path.join(dir, 'data'), { withFileTypes: true }))
      .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/.test(e.name))
      .map((e) => e.name)
      .sort()
      .reverse()
    for (const name of names) {
      const files = (await fsp.readdir(path.join(dir, 'data', name))).filter(isDataFile)
      out.snapshots.push({ name, files })
    }
  } catch {
    /* снимков нет */
  }
  out.media = await folderSize(path.join(dir, 'media'))
  return out
}
const hasBackup = (info) => info.ok && (info.snapshots.length > 0 || info.media.files > 0)

async function writable(dir) {
  try {
    await fsp.mkdir(dir, { recursive: true })
    const probe = path.join(dir, '.write-test')
    await fsp.writeFile(probe, 'ok')
    await fsp.rm(probe)
    return ''
  } catch (e) {
    return 'Нет доступа к папке: ' + (e.code || e.message)
  }
}

// ---------- копирование ----------
function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
}

async function snapshotData(dir, suffix = '') {
  const name = stamp() + suffix
  const dest = path.join(dir, 'data', name)
  await fsp.mkdir(dest, { recursive: true })
  let bytes = 0
  for (const f of (await fsp.readdir(DATA)).filter(isDataFile)) {
    await fsp.copyFile(path.join(DATA, f), path.join(dest, f))
    bytes += (await fsp.stat(path.join(dest, f))).size
  }
  // старые снимки — прочь
  const all = (await fsp.readdir(path.join(dir, 'data'))).filter((n) => /^\d{4}-\d{2}-\d{2}_/.test(n)).sort()
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) await fsp.rm(path.join(dir, 'data', old), { recursive: true, force: true })
  return { name, bytes }
}

/** Все файлы папки (относительные пути), без недокачанных .part и служебных .tmp. */
async function listFiles(base, rel = '') {
  const out = []
  let list
  try {
    list = await fsp.readdir(path.join(base, rel), { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of list) {
    const r = path.join(rel, e.name)
    if (e.isDirectory()) out.push(...(await listFiles(base, r)))
    else if (!e.name.endsWith('.part') && !e.name.endsWith('.tmp')) out.push(r)
  }
  return out
}

/** Докопировать в зеркало новые и изменившиеся (по размеру) файлы. */
async function mirrorMedia(dir) {
  const dest = path.join(dir, 'media')
  const files = await listFiles(MEDIA)
  let copied = 0
  let bytes = 0
  for (let i = 0; i < files.length; i++) {
    const src = path.join(MEDIA, files[i])
    const dst = path.join(dest, files[i])
    progress(i, files.length, files[i])
    const s = await fsp.stat(src)
    const d = await fsp.stat(dst).catch(() => null)
    if (d && d.size === s.size) continue
    await fsp.mkdir(path.dirname(dst), { recursive: true })
    await fsp.copyFile(src, dst + '.tmp')
    await fsp.rename(dst + '.tmp', dst)
    copied++
    bytes += s.size
  }
  return { copied, bytes, total: files.length }
}

const README = `Резервная копия школьного табло
================================

data\\<дата_время>\\  — снимки рабочих данных (расписание, плейлист, медиатека, колоды)
media\\              — фото и видео (сюда докопируются новые файлы)

Восстановить проще всего из редактора: «Медиатека» → «Резервная копия» → «Вернуть».
Вручную: остановить сервер, скопировать json-файлы из нужного снимка в папку data\\ табло,
а содержимое media\\ — в папку media\\ табло, затем запустить сервер.
`

async function runBackup() {
  const s = load()
  const dir = normDir(s.dir)
  const t0 = Date.now()
  const err = badDir(s.dir) || (await writable(dir))
  if (err) throw new Error(err)
  const snap = await snapshotData(dir)
  const m = await mirrorMedia(dir)
  await fsp.writeFile(path.join(dir, 'README.txt'), README, 'utf8')
  s.lastAt = Date.now()
  s.last = { at: s.lastAt, ok: true, snapshot: snap.name, copied: m.copied, bytes: snap.bytes + m.bytes, files: m.total, ms: Date.now() - t0 }
}

/** Перенести копии из старой папки в новую (data/, media/, README.txt) и удалить их из старой. */
async function moveBackup(from, to) {
  await fsp.mkdir(to, { recursive: true })
  for (const part of ['data', 'media', 'README.txt']) {
    const src = path.join(from, part)
    if (!fs.existsSync(src)) continue
    const dst = path.join(to, part)
    if (!fs.existsSync(dst)) {
      try {
        await fsp.rename(src, dst) // тот же диск — мгновенно
        continue
      } catch {
        /* другой диск — копируем */
      }
    }
    const files = (await fsp.stat(src)).isDirectory() ? await listFiles(src) : ['']
    for (let i = 0; i < files.length; i++) {
      progress(i, files.length, files[i])
      const a = path.join(src, files[i])
      const b = path.join(dst, files[i])
      if (fs.existsSync(b)) continue
      await fsp.mkdir(path.dirname(b), { recursive: true })
      await fsp.copyFile(a, b)
    }
    await fsp.rm(src, { recursive: true, force: true })
  }
  // старая папка опустела — убираем и её
  try {
    if (!(await fsp.readdir(from)).length) await fsp.rmdir(from)
  } catch {
    /* ignore */
  }
}

const SNAP_NAME = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}[\w-]*$/
const SNAP_FILE = /^[\w-]+\.json$/

async function runRestore(name, only) {
  const s = load()
  const dir = normDir(s.dir)
  const src = path.join(dir, 'data', name)
  if (!SNAP_NAME.test(name) || !fs.existsSync(src)) throw new Error('Снимок не найден')
  const inSnap = (await fsp.readdir(src)).filter(isDataFile)
  const files = only ? inSnap.filter((f) => only.includes(f)) : inSnap
  if (!files.length) throw new Error('В снимке нет отмеченных файлов')
  // на всякий случай сохраняем то, что есть сейчас
  await snapshotData(dir, '_before-restore')
  const now = Date.now()
  for (const f of files) {
    let text = await fsp.readFile(path.join(src, f), 'utf8')
    if (STAMPED.includes(f)) {
      try {
        const d = JSON.parse(text)
        d.updatedAt = now
        text = JSON.stringify(d, null, 2)
      } catch {
        /* битый файл копируем как есть */
      }
    }
    const dst = path.join(DATA, f)
    await fsp.writeFile(dst + '.tmp', text, 'utf8')
    await fsp.rename(dst + '.tmp', dst)
  }
  // файлы медиатеки, которых нет в media/, — из зеркала (только если возвращаем саму медиатеку)
  if (files.includes('media.json')) {
    const mirror = path.join(dir, 'media')
    const list = await listFiles(mirror)
    for (let i = 0; i < list.length; i++) {
      progress(i, list.length, list[i])
      const dst = path.join(MEDIA, list[i])
      if (fs.existsSync(dst)) continue
      await fsp.mkdir(path.dirname(dst), { recursive: true })
      await fsp.copyFile(path.join(mirror, list[i]), dst)
    }
  }
  resetGroups() // открытые записи журнала устарели
  if (files.includes('schedule.json')) broadcast('data', { updatedAt: now })
  if (files.includes('playlist.json')) broadcast('playlist', { updatedAt: now })
  if (files.includes('decks.json')) broadcast('decks', { updatedAt: now })
  if (files.includes('media.json')) broadcast('media')
}

/** Запускает работу в фоне; повторный запуск, пока идёт другая, не нужен. */
function start(kind, fn) {
  if (job) return false
  job = { kind, done: 0, total: 0, file: '' }
  notify()
  fn()
    .catch(async (e) => {
      if (kind === 'backup') {
        load().last = { at: Date.now(), ok: false, error: e.message || String(e) }
        await save().catch(() => {})
      } else job.error = e.message || String(e)
      console.error('Резервная копия:', e.message || e)
    })
    .finally(async () => {
      lastError = job?.error ? { kind, error: job.error, at: Date.now() } : null
      job = null
      await save().catch(() => {})
      notify()
    })
  return true
}
let lastError = null // ошибка переноса/восстановления (у копии — в settings.last)

// ---------- расписание ----------
function nextAt() {
  const s = load()
  const p = PERIODS[s.period]
  if (!p || !s.dir) return 0
  return s.lastAt ? s.lastAt + p : Date.now()
}
function tick() {
  const s = load()
  if (job || !PERIODS[s.period] || !s.dir) return
  if (Date.now() < nextAt() || Date.now() - lastTryAt < RETRY) return
  lastTryAt = Date.now()
  start('backup', runBackup)
}
/** Вызывается из server.js: проверка раз в 10 минут, первая — через минуту после запуска. */
export function startBackupScheduler() {
  setTimeout(tick, 60e3).unref()
  setInterval(tick, 10 * 60e3).unref()
}

// ---------- API ----------
function json(res, code, data) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}
function readBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (c) => {
      body += c
      if (body.length > 100_000) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'))
      } catch {
        resolve({})
      }
    })
  })
}

/** Кратко для окна «Состояние системы»: период, последняя удачная копия и итог последней попытки. */
export function backupSummary() {
  const s = load()
  return { period: s.period, dir: !!s.dir, periodMs: PERIODS[s.period], lastAt: s.lastAt, last: s.last, lastError }
}

async function status() {
  const s = load()
  return {
    dir: s.dir,
    period: s.period,
    lastAt: s.lastAt,
    last: s.last,
    next: nextAt(),
    job,
    lastError,
    info: s.dir ? await inspect(s.dir) : null,
  }
}

async function drives() {
  const out = []
  if (process.platform !== 'win32') return out
  for (const l of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const root = l + ':\\'
    if (!fs.existsSync(root)) continue
    out.push({ path: root, ...((await diskSpace(root)) || {}) })
  }
  return out
}

/** Возвращает true, если запрос обработан. */
export function handleBackup(req, res) {
  const url = (req.url || '').split('?')[0]
  if (url !== '/api/backup' && !url.startsWith('/api/backup/')) return false
  const m = req.method
  ;(async () => {
    if (url === '/api/backup' && m === 'GET') return json(res, 200, await status())
    if (url === '/api/backup/drives' && m === 'GET') return json(res, 200, { items: await drives() })
    if (url === '/api/backup/check' && m === 'POST') {
      const { dir } = await readBody(req)
      const info = await inspect(dir)
      return json(res, 200, { ...info, hasBackup: hasBackup(info) })
    }
    if (url === '/api/backup' && m === 'PUT') {
      const d = await readBody(req)
      if (job) return json(res, 409, { ok: false, error: 'Сейчас идёт копирование — подождите' })
      const s = load()
      const period = d.period in PERIODS ? d.period : s.period
      const raw = String(d.dir ?? s.dir).trim()
      if (!raw) {
        // папку убрали — копии не делаем
        Object.assign(s, { dir: '', period: 'off' })
        await save()
        notify()
        return json(res, 200, { ok: true })
      }
      const err = badDir(raw) || (await writable(normDir(raw)))
      if (err) return json(res, 400, { ok: false, error: err })
      const dir = normDir(raw)
      const old = s.dir ? normDir(s.dir) : ''
      const changed = old && old.toLowerCase() !== dir.toLowerCase()
      Object.assign(s, { dir, period })
      logEvent(req, 'system', `Настройки резервных копий: папка ${dir}, ${{ off: 'не делать', day: 'раз в день', week: 'раз в неделю', month: 'раз в месяц' }[period]}`)
      if (changed && d.move) start('move', () => moveBackup(old, dir))
      await save()
      notify()
      return json(res, 200, { ok: true, moving: !!(changed && d.move) })
    }
    if (url === '/api/backup/run' && m === 'POST') {
      if (!load().dir) return json(res, 400, { ok: false, error: 'Сначала укажите папку' })
      lastTryAt = Date.now()
      const started = start('backup', runBackup)
      if (started) logEvent(req, 'system', 'Резервная копия: запущена вручную')
      return json(res, started ? 200 : 409, { ok: true })
    }
    if (url === '/api/backup/mirror' && m === 'GET') {
      if (!load().dir) return json(res, 400, { ok: false, error: 'Папка копий не указана' })
      return json(res, 200, { files: (await listFiles(path.join(normDir(load().dir), 'media'))).map((f) => f.replaceAll('\\', '/')) })
    }
    if (url.startsWith('/api/backup/snapshot/') && m === 'GET') {
      const [name, file, ...rest] = url.slice('/api/backup/snapshot/'.length).split('/')
      if (rest.length || !SNAP_NAME.test(name || '') || !SNAP_FILE.test(file || '') || !isDataFile(file)) {
        return json(res, 400, { ok: false, error: 'Неверное имя снимка или файла' })
      }
      if (!load().dir) return json(res, 400, { ok: false, error: 'Папка копий не указана' })
      let text
      try {
        text = await fsp.readFile(path.join(normDir(load().dir), 'data', name, file), 'utf8')
      } catch {
        return json(res, 404, { ok: false, error: 'В снимке нет такого файла' })
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      return res.end(text)
    }
    if (url === '/api/backup/restore' && m === 'POST') {
      const { name, files } = await readBody(req)
      const only = Array.isArray(files) ? files.map(String).filter((f) => SNAP_FILE.test(f)) : null
      if (only && !only.length) return json(res, 400, { ok: false, error: 'Не отмечено ни одного файла' })
      const started = start('restore', () => runRestore(String(name || ''), only))
      if (started) logEvent(req, 'system', `Восстановление из копии ${String(name || '')}${only ? ': ' + only.join(', ') : ''}`)
      return json(res, started ? 200 : 409, { ok: true })
    }
    json(res, 404, { ok: false, error: 'Нет такого адреса' })
  })().catch((e) => json(res, 500, { ok: false, error: e.message || String(e) }))
  return true
}
