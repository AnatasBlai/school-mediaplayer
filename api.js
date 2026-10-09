// Общий обработчик API: используется и dev-сервером Vite (vite.config.js), и боевым сервером (server.js).
//   /api/data    — расписание и настройки (data/schedule.json)
//   /api/events  — SSE-уведомления (server/events.js)
//   /api/playlist — плейлист экрана (server/playlist.js)
//   /api/screens — что сейчас показывают экраны (server/screens.js)
//   /api/decks*  — колоды карточек: факты, вопросы, загадки (server/decks.js)
//   /api/media*  и /media/* — медиатека (server/media.js)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openEvents, broadcast } from './server/events.js'
import { handleMediaApi, handleMediaFiles } from './server/media.js'
import { handlePlaylist } from './server/playlist.js'
import { handleScreens } from './server/screens.js'
import { handleDecks } from './server/decks.js'

export { MIME } from './server/mime.js'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(ROOT, 'data')
const DATA_FILE = path.join(DATA_DIR, 'schedule.json')

function readData() {
  try {
    return fs.readFileSync(DATA_FILE, 'utf8')
  } catch {
    return null
  }
}

function writeData(json) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const tmp = DATA_FILE + '.tmp'
  fs.writeFileSync(tmp, json, 'utf8')
  fs.renameSync(tmp, DATA_FILE)
}

function handleData(req, res) {
  if (req.method === 'GET') {
    const data = readData()
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    if (data === null) {
      res.statusCode = 404
      res.end('{}')
    } else {
      res.end(data)
    }
    return
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 5_000_000) req.destroy()
    })
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body)
        writeData(JSON.stringify(parsed, null, 2))
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end('{"ok":true}')
        broadcast('data', { updatedAt: Number(parsed.updatedAt) || 0 })
      } catch (e) {
        res.statusCode = 400
        res.end(JSON.stringify({ ok: false, error: String(e) }))
      }
    })
    return
  }

  res.statusCode = 405
  res.end()
}

/** Возвращает true, если запрос обработан. */
export function handleApi(req, res) {
  const url = (req.url || '').split('?')[0]
  if (url === '/api/events') {
    openEvents(req, res)
    return true
  }
  if (url === '/api/data') {
    handleData(req, res)
    return true
  }
  if (url === '/api/playlist') {
    handlePlaylist(req, res)
    return true
  }
  if (url === '/api/screens') {
    handleScreens(req, res)
    return true
  }
  return handleDecks(req, res) || handleMediaApi(req, res) || handleMediaFiles(req, res)
}

export function apiPlugin() {
  const mw = (req, res, next) => {
    if (!handleApi(req, res)) next()
  }
  return {
    name: 'schedule-api',
    configureServer(server) {
      server.middlewares.use(mw)
    },
    configurePreviewServer(server) {
      server.middlewares.use(mw)
    },
  }
}
