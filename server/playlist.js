// Плейлист экрана: порядок слайдов, длительность, вкл/выкл — data/playlist.json.
//   GET /api/playlist  → { version, updatedAt, layout, blank, ticker, urgent, items }; если файла нет — плейлист по умолчанию
//                        из старых настроек автолистания (schedule.json), на диск он попадает при первом PUT
//   PUT /api/playlist  — весь плейлист целиком (как /api/data), сервер проверяет и чистит поля
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { broadcast } from './events.js'
import { THEMES } from './themes.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const FILE = path.join(ROOT, 'data', 'playlist.json')
const SCHEDULE_FILE = path.join(ROOT, 'data', 'schedule.json')

const NEWS_ANIMS = ['none', 'zoom', 'drift', 'parallax', 'rise'] // дублирует NEWS_ANIMS в src/playlist.js
const TYPES = ['schedule', 'changes', 'image', 'video', 'news', 'winners', 'countdown', 'deck']
// шаблон фото/видео/новости/колоды: весь экран или содержимое слева + панель справа (часы, звонки, изменения)
const LAYOUTS = ['full', 'panel']
const cleanLayout = (v) => (LAYOUTS.includes(v) ? v : 'full')
const GRADES = ['5', '6', '7', '8', '9', '10', '11']

/** Правила показа: период дат, время суток, дни недели (1 — Пн … 7 — Вс), только на переменах. Пусто — показывать всегда. */
function cleanWhen(w) {
  if (!w || typeof w !== 'object') return null
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '')
  const time = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v || '') ? v : '')
  const days = Array.isArray(w.days) ? [1, 2, 3, 4, 5, 6, 7].filter((d) => w.days.includes(d)) : []
  const out = {
    dateFrom: date(w.dateFrom),
    dateTo: date(w.dateTo),
    timeFrom: time(w.timeFrom),
    timeTo: time(w.timeTo),
    days: days.length === 7 ? [] : days,
  }
  if (w.breaks === true) out.breaks = true
  return out.dateFrom || out.dateTo || out.timeFrom || out.timeTo || out.days.length || out.breaks ? out : null
}

/** Гашение экрана по расписанию: { on, periods: [{ timeFrom, timeTo, days }] } — без дат, до 10 периодов. */
function cleanBlank(b) {
  const periods = (Array.isArray(b?.periods) ? b.periods : [])
    .slice(0, 10)
    .map((p) => cleanWhen({ timeFrom: p?.timeFrom, timeTo: p?.timeTo, days: p?.days }))
    .filter(Boolean)
    .map(({ timeFrom, timeTo, days }) => ({ timeFrom, timeTo, days }))
  return { on: !!b?.on, periods }
}

/** Бегущая строка: { on, speed, items: [{ text до 200 знаков, until 'ГГГГ-ММ-ДД' | '' }] } — до 10 объявлений. */
function cleanTicker(t) {
  const items = (Array.isArray(t?.items) ? t.items : [])
    .map((i) => ({
      text: String(i?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
      until: /^\d{4}-\d{2}-\d{2}$/.test(i?.until) ? i.until : '',
    }))
    .filter((i) => i.text)
    .slice(0, 10)
  return { on: !!t?.on, speed: t?.speed === 'slow' ? 'slow' : 'normal', items }
}

/** Срочный режим: { on, id } — id слайда из items; слайда нет в списке — режим выключен. */
function cleanUrgent(u, items) {
  const id = String(u?.id ?? '')
  return u?.on && items.some((it) => it.id === id) ? { on: true, id } : { on: false, id: '' }
}

const newId = () => Date.now().toString(36) + crypto.randomBytes(2).toString('hex')
const secs = (v, def) => Math.min(3600, Math.max(3, Math.round(Number(v)) || def))
const str = (v, max) => String(v ?? '').trim().slice(0, max)

/** Группа слайда «Победители»: название, 1–3 места (до 3 человек на место: ФИО и класс), призёры текстом. */
function cleanGroup(g) {
  const places = [0, 1, 2].map((i) => {
    const list = (Array.isArray(g?.places?.[i]) ? g.places[i] : [])
      .slice(0, 3)
      .map((p) => ({ name: str(p?.name, 60), cls: str(p?.cls, 6) }))
    return list.length ? list : [{ name: '', cls: '' }]
  })
  return { name: str(g?.name, 40), places, others: String(g?.others ?? '').slice(0, 3000) }
}

/** Приводит слайд к допустимому виду; null — выбросить. */
export function cleanItem(x) {
  if (!x || !TYPES.includes(x.type)) return null
  const it = {
    id: /^[a-z0-9]{4,32}$/.test(x.id) ? x.id : newId(),
    type: x.type,
    on: x.on !== false,
  }
  if (x.type === 'schedule') {
    it.duration = secs(x.duration, 15) // секунд на одну параллель
    it.grades = Array.isArray(x.grades) ? GRADES.filter((g) => x.grades.includes(g)) : [] // [] — все
  } else if (x.type === 'changes') {
    it.duration = secs(x.duration, 20)
    it.skipEmpty = x.skipEmpty !== false
  } else if (x.type === 'news') {
    // новость: всё содержимое в самом слайде; фото необязательно
    it.label = str(x.label, 40)
    it.title = str(x.title, 140)
    it.text = str(x.text, 800)
    it.date = str(x.date, 40)
    if (/^[a-z0-9]+$/.test(x.media || '')) it.media = x.media
    it.fit = x.fit === 'contain' ? 'contain' : 'cover'
    it.theme = THEMES.includes(String(x.theme)) ? String(x.theme) : '6'
    it.anim = NEWS_ANIMS.includes(x.anim) ? x.anim : 'none'
    it.duration = secs(x.duration, 15)
  } else if (x.type === 'winners') {
    // победители: оформление как у новости, вместо текста — группы (классы) с пьедесталом и призёрами
    it.label = str(x.label, 40)
    it.title = str(x.title, 100)
    it.date = str(x.date, 40)
    if (/^[a-z0-9]+$/.test(x.media || '')) it.media = x.media
    it.fit = x.fit === 'contain' ? 'contain' : 'cover'
    it.theme = THEMES.includes(String(x.theme)) ? String(x.theme) : '6'
    it.anim = NEWS_ANIMS.includes(x.anim) ? x.anim : 'none'
    it.duration = secs(x.duration, 8) // секунд на один экран группы
    it.groups = (Array.isArray(x.groups) ? x.groups : []).slice(0, 20).map(cleanGroup)
  } else if (x.type === 'countdown') {
    // обратный отсчёт: без даты слайд бессмыслен — выбрасываем
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date || '')) return null
    it.title = str(x.title, 60)
    it.date = x.date
    it.time = /^([01]\d|2[0-3]):[0-5]\d$/.test(x.time || '') ? x.time : ''
    it.note = str(x.note, 120)
    it.theme = THEMES.includes(String(x.theme)) ? String(x.theme) : '6'
    it.duration = secs(x.duration, 15)
  } else if (x.type === 'deck') {
    // колода карточек (data/decks.json): каждый показ — следующая карточка или одна карточка на весь день
    if (!/^[a-z0-9]{4,32}$/.test(x.deck || '')) return null
    it.deck = x.deck
    it.mode = x.mode === 'daily' ? 'daily' : 'next'
  } else {
    if (!/^[a-z0-9]+$/.test(x.media || '')) return null
    it.media = x.media
    it.fit = x.fit === 'contain' ? 'contain' : 'cover'
    if (x.type === 'image') it.duration = secs(x.duration, 10)
    else it.sound = !!x.sound // видео идёт до конца, длительность не нужна
  }
  // шаблон у фото, видео, новости и колоды; нет поля — как общий шаблон плейлиста
  if (x.type !== 'schedule' && x.type !== 'changes' && LAYOUTS.includes(x.layout)) it.layout = x.layout
  const when = cleanWhen(x.when)
  if (when) it.when = when
  return it
}

/** Плейлист по умолчанию повторяет прежнее автолистание: параллели 5–11, затем «Изменения». */
function defaultPlaylist() {
  let s = {}
  try {
    s = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8')).settings || {}
  } catch {
    /* расписания ещё нет */
  }
  return {
    version: 1,
    updatedAt: 0,
    layout: 'full',
    blank: cleanBlank(null),
    ticker: cleanTicker(null),
    urgent: cleanUrgent(null, []),
    items: [
      cleanItem({ id: 'schedule0', type: 'schedule', duration: s.interval }),
      cleanItem({
        id: 'changes0',
        type: 'changes',
        on: s.changesInRotation !== false,
        duration: s.changesInterval,
        skipEmpty: s.changesHideEmpty !== false,
      }),
    ],
  }
}

export function readPlaylist() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    const items = (d.items || []).map(cleanItem).filter(Boolean)
    return {
      version: 1,
      updatedAt: Number(d.updatedAt) || 0,
      layout: cleanLayout(d.layout),
      blank: cleanBlank(d.blank),
      ticker: cleanTicker(d.ticker),
      urgent: cleanUrgent(d.urgent, items),
      items,
    }
  } catch {
    return defaultPlaylist()
  }
}

function writePlaylist(p) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(p, null, 2), 'utf8')
  fs.renameSync(tmp, FILE)
  broadcast('playlist', { updatedAt: p.updatedAt })
}

/** Убирает из плейлиста слайды с удалённым файлом (у новости и победителей — только фото). Возвращает, сколько слайдов убрано. */
export function removeMediaFromPlaylist(mediaId) {
  const p = readPlaylist()
  let touched = false
  const items = p.items.filter((it) => {
    if (it.media !== mediaId) return true
    touched = true
    if (it.type !== 'news' && it.type !== 'winners') return false
    delete it.media
    return true
  })
  const removed = p.items.length - items.length
  if (touched) writePlaylist({ ...p, updatedAt: Date.now(), urgent: cleanUrgent(p.urgent, items), items })
  return removed
}

function json(res, code, data) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

export function handlePlaylist(req, res) {
  if (req.method === 'GET') return json(res, 200, readPlaylist())
  if (req.method !== 'PUT') return json(res, 405, { ok: false, error: 'Метод не поддерживается' })

  let body = ''
  req.setEncoding('utf8')
  req.on('data', (c) => {
    body += c
    if (body.length > 1_000_000) req.destroy()
  })
  req.on('end', () => {
    let d
    try {
      d = JSON.parse(body)
    } catch {
      return json(res, 400, { ok: false, error: 'Неверный JSON' })
    }
    if (!Array.isArray(d.items)) return json(res, 400, { ok: false, error: 'Нет списка слайдов' })
    const items = d.items.map(cleanItem).filter(Boolean)
    const p = {
      version: 1,
      updatedAt: Number(d.updatedAt) || Date.now(),
      layout: cleanLayout(d.layout),
      blank: cleanBlank(d.blank),
      ticker: cleanTicker(d.ticker),
      urgent: cleanUrgent(d.urgent, items),
      items,
    }
    writePlaylist(p)
    json(res, 200, { ok: true, updatedAt: p.updatedAt })
  })
}
