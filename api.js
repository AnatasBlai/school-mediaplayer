// Общий обработчик API: хранит расписание и настройки в data/schedule.json,
// рассылает экранам уведомления об изменениях (SSE) и раздаёт файлы из media/.
// Используется и dev-сервером Vite (vite.config.js), и боевым сервером (server.js).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(ROOT, 'data')
const DATA_FILE = path.join(DATA_DIR, 'schedule.json')
export const MEDIA_DIR = path.join(ROOT, 'media')

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

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

// ---------- SSE: экраны и редактор держат соединение и узнают о правках сразу ----------

// Метка запуска сервера: если она сменилась, экран понимает, что сервер перезапустили
// (например, после пересборки), и перезагружает страницу.
const BOOT = Date.now().toString(36)
const clients = new Set()

function openEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  })
  res.write(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({ boot: BOOT })}\n\n`)
  clients.add(res)
  req.on('close', () => clients.delete(res))
}

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const c of clients) c.write(msg)
}

// пустой комментарий раз в 25 с, чтобы простаивающее соединение не закрылось
setInterval(() => {
  for (const c of clients) c.write(': ping\n\n')
}, 25_000).unref()

/** Возвращает true, если запрос обработан. */
export function handleApi(req, res) {
  const url = (req.url || '').split('?')[0]
  if (url === '/api/events') {
    openEvents(req, res)
    return true
  }
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
        broadcast('data', { updatedAt: Number(parsed.updatedAt) || 0 })
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

/** Раздаёт /media/* с поддержкой Range — без неё видео в браузере нельзя перематывать. */
export function handleMedia(req, res) {
  let url
  try {
    url = decodeURIComponent((req.url || '').split('?')[0])
  } catch {
    return false
  }
  if (!url.startsWith('/media/')) return false

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.end()
    return true
  }
  const file = path.normalize(path.join(MEDIA_DIR, url.slice('/media/'.length)))
  if (!file.startsWith(MEDIA_DIR + path.sep)) {
    res.statusCode = 403
    res.end()
    return true
  }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.statusCode = 404
      return res.end('Not found')
    }
    const size = st.size
    let start = 0
    let end = size - 1
    res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream')
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'public, max-age=3600')

    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
    if (m) {
      if (m[1] === '') {
        start = size - Number(m[2]) // «последние N байт»
      } else {
        start = Number(m[1])
        if (m[2] !== '') end = Math.min(Number(m[2]), size - 1)
      }
      if (m[1] === '' && m[2] === '') start = size
      if (start < 0) start = 0
      if (start > end) {
        res.statusCode = 416
        res.setHeader('Content-Range', `bytes */${size}`)
        return res.end()
      }
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
    }

    res.setHeader('Content-Length', size ? end - start + 1 : 0)
    if (req.method === 'HEAD' || size === 0) return res.end()
    fs.createReadStream(file, { start, end }).pipe(res)
  })
  return true
}

export function apiPlugin() {
  const mw = (req, res, next) => {
    if (!handleApi(req, res) && !handleMedia(req, res)) next()
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
