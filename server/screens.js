// Что сейчас показывают экраны. Хранится только в памяти: после перезапуска сервера экраны перезагружаются
// и сразу сообщают о себе заново.
//   POST /api/screens  { id, name, slide: { id, type, seq, tab, fallback, urgent }, w, h } — экран при смене слайда и раз в 30 с
//                      { id, gone: true } — страницу экрана закрыли (sendBeacon), сразу помечаем «нет связи»
//   GET  /api/screens  → { now, items: [{ id, name, ip, slide, since, seen, w, h }] } — время по часам сервера
import { broadcast } from './events.js'

const screens = new Map()
const FORGET = 24 * 3600 * 1000 // экран, молчащий сутки, убираем из списка

const sameSlide = (a, b) => a && b && a.id === b.id && a.seq === b.seq && a.tab === b.tab && a.urgent === b.urgent
const str = (v, max) => String(v ?? '').slice(0, max)

function json(res, code, data) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

function list() {
  const now = Date.now()
  for (const [id, s] of screens) if (now - Math.max(s.seen, s.goneAt) > FORGET) screens.delete(id)
  return { now, items: [...screens.values()] }
}

export function handleScreens(req, res) {
  if (req.method === 'GET') return json(res, 200, list())
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Метод не поддерживается' })

  let body = ''
  req.setEncoding('utf8')
  req.on('data', (c) => {
    body += c
    if (body.length > 10_000) req.destroy()
  })
  req.on('end', () => {
    let d
    try {
      d = JSON.parse(body)
    } catch {
      return json(res, 400, { ok: false, error: 'Неверный JSON' })
    }
    const id = str(d.id, 40)
    if (!/^[a-z0-9]+$/.test(id)) return json(res, 400, { ok: false, error: 'Неверный id' })
    if (d.gone) {
      const s = screens.get(id)
      if (s) {
        s.seen = 0
        s.goneAt = Date.now()
        broadcast('screens')
      }
      return json(res, 200, { ok: true })
    }
    const s = d.slide || {}
    const slide = {
      id: str(s.id, 40),
      type: str(s.type, 20),
      seq: Number(s.seq) || 0,
      tab: str(s.tab, 20),
      fallback: !!s.fallback,
      urgent: !!s.urgent,
    }
    const prev = screens.get(id)
    const now = Date.now()
    const back = !prev || !prev.seen // новый экран или вернулся после закрытия страницы
    const changed = back || !sameSlide(prev.slide, slide) || prev.name !== str(d.name, 60)
    screens.set(id, {
      id,
      name: str(d.name, 60),
      ip: (req.socket.remoteAddress || '').replace(/^::ffff:/, ''),
      slide,
      since: back || !sameSlide(prev.slide, slide) ? now : prev.since,
      seen: now,
      goneAt: 0,
      w: Number(d.w) || 0,
      h: Number(d.h) || 0,
    })
    json(res, 200, { ok: true })
    // о каждом «я жив» не рассылаем — только о смене слайда или новом экране
    if (changed) broadcast('screens')
  })
}
