// Боевой сервер без зависимостей: раздаёт собранный сайт из dist/, API расписания и файлы media/.
// Запуск: node server.js  (порт можно поменять: set PORT=8080)
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApi, MIME } from './api.js'
import { startBackupScheduler } from './server/backup.js'
import { migrateOldPassword } from './server/auth.js'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT) || 8080

function sendFile(res, file, noCache) {
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.statusCode = 404
      return res.end('Not found')
    }
    res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream')
    if (noCache) res.setHeader('Cache-Control', 'no-store')
    res.end(buf)
  })
}

migrateOldPassword() // старый общий пароль (data/auth.json) → пользователь admin
const server = http.createServer((req, res) => {
  if (handleApi(req, res)) return

  let urlPath
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  } catch {
    res.statusCode = 400
    return res.end()
  }
  // адреса страниц без расширения (/, /admin) — это одно приложение, отдаём index.html
  if (!path.extname(urlPath)) return sendFile(res, path.join(DIST, 'index.html'), true)

  const file = path.normalize(path.join(DIST, urlPath))
  if (!file.startsWith(DIST + path.sep)) {
    res.statusCode = 403
    return res.end()
  }
  sendFile(res, file, false)
})

// резервные копии по расписанию — только на боевом сервере
startBackupScheduler()

server.listen(PORT, '0.0.0.0', () => {
  const lan = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) lan.push(ni.address)
    }
  }
  console.log('\n  Сервер запущен.\n')
  console.log(`  Экран:     http://localhost:${PORT}`)
  console.log(`  Редактор:  http://localhost:${PORT}/admin`)
  for (const ip of lan) console.log(`  Из сети:   http://${ip}:${PORT}/admin`)
  console.log('\n  Остановить: Ctrl+C\n')
})
