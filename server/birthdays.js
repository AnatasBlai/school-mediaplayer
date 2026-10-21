// Именинники — data/birthdays.json { version, updatedAt, items: [{ id, name, cls, d: 'ММ-ДД' }] }. Личные данные:
// хранится только день и месяц; полный список — только после входа (правило в auth.js), в архивы pack.mjs не входит.
//   GET /api/birthdays        → весь список (после входа)
//   PUT /api/birthdays        — список целиком (право «Плейлист»), сервер чистит поля; SSE birthdays { updatedAt }
//   GET /api/birthdays/today  → { items: [{ name, cls, weekend }] } — для экрана, открыт, без дат; ?full=1 — «Имя Фамилия»
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { broadcast } from './events.js'
import { baseConflict, nextUpdated } from './conflict.js'
import { logChange } from './journal.js'
import { todayForScreen, saturdayHasLessons } from '../src/birthdays.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const FILE = path.join(ROOT, 'data', 'birthdays.json')
const SCHEDULE = path.join(ROOT, 'data', 'schedule.json')

const ID = /^[a-z0-9]{4,32}$/
const newId = () => Date.now().toString(36) + crypto.randomBytes(3).toString('hex')
const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export function cleanBirthday(x) {
  if (!x || typeof x !== 'object') return null
  const name = str(x.name, 80)
  const m = /^(\d\d)-(\d\d)$/.exec(String(x.d || ''))
  if (!name || !m || +m[1] < 1 || +m[1] > 12 || +m[2] < 1 || +m[2] > 31) return null
  return { id: ID.test(x.id) ? x.id : newId(), name, cls: str(x.cls, 10), d: x.d }
}

export function readBirthdays() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    return { version: 1, updatedAt: Number(d.updatedAt) || 0, items: (d.items || []).map(cleanBirthday).filter(Boolean) }
  } catch {
    return { version: 1, updatedAt: 0, items: [] }
  }
}

function readSchedule() {
  try {
    return JSON.parse(fs.readFileSync(SCHEDULE, 'utf8'))
  } catch {
    return null
  }
}

function json(res, code, data) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

/** Возвращает true, если запрос обработан. */
export function handleBirthdays(req, res) {
  const u = new URL(req.url || '/', 'http://x')
  if (u.pathname === '/api/birthdays/today') {
    if (req.method !== 'GET') return json(res, 405, { ok: false }), true
    const full = u.searchParams.get('full') === '1'
    return json(res, 200, { items: todayForScreen(readBirthdays().items, new Date(), saturdayHasLessons(readSchedule()), full) }), true
  }
  if (u.pathname !== '/api/birthdays') return false

  if (req.method === 'GET') return json(res, 200, readBirthdays()), true
  if (req.method !== 'PUT') return json(res, 405, { ok: false, error: 'Метод не поддерживается' }), true

  let body = ''
  req.setEncoding('utf8')
  req.on('data', (c) => {
    body += c
    if (body.length > 2_000_000) req.destroy()
  })
  req.on('end', () => {
    let d
    try {
      d = JSON.parse(body)
    } catch {
      return json(res, 400, { ok: false, error: 'Неверный JSON' })
    }
    if (!Array.isArray(d.items)) return json(res, 400, { ok: false, error: 'Нет списка' })
    const cur = readBirthdays()
    if (baseConflict(req, cur.updatedAt)) return json(res, 409, { ok: false, conflict: true, current: cur })
    const p = { version: 1, updatedAt: nextUpdated(d.updatedAt, cur.updatedAt), items: d.items.slice(0, 5000).map(cleanBirthday).filter(Boolean) }
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(p, null, 2), 'utf8')
    fs.renameSync(FILE + '.tmp', FILE)
    broadcast('birthdays', { updatedAt: p.updatedAt })
    logChange(req, 'birthdays', cur, p)
    json(res, 200, { ok: true, updatedAt: p.updatedAt })
  })
  return true
}
