// Общий обработчик API: используется и dev-сервером Vite (vite.config.js), и боевым сервером (server.js).
//   /api/data    — расписание и настройки (data/schedule.json)
//   /api/events  — SSE-уведомления (server/events.js)
//   /api/playlist — плейлист экрана (server/playlist.js)
//   /api/screens — что сейчас показывают экраны (server/screens.js)
//   /api/decks*  — колоды карточек: факты, вопросы, загадки (server/decks.js)
//   /api/backup* — резервные копии data/ и media/ (server/backup.js)
//   /api/media*  и /media/* — медиатека (server/media.js)
//   /api/status  — состояние системы: диск, копии, версия (server/status.js)
//   /api/journal* — журнал правок и откат (server/journal.js)
//   /api/auth*   — входы и права; запись без входа — 401, без права на раздел — 403 (server/auth.js)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openEvents, broadcast } from './server/events.js'
import { handleMediaApi, handleMediaFiles } from './server/media.js'
import { handlePlaylist } from './server/playlist.js'
import { handleScreens } from './server/screens.js'
import { handleDecks } from './server/decks.js'
import { handleBackup } from './server/backup.js'
import { handleStatus } from './server/status.js'
import { isAllowed, handleAuth } from './server/auth.js'
import { baseConflict, nextUpdated } from './server/conflict.js'
import { handleJournal, logChange } from './server/journal.js'

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
        let cur = null
        try {
          cur = JSON.parse(readData())
        } catch {
          /* файла нет или он повреждён — конфликта быть не может */
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        if (cur && baseConflict(req, cur.updatedAt)) {
          res.statusCode = 409
          res.end(JSON.stringify({ ok: false, conflict: true, current: cur }))
          return
        }
        parsed.updatedAt = nextUpdated(parsed.updatedAt, cur?.updatedAt)
        writeData(JSON.stringify(parsed, null, 2))
        res.end(JSON.stringify({ ok: true, updatedAt: parsed.updatedAt }))
        logChange(req, 'schedule', cur, parsed)
        broadcast('data', { updatedAt: parsed.updatedAt })
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
  if (url.startsWith('/api/')) {
    const a = isAllowed(req)
    if (!a.ok) {
      res.statusCode = a.code
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ ok: false, error: a.error }))
      return true
    }
  }
  if (handleAuth(req, res)) return true
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
  if (url === '/api/status') {
    handleStatus(req, res)
    return true
  }
  if (url === '/api/screens' || url.startsWith('/api/screens/')) {
    handleScreens(req, res)
    return true
  }
  return handleJournal(req, res) || handleDecks(req, res) || handleBackup(req, res) || handleMediaApi(req, res) || handleMediaFiles(req, res)
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
