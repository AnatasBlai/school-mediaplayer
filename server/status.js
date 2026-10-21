// GET /api/status — состояние системы для окна «Состояние» в редакторе: версия, время работы, диск, объём data/ и media/,
// копии, пароль. Секретов в ответе нет. Время работы считается от загрузки модуля (в dev — от старта Vite).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { backupSummary, diskSpace, folderSize } from './backup.js'
import { authRequired } from './auth.js'
import { weatherSummary } from './weather.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const startedAt = Date.now()
let version = ''
try {
  version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || ''
} catch {
  /* нет package.json (архив без него) */
}

async function status() {
  const data = await folderSize(path.join(ROOT, 'data'))
  const tmp = await folderSize(path.join(ROOT, 'data', 'transfer')) // временные файлы переноса — не данные школы
  data.files -= tmp.files
  data.bytes -= tmp.bytes
  const media = await folderSize(path.join(ROOT, 'media'))
  return {
    version,
    startedAt,
    now: Date.now(),
    node: process.version,
    disk: await diskSpace(ROOT),
    data,
    media,
    backup: backupSummary(),
    auth: { required: authRequired() },
    weather: weatherSummary(),
  }
}

export function handleStatus(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.statusCode = 405
    return res.end('{"ok":false}')
  }
  status().then(
    (d) => res.end(JSON.stringify(d)),
    (e) => {
      res.statusCode = 500
      res.end(JSON.stringify({ ok: false, error: e.message || String(e) }))
    },
  )
}
