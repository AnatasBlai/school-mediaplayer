// Плейлист экрана: порядок слайдов, длительность, вкл/выкл — data/playlist.json.
//   GET /api/playlist  → { version, updatedAt, items }; если файла нет — плейлист по умолчанию
//                        из старых настроек автолистания (schedule.json), на диск он попадает при первом PUT
//   PUT /api/playlist  — весь плейлист целиком (как /api/data), сервер проверяет и чистит поля
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { broadcast } from './events.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const FILE = path.join(ROOT, 'data', 'playlist.json')
const SCHEDULE_FILE = path.join(ROOT, 'data', 'schedule.json')

const TYPES = ['schedule', 'changes', 'image', 'video']
const GRADES = ['5', '6', '7', '8', '9', '10', '11']

const newId = () => Date.now().toString(36) + crypto.randomBytes(2).toString('hex')
const secs = (v, def) => Math.min(3600, Math.max(3, Math.round(Number(v)) || def))

/** Приводит слайд к допустимому виду; null — выбросить. */
function cleanItem(x) {
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
  } else {
    if (!/^[a-z0-9]+$/.test(x.media || '')) return null
    it.media = x.media
    it.fit = x.fit === 'contain' ? 'contain' : 'cover'
    if (x.type === 'image') it.duration = secs(x.duration, 10)
    else it.sound = !!x.sound // видео идёт до конца, длительность не нужна
  }
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
    return { version: 1, updatedAt: Number(d.updatedAt) || 0, items: (d.items || []).map(cleanItem).filter(Boolean) }
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

/** Убирает из плейлиста слайды с удалённым файлом. Возвращает, сколько слайдов убрано. */
export function removeMediaFromPlaylist(mediaId) {
  const p = readPlaylist()
  const items = p.items.filter((it) => it.media !== mediaId)
  const removed = p.items.length - items.length
  if (removed) writePlaylist({ version: 1, updatedAt: Date.now(), items })
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
    const p = { version: 1, updatedAt: Number(d.updatedAt) || Date.now(), items: d.items.map(cleanItem).filter(Boolean) }
    writePlaylist(p)
    json(res, 200, { ok: true, updatedAt: p.updatedAt })
  })
}
