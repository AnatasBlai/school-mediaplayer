// Медиатека: файлы лежат в media/, их список (название, категория, размеры) — в data/media.json.
//   GET    /api/media                 → { items: [...], disk: { free, size } }
//   POST   /api/media?name=&w=&h=&duration=   тело — сам файл (поток, без multipart) → запись
//   PUT    /api/media/<id>/thumb      тело — превью jpeg → media/thumbs/<id>.jpg
//   PATCH  /api/media/<id>            { name?, category? }
//   DELETE /api/media/<id>            → { ok, removedFromPlaylist } — слайды с этим файлом убираются из плейлиста
//   GET    /media/<файл>              раздача с Range (перемотка видео)
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { MIME } from './mime.js'
import { broadcast } from './events.js'
import { removeMediaFromPlaylist } from './playlist.js'
import { logEvent } from './journal.js'
import { removeMediaFromDecks } from './decks.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const MEDIA_DIR = path.join(ROOT, 'media')
export const THUMBS_DIR = path.join(MEDIA_DIR, 'thumbs')
const LIST_FILE = path.join(ROOT, 'data', 'media.json')

const MAX_FILE = 4 * 1024 ** 3 // 4 ГБ
const MAX_THUMB = 2 * 1024 ** 2
export const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
export const VIDEO_EXT = ['.mp4', '.m4v', '.webm', '.mov']

// недокачанные файлы от прошлого запуска
try {
  for (const f of fs.readdirSync(MEDIA_DIR)) if (f.endsWith('.part')) fs.rmSync(path.join(MEDIA_DIR, f))
} catch {
  /* папки ещё нет */
}

// ---------- список ----------

export function readList() {
  try {
    const d = JSON.parse(fs.readFileSync(LIST_FILE, 'utf8'))
    return Array.isArray(d.items) ? d.items : []
  } catch {
    return []
  }
}

export function writeList(items) {
  fs.mkdirSync(path.dirname(LIST_FILE), { recursive: true })
  const tmp = LIST_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, items }, null, 2), 'utf8')
  fs.renameSync(tmp, LIST_FILE)
}

function diskInfo() {
  try {
    const s = fs.statfsSync(MEDIA_DIR)
    return { free: s.bavail * s.bsize, size: s.blocks * s.bsize }
  } catch {
    return null
  }
}

const cleanText = (v, max) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .trim()
    .slice(0, max)
const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v) * 100) / 100 : 0)

// ---------- ответы ----------

function json(res, code, data) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (c) => {
      body += c
      if (body.length > 100_000) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

/** Пишет тело запроса в файл потоком; при обрыве или превышении лимита удаляет недописанное. */
export async function saveBody(req, dest, limit) {
  const part = dest + '.part'
  let size = 0
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length
      cb(size > limit ? new Error('Файл слишком большой') : null, chunk)
    },
  })
  try {
    await pipeline(req, counter, fs.createWriteStream(part))
    fs.renameSync(part, dest)
    return size
  } catch (e) {
    fs.rmSync(part, { force: true })
    throw e
  }
}

/** SHA-1 файла потоком. */
export function hashFile(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1')
    fs.createReadStream(file).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject)
  })
}

/** Дописывает `sha1` тем записям списка, у которых его нет (лениво, для переноса файлом); возвращает список. */
export async function ensureSha1(items) {
  let changed = false
  for (const it of items) {
    if (it.sha1) continue
    try {
      it.sha1 = await hashFile(path.join(MEDIA_DIR, it.file))
      changed = true
    } catch {
      /* файла нет — хэша нет */
    }
  }
  if (changed) {
    // список перечитываем: пока считали, его могли изменить
    const fresh = readList()
    for (const f of fresh) f.sha1 = f.sha1 || items.find((x) => x.id === f.id)?.sha1 || undefined
    writeList(fresh)
  }
  return items
}

// ---------- обработчики ----------

async function upload(req, res, query) {
  const name = cleanText(query.get('name'), 200)
  const ext = path.extname(name).toLowerCase()
  const type = IMAGE_EXT.includes(ext) ? 'image' : VIDEO_EXT.includes(ext) ? 'video' : null
  if (!type) return json(res, 400, { ok: false, error: `Формат ${ext || 'без расширения'} не поддерживается` })

  fs.mkdirSync(MEDIA_DIR, { recursive: true })
  const id = Date.now().toString(36) + crypto.randomBytes(3).toString('hex')
  const file = id + ext
  let size
  try {
    size = await saveBody(req, path.join(MEDIA_DIR, file), MAX_FILE)
  } catch (e) {
    if (!res.headersSent && !res.destroyed) json(res, 400, { ok: false, error: String(e.message || e) })
    return
  }
  const item = {
    id,
    file,
    type,
    name: path.basename(name, path.extname(name)).slice(0, 120) || 'Без названия',
    category: cleanText(query.get('category'), 40),
    size,
    w: num(query.get('w')),
    h: num(query.get('h')),
    duration: type === 'video' ? num(query.get('duration')) : 0,
    thumb: null,
    addedAt: Date.now(),
  }
  const items = readList()
  items.push(item)
  writeList(items)
  logEvent(req, 'media', `Добавлен файл «${item.name}»`)
  json(res, 200, { ok: true, item })
  broadcast('media')
}

async function putThumb(req, res, id) {
  const items = readList()
  const item = items.find((x) => x.id === id)
  if (!item) return json(res, 404, { ok: false, error: 'Файл не найден' })
  fs.mkdirSync(THUMBS_DIR, { recursive: true })
  try {
    await saveBody(req, path.join(THUMBS_DIR, id + '.jpg'), MAX_THUMB)
  } catch (e) {
    return json(res, 400, { ok: false, error: String(e.message || e) })
  }
  // список перечитываем: пока шла загрузка, его могли изменить
  const fresh = readList()
  const it = fresh.find((x) => x.id === id)
  if (!it) return json(res, 404, { ok: false, error: 'Файл удалён' })
  it.thumb = `thumbs/${id}.jpg`
  writeList(fresh)
  json(res, 200, { ok: true, item: it })
  broadcast('media')
}

async function patch(req, res, id) {
  let body
  try {
    body = await readJsonBody(req)
  } catch {
    return json(res, 400, { ok: false, error: 'Неверный JSON' })
  }
  const items = readList()
  const item = items.find((x) => x.id === id)
  if (!item) return json(res, 404, { ok: false, error: 'Файл не найден' })
  const was = { name: item.name, category: item.category }
  if ('name' in body) item.name = cleanText(body.name, 120) || item.name
  if ('category' in body) item.category = cleanText(body.category, 40)
  writeList(items)
  if (item.name !== was.name) logEvent(req, 'media', `Переименован файл «${was.name}» → «${item.name}»`)
  if (item.category !== was.category) logEvent(req, 'media', `Файл «${item.name}»: другая папка (${item.category || 'без папки'})`)
  json(res, 200, { ok: true, item })
  broadcast('media')
}

function remove(req, res, id) {
  const items = readList()
  const i = items.findIndex((x) => x.id === id)
  if (i < 0) return json(res, 404, { ok: false, error: 'Файл не найден' })
  const [item] = items.splice(i, 1)
  fs.rmSync(path.join(MEDIA_DIR, item.file), { force: true })
  fs.rmSync(path.join(THUMBS_DIR, id + '.jpg'), { force: true })
  writeList(items)
  logEvent(req, 'media', `Удалён файл «${item.name}». Вернуть его можно только из резервной копии`)
  const removedFromPlaylist = removeMediaFromPlaylist(id, req, item.name)
  removeMediaFromDecks(id, req, item.name)
  json(res, 200, { ok: true, removedFromPlaylist })
  broadcast('media')
}

/** /api/media* — возвращает true, если запрос обработан. */
export function handleMediaApi(req, res) {
  const u = new URL(req.url || '/', 'http://x')
  if (u.pathname !== '/api/media' && !u.pathname.startsWith('/api/media/')) return false

  const parts = u.pathname.split('/').slice(3) // ['', 'api', 'media', id, 'thumb']
  const id = parts[0] || ''
  if (id && !/^[a-z0-9]+$/.test(id)) {
    json(res, 400, { ok: false, error: 'Неверный id' })
    return true
  }
  const run = (p) => p.catch((e) => !res.headersSent && json(res, 500, { ok: false, error: String(e.message || e) }))

  if (!id && req.method === 'GET') {
    fs.mkdirSync(MEDIA_DIR, { recursive: true })
    const items = readList().sort((a, b) => b.addedAt - a.addedAt)
    json(res, 200, { items, disk: diskInfo() })
  } else if (!id && req.method === 'POST') run(upload(req, res, u.searchParams))
  else if (id && parts[1] === 'thumb' && req.method === 'PUT') run(putThumb(req, res, id))
  else if (id && !parts[1] && req.method === 'PATCH') run(patch(req, res, id))
  else if (id && !parts[1] && req.method === 'DELETE') remove(req, res, id)
  else json(res, 405, { ok: false, error: 'Метод не поддерживается' })
  return true
}

/** Раздаёт /media/* с поддержкой Range — без неё видео в браузере нельзя перематывать. */
export function handleMediaFiles(req, res) {
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
  if (!file.startsWith(MEDIA_DIR + path.sep) || file.endsWith('.part')) {
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
    // имена файлов уникальны (id), содержимое под одним именем не меняется
    res.setHeader('Cache-Control', 'public, max-age=86400')

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
