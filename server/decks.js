// Колоды карточек (факты, вопросы, загадки) — data/decks.json.
//   GET /api/decks             → { version, updatedAt, decks }; файла нет — стартовый набор (на диск — при первом PUT)
//   PUT /api/decks             — все колоды целиком, сервер чистит поля
//   POST /api/decks/<id>/take  → { n } — номер очередного показа колоды (счётчик общий для всех экранов,
//                                переживает перезапуск: data/deck-state.json). Карточка = n % число карточек
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { broadcast } from './events.js'
import { THEMES } from './themes.js'
import { STARTER_DECKS } from './starterDecks.js'
import { parseCards } from '../src/deckText.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const FILE = path.join(ROOT, 'data', 'decks.json')
const STATE_FILE = path.join(ROOT, 'data', 'deck-state.json')

const ID = /^[a-z0-9]{4,32}$/
const newId = () => Date.now().toString(36) + crypto.randomBytes(2).toString('hex')
const str = (v, max) => String(v ?? '').trim().slice(0, max)
const secs = (v, def) => Math.min(600, Math.max(3, Math.round(Number(v)) || def))
const mediaId = (v) => (/^[a-z0-9]+$/.test(v || '') ? v : '')

function cleanCard(x) {
  if (!x || !['fact', 'choice', 'open'].includes(x.type)) return null
  const c = { id: ID.test(x.id) ? x.id : newId(), type: x.type, text: str(x.text, 400) }
  if (x.type === 'fact') c.title = str(x.title, 80)
  if (x.type === 'choice') {
    c.options = (Array.isArray(x.options) ? x.options : []).slice(0, 4).map((o) => str(o, 120))
    while (c.options.length < 2) c.options.push('')
    c.correct = Math.min(c.options.length - 1, Math.max(0, Math.round(Number(x.correct)) || 0))
  }
  if (x.type === 'open') c.answer = str(x.answer, 200)
  if (x.type !== 'fact') c.explain = str(x.explain, 300)
  const m = mediaId(x.media)
  if (m) c.media = m
  return c
}

export function cleanDeck(x) {
  if (!x || typeof x !== 'object') return null
  return {
    id: ID.test(x.id) ? x.id : newId(),
    name: str(x.name, 60) || 'Колода',
    theme: THEMES.includes(String(x.theme)) ? String(x.theme) : '6',
    factTime: secs(x.factTime, 15), // факт на экране, с
    qTime: secs(x.qTime, 20), // вопрос до ответа, с
    aTime: secs(x.aTime, 10), // ответ, с
    cards: (Array.isArray(x.cards) ? x.cards : []).slice(0, 2000).map(cleanCard).filter(Boolean),
  }
}

function starter() {
  return {
    version: 1,
    updatedAt: 0,
    decks: STARTER_DECKS.map((d) =>
      cleanDeck({ ...d, cards: parseCards(d.text).map((c, i) => ({ ...c, id: d.id + i.toString(36).padStart(2, '0') })) }),
    ),
  }
}

export function readDecks() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    return { version: 1, updatedAt: Number(d.updatedAt) || 0, decks: (d.decks || []).map(cleanDeck).filter(Boolean) }
  } catch {
    return starter()
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

// ---------- счётчики показов ----------
let counters = null
function take(id) {
  if (!counters) {
    try {
      counters = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) || {}
    } catch {
      counters = {}
    }
  }
  const n = Number(counters[id]) || 0
  counters[id] = n + 1
  try {
    writeJson(STATE_FILE, counters)
  } catch {
    /* не записали — не страшно, счётчик останется в памяти */
  }
  return n
}

function json(res, code, data) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

/** Возвращает true, если запрос обработан. */
export function handleDecks(req, res) {
  const url = (req.url || '').split('?')[0]
  const m = url.match(/^\/api\/decks\/([a-z0-9]+)\/take$/)
  if (m) {
    if (req.method !== 'POST') return json(res, 405, { ok: false }), true
    return json(res, 200, { n: take(m[1]) }), true
  }
  if (url !== '/api/decks') return false

  if (req.method === 'GET') return json(res, 200, readDecks()), true
  if (req.method !== 'PUT') return json(res, 405, { ok: false, error: 'Метод не поддерживается' }), true

  let body = ''
  req.setEncoding('utf8')
  req.on('data', (c) => {
    body += c
    if (body.length > 5_000_000) req.destroy()
  })
  req.on('end', () => {
    let d
    try {
      d = JSON.parse(body)
    } catch {
      return json(res, 400, { ok: false, error: 'Неверный JSON' })
    }
    if (!Array.isArray(d.decks)) return json(res, 400, { ok: false, error: 'Нет списка колод' })
    const p = { version: 1, updatedAt: Number(d.updatedAt) || Date.now(), decks: d.decks.map(cleanDeck).filter(Boolean) }
    writeJson(FILE, p)
    broadcast('decks', { updatedAt: p.updatedAt })
    json(res, 200, { ok: true, updatedAt: p.updatedAt })
  })
  return true
}

/** Убирает удалённый файл медиатеки из карточек. */
export function removeMediaFromDecks(id) {
  if (!fs.existsSync(FILE)) return
  const p = readDecks()
  let changed = false
  for (const d of p.decks) for (const c of d.cards) if (c.media === id) delete c.media, (changed = true)
  if (changed) {
    p.updatedAt = Date.now()
    writeJson(FILE, p)
    broadcast('decks', { updatedAt: p.updatedAt })
  }
}
