// Журнал правок: кто, когда и что поменял; откат отдельной правки.
//   data/journal/<ГГГГ-ММ>.json  { items: [{ id, at, until, user, name, ip, area, summary: [строки], version?, kind?, revertOf? }] }
//   data/history/<schedule|playlist|decks>/<мс>.json — файл ДО первой записи группы (по нему идёт откат)
// area: schedule | playlist | decks | media | system. Группировка: записи одного человека в один файл с паузами меньше
// 2 минут — одна запись (правка ячеек шлёт PUT каждые 300 мс). Хранится 60 дней, но не меньше 50 версий на файл.
// logChange(req, area, before, after, opts) — одна функция для всех мест записи; сбой журнала запись не ломает.
// API: GET /api/journal?area=&user=&day=&before=&since=&limit=; POST /api/journal/<id>/revert (право на раздел записи).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { broadcast } from './events.js'
import { nextUpdated } from './conflict.js'
import { whoIs, can } from './auth.js'
import { diffSchedule, diffPlaylist, diffDecks } from '../src/dataDiff.js'

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
const JOURNAL = path.join(DATA, 'journal')
const HISTORY = path.join(DATA, 'history')
const GAP = 2 * 60e3
const KEEP_DAYS = 60
const KEEP_MIN = 50
const PAGE = 50

/** Разделы с историей версий: файл, событие SSE, право на откат. */
const AREAS = {
  schedule: { file: 'schedule.json', event: 'data', right: 'schedule' },
  playlist: { file: 'playlist.json', event: 'playlist', right: 'playlist' },
  decks: { file: 'decks.json', event: 'decks', right: 'decks' },
}

const open = new Map() // раздел → { id, user, last, start } — группа, в которую ещё можно дописывать

const same = (a, b) => JSON.stringify({ ...a, updatedAt: 0 }) === JSON.stringify({ ...b, updatedAt: 0 })
const pad = (n) => String(n).padStart(2, '0')
const ymOf = (t) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
/** «14.10 18:03» */
export const fmtAt = (t) => {
  const d = new Date(t)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ---------- файлы ----------
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file + '.tmp', text, 'utf8')
  fs.renameSync(file + '.tmp', file)
}
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}
const monthFile = (ym) => path.join(JOURNAL, ym + '.json')
const readMonth = (ym) => {
  const f = readJson(monthFile(ym))
  return Array.isArray(f?.items) ? f.items : []
}
const writeMonth = (ym, items) => writeAtomic(monthFile(ym), JSON.stringify({ items }, null, 2))
const months = () => {
  try {
    return fs.readdirSync(JOURNAL).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 7)).sort().reverse()
  } catch {
    return []
  }
}

/** Сохраняет файл «до» в историю → имя версии. */
function saveVersion(area, doc) {
  const dir = path.join(HISTORY, area)
  let t = Date.now()
  while (fs.existsSync(path.join(dir, t + '.json'))) t++
  writeAtomic(path.join(dir, t + '.json'), JSON.stringify(doc))
  return t + '.json'
}

// ---------- запись ----------
function whoOf(req, who) {
  const w = who || (req && whoIs(req))
  return { user: w?.id || '', name: w?.name || (req ? 'Без входа' : 'Сервер') }
}
const ipOf = (req) => String(req?.socket?.remoteAddress || '').replace(/^::ffff:/, '')

/** Названия файлов и колод — для строк про слайды. */
function dict() {
  const media = {}
  const decks = {}
  for (const m of readJson(path.join(DATA, 'media.json'))?.items || []) media[m.id] = m.name
  for (const d of readJson(path.join(DATA, 'decks.json'))?.decks || []) decks[d.id] = d.name
  return { media, decks, journal: true }
}
function summaryOf(area, a, b) {
  a = a || {}
  const lines = area === 'schedule' ? diffSchedule(a, b) : area === 'playlist' ? diffPlaylist(a, b, dict()) : diffDecks(a, b, { journal: true })
  return lines.length ? lines : ['Прочие настройки']
}

function append(entry) {
  const ym = entry.id.slice(0, 7)
  const items = readMonth(ym)
  items.push(entry)
  writeMonth(ym, items)
}
function update(id, patch) {
  const ym = id.slice(0, 7)
  const items = readMonth(ym)
  const e = items.find((x) => x.id === id)
  if (!e) return false
  Object.assign(e, patch)
  writeMonth(ym, items)
  return true
}
const newId = (t) => ymOf(t) + '-' + crypto.randomBytes(4).toString('hex')

/** Служебная запись без отката: вход, пользователи, копии, медиатека. opts.who — { id, name }, если вошедшего ещё нет в сессии. */
export function logEvent(req, area, summary, opts = {}) {
  try {
    const now = Date.now()
    const w = whoOf(req, opts.who)
    append({ id: newId(now), at: now, until: now, ...w, ip: ipOf(req), area, summary: [].concat(summary) })
  } catch (e) {
    console.error('Журнал:', e.message)
  }
}

/**
 * Запись об изменении раздела: before/after — документы целиком (before может быть null).
 * opts: single — отдельная запись, не склеивать с соседними; note — первая строка; kind/revertOf — для отката; who.
 */
export function logChange(req, area, before, after, opts = {}) {
  try {
    if (before && same(before, after)) return
    const now = Date.now()
    const w = whoOf(req, opts.who)
    const g = open.get(area)
    if (!opts.single && g && g.user === w.user && now - g.last < GAP) {
      const lines = summaryOf(area, g.start, after)
      if (update(g.id, { until: now, summary: lines })) {
        g.last = now
        return
      }
    }
    const version = before ? saveVersion(area, before) : undefined
    const id = newId(now)
    const entry = { id, at: now, until: now, ...w, ip: ipOf(req), area, summary: [...(opts.note ? [opts.note] : []), ...summaryOf(area, before, after)] }
    if (version) entry.version = version
    if (opts.kind) entry.kind = opts.kind
    if (opts.revertOf) entry.revertOf = opts.revertOf
    append(entry)
    if (opts.single) open.delete(area)
    else open.set(area, { id, user: w.user, last: now, start: before })
  } catch (e) {
    console.error('Журнал:', e.message)
  }
}

/** После восстановления из копии открытые группы устарели: следующая правка начнёт новую запись. */
export const resetGroups = () => open.clear()

// ---------- чистка ----------
export function cleanHistory() {
  const old = Date.now() - KEEP_DAYS * 864e5
  for (const area of Object.keys(AREAS)) {
    const dir = path.join(HISTORY, area)
    let names
    try {
      names = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => parseInt(b) - parseInt(a))
    } catch {
      continue
    }
    names.forEach((f, i) => {
      if (i >= KEEP_MIN && parseInt(f) < old) fs.rmSync(path.join(dir, f), { force: true })
    })
  }
}
/** Чистка при старте и раз в сутки — вызывает server.js (не при импорте). */
export function startJournal() {
  cleanHistory()
  setInterval(cleanHistory, 864e5).unref()
}

// ---------- чтение и откат ----------
function json(res, code, data) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

function list(q) {
  const limit = Math.min(200, Number(q.get('limit')) || PAGE)
  const area = q.get('area') || ''
  const user = q.get('user') || ''
  const before = Number(q.get('before')) || Infinity
  const since = Number(q.get('since')) || 0
  const day = q.get('day') || ''
  let from = 0
  let to = Infinity
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    from = new Date(day + 'T00:00:00').getTime()
    to = from + 864e5
  }
  const items = []
  let more = false
  const people = new Map()
  const ms = months()
  ms.forEach((ym, mi) => {
    for (const e of readMonth(ym).reverse()) {
      if (mi < 3 && e.user !== undefined) people.set(e.user, e.name)
      if (more || e.at >= before || e.at <= since || e.at < from || e.at >= to) continue
      if ((area && e.area !== area) || (user && e.user !== user)) continue
      if (items.length >= limit) more = true
      else items.push(e)
    }
  })
  return { items, more, people: [...people].map(([id, name]) => ({ id, name })) }
}

function revert(req, res, id) {
  const m = id.match(/^(\d{4}-\d{2})-[0-9a-f]+$/)
  const e = m && readMonth(m[1]).find((x) => x.id === id)
  if (!e) return json(res, 404, { ok: false, error: 'Записи нет' })
  const a = AREAS[e.area]
  if (!a || !e.version) return json(res, 400, { ok: false, error: 'Эту правку вернуть нельзя' })
  if (!can(req, a.right)) return json(res, 403, { ok: false, error: 'Нет прав на этот раздел' })
  const old = readJson(path.join(HISTORY, e.area, e.version))
  if (!old) return json(res, 410, { ok: false, error: 'Старая версия уже удалена из истории' })
  const file = path.join(DATA, a.file)
  const cur = readJson(file)
  const doc = { ...old, updatedAt: nextUpdated(Date.now(), cur?.updatedAt) } // свежий updatedAt — иначе клиенты не загрузят
  writeAtomic(file, JSON.stringify(doc, null, 2))
  logChange(req, e.area, cur, doc, { single: true, kind: 'revert', revertOf: id, note: `Откат к ${fmtAt(e.at)}` })
  broadcast(a.event, { updatedAt: doc.updatedAt })
  json(res, 200, { ok: true, updatedAt: doc.updatedAt })
}

/** /api/journal* — возвращает true, если запрос обработан. */
export function handleJournal(req, res) {
  const u = new URL(req.url || '/', 'http://x')
  if (u.pathname !== '/api/journal' && !u.pathname.startsWith('/api/journal/')) return false
  const m = u.pathname.match(/^\/api\/journal\/([\w-]+)\/revert$/)
  if (m && req.method === 'POST') revert(req, res, m[1])
  else if (u.pathname === '/api/journal' && req.method === 'GET') json(res, 200, list(u.searchParams))
  else json(res, 404, { ok: false, error: 'Нет такого адреса' })
  return true
}
