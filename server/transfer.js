// Перенос плейлиста одним файлом: «Сохранить в файл» и «Загрузить из файла» (формат — zip, см. server/zip.js).
//   GET    /api/transfer/estimate?parts=decks,schedule&all=1  → { slides, decks, files, bytes, tooBig }
//   GET    /api/transfer/export?parts=…&all=…                 → поток zip (имя tablo-ГГГГ-ММ-ДД_ЧЧ-ММ.zip)
//   POST   /api/transfer/import?name=                         тело — zip потоком → data/transfer/<токен>.zip, разбор → { token, preview }
//   GET    /api/transfer/import/<токен>                       → { progress } (идёт ли копирование файлов)
//   POST   /api/transfer/import/<токен>/apply { playlist, playlistMode: 'replace'|'add', decks, schedule }
//   DELETE /api/transfer/import/<токен>                       — отмена, временный файл удаляется
// Записи идут как обычные правки: updatedAt растёт, экраны получают SSE, в журнал — logChange (откат из «Журнала правок»).
// Права: плейлист — «Плейлист», колоды — «Колоды», расписание — «Расписание», новые файлы — «Медиатека» (проверяем здесь, `can`).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { broadcast } from './events.js'
import { can } from './auth.js'
import { logChange, logEvent } from './journal.js'
import { nextUpdated } from './conflict.js'
import { cleanItem, cleanPlaylist, readPlaylist, writePlaylist } from './playlist.js'
import { cleanDeck, readDecks, saveDecks } from './decks.js'
import { MEDIA_DIR, THUMBS_DIR, IMAGE_EXT, VIDEO_EXT, readList, writeList, saveBody, ensureSha1 } from './media.js'
import { ZipWriter, openZip, ZipError, ZIP_LIMIT } from './zip.js'
import { diffPlaylist, diffDecks, diffSchedule, slideName, limitLines } from '../src/dataDiff.js'
import { TRANSFER_FORMAT, mediaRefs, remapMedia, mergePlaylistAdd, mergeDecks, transferName, cmpVersion } from '../src/transfer.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(ROOT, 'data')
const DIR = path.join(DATA, 'transfer')
const SCHEDULE_FILE = path.join(DATA, 'schedule.json')

const SAFE_TOTAL = ZIP_LIMIT - 8 * 1024 ** 2 // запас на каталог архива и json
const FREE_RESERVE = 500 * 1024 ** 2 // после загрузки на диске должно остаться
const MAX_JSON = 20 * 1024 ** 2
const MAX_THUMB = 2 * 1024 ** 2
const KEEP = 3600e3 // брошенный временный файл живёт час
const NOT_OURS = 'Это не файл табло или файл повреждён'

let version = ''
try {
  version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || ''
} catch {
  /* нет package.json */
}

const sessions = new Map() // токен → { file, name, at, busy, progress, manifest, docs, media }

// ---------- ответы ----------
function json(res, code, data) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}
const fail = (res, e, code = 500) => !res.headersSent && json(res, e instanceof ZipError ? 400 : code, { ok: false, error: String(e.message || e) })
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
        resolve(JSON.parse(body || '{}') || {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}
const cleanText = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max)
const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v) * 100) / 100 : 0)
const newMediaId = () => Date.now().toString(36) + crypto.randomBytes(3).toString('hex')
const extOf = (f) => path.extname(String(f || '')).toLowerCase()

// ---------- выгрузка ----------
function parseParts(u) {
  const parts = String(u.searchParams.get('parts') || '').split(',')
  return { decks: parts.includes('decks'), schedule: parts.includes('schedule'), all: u.searchParams.get('all') === '1' }
}

/** Что попадёт в файл: документы и существующие файлы медиатеки (с размерами). */
function collect(sel) {
  const playlist = readPlaylist()
  const decks = sel.decks ? readDecks() : null
  let schedule = null
  if (sel.schedule) {
    try {
      schedule = fs.readFileSync(SCHEDULE_FILE, 'utf8')
    } catch {
      throw new Error('Расписания ещё нет — выгружать нечего')
    }
  }
  const ids = mediaRefs(playlist, decks)
  const media = []
  for (const it of readList()) {
    if (!sel.all && !ids.has(it.id)) continue
    let size = 0
    let thumbSize = 0
    try {
      size = fs.statSync(path.join(MEDIA_DIR, it.file)).size
    } catch {
      continue // файла нет на диске
    }
    if (it.thumb) {
      try {
        thumbSize = fs.statSync(path.join(MEDIA_DIR, it.thumb)).size
      } catch {
        /* превью нет */
      }
    }
    media.push({ item: it, size, thumbSize })
  }
  return { playlist, decks, schedule, media }
}

/** Размер zip без сжатия: заголовок + имя + данные + descriptor + запись каталога + конец. */
function zipSize(entries) {
  let n = 22
  for (const e of entries) {
    const nl = Buffer.byteLength(e.name)
    n += 30 + nl + e.size + 16 + 46 + nl
  }
  return n
}

function estimate(sel) {
  const c = collect(sel)
  const entries = c.media.flatMap((m) => [{ name: 'media/' + m.item.file, size: m.size }, ...(m.thumbSize ? [{ name: `media/thumbs/${m.item.id}.jpg`, size: m.thumbSize }] : [])])
  entries.push({ name: 'manifest.json', size: 400 + c.media.length * 330 }, { name: 'playlist.json', size: JSON.stringify(c.playlist).length * 1.1 })
  if (c.decks) entries.push({ name: 'decks.json', size: JSON.stringify(c.decks).length * 1.1 })
  if (c.schedule) entries.push({ name: 'schedule.json', size: Buffer.byteLength(c.schedule) })
  const bytes = Math.round(zipSize(entries))
  return { slides: c.playlist.items.length, decks: c.decks ? c.decks.decks.length : 0, files: c.media.length, bytes, tooBig: bytes > SAFE_TOTAL }
}

function rightsFor(req, sel) {
  if (!can(req, 'playlist')) return 'Нет права «Плейлист»'
  if (sel.decks && !can(req, 'decks')) return 'Нет права «Колоды»'
  if (sel.schedule && !can(req, 'schedule')) return 'Нет права «Расписание»'
  return ''
}

async function exportZip(req, res, u) {
  const sel = parseParts(u)
  const denied = rightsFor(req, sel)
  if (denied) return json(res, 403, { ok: false, error: denied })
  const c = collect(sel)
  await ensureSha1(c.media.map((m) => m.item))
  const mediaList = c.media.map(({ item, size, thumbSize }) => ({
    id: item.id,
    file: item.file,
    type: item.type,
    name: item.name,
    category: item.category || '',
    size,
    w: item.w || 0,
    h: item.h || 0,
    duration: item.duration || 0,
    sha1: item.sha1 || '',
    thumb: thumbSize ? `thumbs/${item.id}.jpg` : null,
  }))
  const parts = ['playlist', ...(c.decks ? ['decks'] : []), ...(c.schedule ? ['schedule'] : [])]
  const manifest = Buffer.from(JSON.stringify({ format: TRANSFER_FORMAT, version: 1, app: version, createdAt: Date.now(), host: os.hostname(), parts, media: mediaList }, null, 2))
  const docs = [['manifest.json', manifest], ['playlist.json', Buffer.from(JSON.stringify(c.playlist, null, 2))]]
  if (c.decks) docs.push(['decks.json', Buffer.from(JSON.stringify(c.decks, null, 2))])
  if (c.schedule) docs.push(['schedule.json', Buffer.from(c.schedule)])

  const entries = [...docs.map(([name, buf]) => ({ name, size: buf.length }))]
  for (const m of c.media) {
    entries.push({ name: 'media/' + m.item.file, size: m.size })
    if (m.thumbSize) entries.push({ name: `media/thumbs/${m.item.id}.jpg`, size: m.thumbSize })
  }
  const total = zipSize(entries)
  if (total > SAFE_TOTAL) return json(res, 413, { ok: false, error: 'Больше 4 ГБ: такой файл не поместится на флешку FAT32' })

  res.statusCode = 200
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Length', total)
  res.setHeader('Content-Disposition', `attachment; filename="${transferName()}"`)
  res.setHeader('Cache-Control', 'no-store')
  const zw = new ZipWriter(res)
  try {
    for (const [name, buf] of docs) await zw.addBuffer(name, buf)
    for (const m of c.media) {
      await zw.addFile('media/' + m.item.file, path.join(MEDIA_DIR, m.item.file))
      if (m.thumbSize) await zw.addFile(`media/thumbs/${m.item.id}.jpg`, path.join(MEDIA_DIR, m.item.thumb))
    }
    await zw.finish()
  } catch (e) {
    console.error('Выгрузка в файл:', e.message)
    res.destroy() // обрыв: браузер увидит неполный файл и не примет его за готовый
  }
}

// ---------- разбор загруженного архива ----------
/** Проверяет архив и читает документы. Не наш файл → ZipError('Это не файл табло…'). */
async function parseArchive(file) {
  const zip = await openZip(file)
  const readDoc = async (name) => {
    try {
      return JSON.parse((await zip.read(name, MAX_JSON)).toString('utf8'))
    } catch (e) {
      if (e instanceof ZipError && zip.entries.has(name)) throw e
      throw new ZipError(NOT_OURS)
    }
  }
  if (!zip.entries.has('manifest.json')) throw new ZipError(NOT_OURS)
  const manifest = await readDoc('manifest.json')
  if (!manifest || manifest.format !== TRANSFER_FORMAT || !Array.isArray(manifest.parts) || !manifest.parts.includes('playlist')) throw new ZipError(NOT_OURS)
  if (Number(manifest.version) !== 1) throw Object.assign(new ZipError('Файл сделан другой версией табло и не читается. Обновите табло или сделайте файл заново'), { keep: true })
  const docs = { playlist: await readDoc('playlist.json') }
  if (!docs.playlist || !Array.isArray(docs.playlist.items)) throw new ZipError(NOT_OURS)
  if (manifest.parts.includes('decks') && zip.entries.has('decks.json')) {
    docs.decks = await readDoc('decks.json')
    if (!Array.isArray(docs.decks?.decks)) throw new ZipError(NOT_OURS)
  }
  if (manifest.parts.includes('schedule') && zip.entries.has('schedule.json')) {
    docs.schedule = await readDoc('schedule.json')
    if (!docs.schedule || typeof docs.schedule.schedule !== 'object' || typeof docs.schedule.settings !== 'object') throw new ZipError(NOT_OURS)
  }
  // файлы медиатеки: только ожидаемые имена media/<id>.<расширение> и media/thumbs/<id>.jpg
  const media = []
  const seen = new Set()
  for (const m of (Array.isArray(manifest.media) ? manifest.media : []).slice(0, 20000)) {
    const id = String(m?.id ?? '')
    const ext = extOf(m?.file)
    const type = IMAGE_EXT.includes(ext) ? 'image' : VIDEO_EXT.includes(ext) ? 'video' : null
    if (!/^[a-z0-9]{1,40}$/.test(id) || !type || m.file !== id + ext || seen.has(id)) continue
    const entry = zip.entries.get('media/' + m.file)
    if (!entry) continue
    seen.add(id)
    media.push({
      id,
      file: m.file,
      type,
      name: cleanText(m.name, 120) || 'Без названия',
      category: cleanText(m.category, 40),
      size: entry.size,
      w: num(m.w),
      h: num(m.h),
      duration: type === 'video' ? num(m.duration) : 0,
      sha1: /^[0-9a-f]{40}$/.test(m.sha1) ? m.sha1 : '',
      thumb: zip.entries.has(`media/thumbs/${id}.jpg`) ? `thumbs/${id}.jpg` : null,
    })
  }
  return { manifest, docs, media }
}

/** Что делать с каждым файлом из архива: такой уже есть (по размеру и SHA-1) / копировать под своим id / под новым id. */
async function planMedia(media) {
  const lib = readList()
  const taken = new Set(lib.map((x) => x.id))
  const map = new Map()
  const fresh = []
  let have = 0
  for (const m of media) {
    const cands = m.sha1 ? lib.filter((x) => x.size === m.size && x.type === m.type && fs.existsSync(path.join(MEDIA_DIR, x.file))) : []
    await ensureSha1(cands.filter((x) => !x.sha1))
    const same = cands.find((x) => x.sha1 === m.sha1)
    if (same) {
      map.set(m.id, same.id)
      have++
      continue
    }
    let id = m.id
    while (taken.has(id)) id = newMediaId()
    taken.add(id)
    map.set(m.id, id)
    fresh.push({ m, id })
  }
  return { map, fresh, have, freshBytes: fresh.reduce((s, f) => s + f.m.size, 0) }
}

function freeSpace() {
  try {
    fs.mkdirSync(MEDIA_DIR, { recursive: true })
    const s = fs.statfsSync(MEDIA_DIR)
    return s.bavail * s.bsize
  } catch {
    return Infinity
  }
}

/** Файл + таблица замен id → документы, готовые к записи (ссылки на файлы переписаны, поля очищены). */
function prepare(s, plan, opts) {
  const map = new Map(plan.map)
  for (const id of mediaRefs(s.docs.playlist, s.docs.decks)) if (!map.has(id)) map.set(id, null) // файла нет в архиве — ссылку убираем
  const out = {}
  const curPl = readPlaylist()
  const raw = remapMedia(s.docs.playlist, map)
  const filePl = cleanPlaylist(raw, curPl.updatedAt)
  out.skipped = s.docs.playlist.items.filter((x) => !cleanItem(x)).length // этой версии такие слайды неизвестны
  out.lost = Math.max(0, s.docs.playlist.items.filter((x) => cleanItem(x)).length - filePl.items.length) // пропали из-за недостающих файлов
  out.filePl = filePl
  out.curPl = curPl
  if (opts.playlistMode === 'add') {
    out.addInfo = mergePlaylistAdd(curPl, filePl)
    out.playlist = out.addInfo.playlist
  } else out.playlist = filePl
  if (s.docs.decks) {
    const curDecks = readDecks()
    const fileDecks = remapMedia(s.docs.decks, map).decks.map(cleanDeck).filter(Boolean)
    out.curDecks = curDecks
    out.fileDecks = fileDecks
    out.decks = { ...curDecks, decks: mergeDecks(curDecks.decks, fileDecks) }
  }
  if (s.docs.schedule) {
    let cur = null
    try {
      cur = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'))
    } catch {
      /* расписания ещё нет */
    }
    out.curSchedule = cur
    out.schedule = s.docs.schedule
  }
  return out
}

async function makePreview(s) {
  const plan = await planMedia(s.media)
  const free = freeSpace()
  const dict = { media: {}, decks: {}, transfer: true }
  for (const m of readList()) dict.media[m.id] = m.name
  for (const m of s.media) dict.media[plan.map.get(m.id)] = m.name
  for (const d of readDecks().decks) dict.decks[d.id] = d.name
  for (const d of s.docs.decks?.decks || []) dict.decks[d.id] = d.name || dict.decks[d.id]

  const rep = prepare(s, plan, { playlistMode: 'replace' })
  const add = prepare(s, plan, { playlistMode: 'add' })
  const replaceLines = diffPlaylist(rep.curPl, rep.playlist, dict)
  const a = add.addInfo
  const name = (it) => `«${slideName(it, dict)}»`
  const newSlides = add.filePl.items.filter((x) => !rep.curPl.items.some((c) => c.id === x.id))
  const oldSlides = add.filePl.items.filter((x) => rep.curPl.items.some((c) => c.id === x.id))
  const addLines = []
  if (newSlides.length) addLines.push('Добавятся слайды: ' + newSlides.slice(0, 5).map(name).join(', ') + (newSlides.length > 5 ? ` и ещё ${newSlides.length - 5}` : ''))
  if (oldSlides.length) addLines.push('Обновятся (тот же слайд): ' + oldSlides.slice(0, 5).map(name).join(', ') + (oldSlides.length > 5 ? ` и ещё ${oldSlides.length - 5}` : ''))
  if (a.tplAdded || a.tplUpdated) addLines.push(`Свои шаблоны слайдов: добавится ${a.tplAdded}, обновится ${a.tplUpdated}`)
  if (a.tickerAdded) addLines.push(`Бегущая строка: добавится объявлений — ${a.tickerAdded}`)
  if (a.tickerSkipped) addLines.push(`Бегущая строка: ${a.tickerSkipped} объявл. не добавить — в строке уже 10`)
  if (!addLines.length) addLines.push('Новых слайдов нет')

  const urgentItem = rep.filePl.urgent.on ? rep.filePl.items.find((x) => x.id === rep.filePl.urgent.id) : null
  const preview = {
    skipped: rep.skipped,
    lost: rep.lost,
    newer: cmpVersion(s.manifest.app, version) > 0,
    slides: rep.filePl.items.length,
    playlist: { replace: replaceLines.length ? replaceLines : ['Без изменений'], add: limitLines(addLines), urgent: urgentItem ? slideName(urgentItem, dict) : '' },
    decks: s.docs.decks ? { count: s.docs.decks.decks.length, lines: diffDecks(rep.curDecks, rep.decks, { journal: true }) } : null,
    schedule: s.docs.schedule ? { lines: diffSchedule(rep.curSchedule, rep.schedule) } : null,
    files: { fresh: plan.fresh.length, freshBytes: plan.freshBytes, have: plan.have, free: Number.isFinite(free) ? free : 0, noSpace: Number.isFinite(free) && free - plan.freshBytes < FREE_RESERVE },
  }
  for (const k of ['decks', 'schedule']) if (preview[k] && !preview[k].lines.length) preview[k].lines = ['Без изменений']
  return preview
}

// ---------- загрузка ----------
function dropSession(token) {
  const s = sessions.get(token)
  sessions.delete(token)
  fs.rmSync(path.join(DIR, token + '.zip'), { force: true })
  return !!s
}

/** Брошенные временные файлы: при старте — все, потом раз в 10 минут — старше часа. */
export function sweepTransfer(all = false) {
  for (const [t, s] of sessions) if (!s.busy && Date.now() - s.at > KEEP) sessions.delete(t)
  try {
    for (const f of fs.readdirSync(DIR)) {
      const p = path.join(DIR, f)
      const token = f.replace(/\.zip$/, '')
      if (sessions.has(token) && !all) continue
      if (all || Date.now() - fs.statSync(p).mtimeMs > KEEP) fs.rmSync(p, { force: true })
    }
  } catch {
    /* папки ещё нет */
  }
}
export function startTransfer() {
  sweepTransfer(true)
  setInterval(() => sweepTransfer(false), 10 * 60e3).unref()
}

async function importZip(req, res, u) {
  sweepTransfer(false)
  fs.mkdirSync(DIR, { recursive: true })
  const token = crypto.randomBytes(12).toString('hex')
  const file = path.join(DIR, token + '.zip')
  try {
    await saveBody(req, file, ZIP_LIMIT + 1024)
  } catch (e) {
    return fail(res, e, 400)
  }
  try {
    const { manifest, docs, media } = await parseArchive(file)
    const s = { file, name: cleanText(u.searchParams.get('name'), 100) || 'файл', at: Date.now(), busy: false, progress: null, manifest, docs, media }
    sessions.set(token, s)
    const preview = await makePreview(s)
    json(res, 200, {
      ok: true,
      token,
      name: s.name,
      manifest: { createdAt: Number(manifest.createdAt) || 0, host: cleanText(manifest.host, 80), app: cleanText(manifest.app, 20), parts: manifest.parts.filter((p) => ['playlist', 'decks', 'schedule'].includes(p)) },
      preview,
    })
  } catch (e) {
    dropSession(token)
    fail(res, e?.keep ? e : new ZipError(NOT_OURS))
  }
}

async function applyImport(req, res, token) {
  const s = sessions.get(token)
  if (!s) return json(res, 404, { ok: false, error: 'Файл уже не загружен — выберите его заново' })
  if (s.busy) return json(res, 409, { ok: false, error: 'Загрузка уже идёт' })
  let b
  try {
    b = await readJsonBody(req)
  } catch {
    return json(res, 400, { ok: false, error: 'Неверный запрос' })
  }
  const want = { playlist: b.playlist !== false, decks: !!b.decks, schedule: !!b.schedule }
  const mode = b.playlistMode === 'add' ? 'add' : 'replace'
  if ((want.decks && !s.docs.decks) || (want.schedule && !s.docs.schedule)) return json(res, 400, { ok: false, error: 'Этого раздела нет в файле' })
  if (!want.playlist && !want.decks && !want.schedule) return json(res, 400, { ok: false, error: 'Ничего не выбрано' })
  if (want.playlist && !can(req, 'playlist')) return json(res, 403, { ok: false, error: 'Нет права «Плейлист»' })
  if (want.decks && !can(req, 'decks')) return json(res, 403, { ok: false, error: 'Нет права «Колоды»' })
  if (want.schedule && !can(req, 'schedule')) return json(res, 403, { ok: false, error: 'Нет права «Расписание»' })

  s.busy = true
  s.progress = { phase: 'check', done: 0, total: 0 }
  const copied = []
  try {
    // какие файлы нужны: с плейлистом — все из архива, иначе только ссылки колод
    const need = want.playlist ? s.media : s.media.filter((m) => mediaRefs(s.docs.decks).has(m.id))
    const plan = await planMedia(need)
    if (plan.fresh.length && !can(req, 'media')) throw Object.assign(new Error('Нет права «Медиатека»'), { code: 403 })
    const free = freeSpace()
    if (Number.isFinite(free) && free - plan.freshBytes < FREE_RESERVE) throw new Error('На диске не хватает места для файлов')

    const zip = await openZip(s.file)
    s.progress = { phase: 'files', done: 0, total: plan.fresh.length }
    fs.mkdirSync(THUMBS_DIR, { recursive: true })
    const added = []
    for (const { m, id } of plan.fresh) {
      const file = id + extOf(m.file)
      const dest = path.join(MEDIA_DIR, file)
      const r = await zip.extract('media/' + m.file, dest)
      copied.push(dest)
      let thumb = null
      if (m.thumb) {
        const td = path.join(THUMBS_DIR, id + '.jpg')
        try {
          await zip.extract(`media/${m.thumb}`, td, { max: MAX_THUMB })
          copied.push(td)
          thumb = `thumbs/${id}.jpg`
        } catch {
          /* превью не обязательно */
        }
      }
      added.push({ id, file, type: m.type, name: m.name, category: m.category, size: r.size, w: m.w, h: m.h, duration: m.duration, thumb, addedAt: Date.now(), sha1: r.sha1 })
      s.progress.done++
    }

    // все документы готовим до записи: ошибка — данные не тронуты
    s.progress = { phase: 'save', done: plan.fresh.length, total: plan.fresh.length }
    const out = prepare(s, plan, { playlistMode: mode })
    const curSchedule = out.curSchedule
    const label = `Загружено из файла ${s.name}`
    if (added.length) {
      writeList([...readList(), ...added])
      broadcast('media')
    }
    const result = { files: added.length, haveFiles: plan.have, playlist: want.playlist ? mode : null, decks: want.decks, schedule: want.schedule, tickerSkipped: want.playlist && mode === 'add' ? out.addInfo.tickerSkipped : 0 }
    if (want.decks) {
      const next = { ...out.decks, updatedAt: nextUpdated(Date.now(), out.curDecks.updatedAt) }
      saveDecks(next)
      logChange(req, 'decks', out.curDecks, next, { single: true, note: label })
    }
    if (want.playlist) {
      const next = { ...out.playlist, updatedAt: nextUpdated(Date.now(), out.curPl.updatedAt) }
      writePlaylist(next)
      logChange(req, 'playlist', out.curPl, next, { single: true, note: label })
    }
    if (want.schedule) {
      const next = { ...out.schedule, updatedAt: nextUpdated(Date.now(), curSchedule?.updatedAt) }
      fs.mkdirSync(DATA, { recursive: true })
      fs.writeFileSync(SCHEDULE_FILE + '.tmp', JSON.stringify(next, null, 2), 'utf8')
      fs.renameSync(SCHEDULE_FILE + '.tmp', SCHEDULE_FILE)
      broadcast('data', { updatedAt: next.updatedAt })
      logChange(req, 'schedule', curSchedule, next, { single: true, note: label })
    }
    if (added.length) logEvent(req, 'media', `Загружено из файла: ${added.length} файл${added.length === 1 ? '' : added.length < 5 ? 'а' : 'ов'}`)
    dropSession(token)
    json(res, 200, { ok: true, result })
  } catch (e) {
    for (const f of copied) fs.rmSync(f, { force: true }) // ничего не меняем: убираем уже скопированное
    s.busy = false
    s.progress = null
    fail(res, e, e.code === 403 ? 403 : 500)
  }
}

/** /api/transfer/* — возвращает true, если запрос обработан. */
export function handleTransfer(req, res) {
  const u = new URL(req.url || '/', 'http://x')
  if (!u.pathname.startsWith('/api/transfer/')) return false
  const run = (p) => p.catch((e) => fail(res, e))
  const seg = u.pathname.split('/').slice(3) // ['estimate'] | ['import', token, 'apply']

  if (req.method === 'GET' && seg[0] === 'estimate' && !seg[1]) {
    const sel = parseParts(u)
    const denied = rightsFor(req, sel)
    if (denied) return json(res, 403, { ok: false, error: denied }), true
    try {
      json(res, 200, estimate(sel))
    } catch (e) {
      fail(res, e, 400)
    }
  } else if (req.method === 'GET' && seg[0] === 'export' && !seg[1]) run(exportZip(req, res, u))
  else if (req.method === 'POST' && seg[0] === 'import' && !seg[1]) run(importZip(req, res, u))
  else if (seg[0] === 'import' && /^[0-9a-f]{24}$/.test(seg[1] || '')) {
    const token = seg[1]
    if (req.method === 'GET' && !seg[2]) json(res, 200, { ok: true, progress: sessions.get(token)?.progress || null })
    else if (req.method === 'POST' && seg[2] === 'apply') run(applyImport(req, res, token))
    else if (req.method === 'DELETE' && !seg[2]) {
      if (sessions.get(token)?.busy) json(res, 409, { ok: false, error: 'Загрузка уже идёт' })
      else json(res, 200, { ok: true, removed: dropSession(token) })
    } else json(res, 405, { ok: false, error: 'Метод не поддерживается' })
  } else json(res, 404, { ok: false, error: 'Нет такого адреса' })
  return true
}
