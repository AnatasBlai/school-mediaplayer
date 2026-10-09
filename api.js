// Общий обработчик API: хранит расписание и настройки в data/schedule.json.
// Используется и dev-сервером Vite (vite.config.js), и боевым сервером (server.js).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

/** Возвращает true, если запрос обработан. */
export function handleApi(req, res) {
  const url = (req.url || '').split('?')[0]
  if (url !== '/api/data') return false

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
    return true
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
      } catch (e) {
        res.statusCode = 400
        res.end(JSON.stringify({ ok: false, error: String(e) }))
      }
    })
    return true
  }

  res.statusCode = 405
  res.end()
  return true
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
