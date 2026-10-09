// Боевой сервер без зависимостей: раздаёт собранный сайт из dist/ и API расписания.
// Запуск: node server.js  (порт можно поменять: set PORT=8080)
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApi } from './api.js'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT) || 8080

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

const server = http.createServer((req, res) => {
  if (handleApi(req, res)) return

  let urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  if (urlPath === '/') urlPath = '/index.html'
  const file = path.normalize(path.join(DIST, urlPath))
  if (!file.startsWith(DIST)) {
    res.statusCode = 403
    return res.end()
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.statusCode = 404
      return res.end('Not found')
    }
    res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream')
    if (urlPath === '/index.html') res.setHeader('Cache-Control', 'no-store')
    res.end(buf)
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  Расписание запущено:\n')
  console.log(`  На этом компьютере:  http://localhost:${PORT}`)
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) {
        console.log(`  В локальной сети:    http://${ni.address}:${PORT}`)
      }
    }
  }
  console.log('\n  Остановить: Ctrl+C\n')
})
