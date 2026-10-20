// Что сейчас показывают экраны. Список экранов помнится в data/screens.json { items: [{ id, name, ip, seen, w, h }] }
// (без слайда; пишется не чаще раза в минуту и сразу при новом экране / удалении); после перезапуска сервера
// такие экраны «без связи», пока не отчитаются. Экран забывается только кнопкой (DELETE).
//   POST /api/screens  { id, name, slide: { id, type, seq, tab, fallback, urgent }, w, h } — экран при смене слайда и раз в 30 с
//                      { id, gone: true } — страницу экрана закрыли (sendBeacon), сразу помечаем «нет связи»
//   GET  /api/screens  → { now, items: [{ id, name, ip, slide, since, seen, w, h }] } — время по часам сервера
//   DELETE /api/screens/<id> — убрать экран из списка (запись: только после входа)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { broadcast } from './events.js'

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'screens.json')
const SAVE_EVERY = 60_000
const OFFLINE_AGO = 120_000 // загруженный из файла экран считается молчащим, даже если сервер перезапустили быстро

const screens = new Map()
let dirty = false
let timer = null

function save() {
  clearTimeout(timer)
  timer = null
  dirty = false
  const items = [...screens.values()].map((s) => ({ id: s.id, name: s.name, ip: s.ip, seen: Math.max(s.seen, s.goneAt), w: s.w, h: s.h }))
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    fs.writeFileSync(FILE + '.tmp', JSON.stringify({ items }), 'utf8')
    fs.renameSync(FILE + '.tmp', FILE)
  } catch {
    dirty = true // диск недоступен — попробуем при следующем отчёте
  }
}
function markDirty(now) {
  dirty = true
  if (now) save()
  else if (!timer) {
    timer = setTimeout(save, SAVE_EVERY)
    timer.unref?.()
  }
}

try {
  const d = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  const cap = Date.now() - OFFLINE_AGO
  for (const e of Array.isArray(d.items) ? d.items : []) {
    const id = String(e?.id ?? '').slice(0, 40)
    if (!/^[a-z0-9]+$/.test(id)) continue
    const seen = Math.min(Number(e.seen) || 0, cap)
    screens.set(id, {
      id,
      name: String(e.name ?? '').slice(0, 60),
      ip: String(e.ip ?? '').slice(0, 60),
      slide: { id: '', type: '', seq: 0, tab: '', fallback: false, urgent: false },
      since: seen,
      seen,
      goneAt: 0,
      w: Number(e.w) || 0,
      h: Number(e.h) || 0,
    })
  }
} catch {
  /* файла нет — экраны появятся, когда отчитаются */
}

const sameSlide = (a, b) => a && b && a.id === b.id && a.seq === b.seq && a.tab === b.tab && a.urgent === b.urgent
const str = (v, max) => String(v ?? '').slice(0, max)

function json(res, code, data) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

export function handleScreens(req, res) {
  if (req.method === 'GET') return json(res, 200, { now: Date.now(), items: [...screens.values()] })
  if (req.method === 'DELETE') {
    const id = decodeURIComponent((req.url || '').split('?')[0].slice('/api/screens/'.length))
    if (screens.delete(id)) {
      markDirty(true)
      broadcast('screens')
    }
    return json(res, 200, { ok: true })
  }
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
        markDirty(false)
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
    markDirty(!prev)
    json(res, 200, { ok: true })
    // о каждом «я жив» не рассылаем — только о смене слайда или новом экране
    if (changed) broadcast('screens')
  })
}
