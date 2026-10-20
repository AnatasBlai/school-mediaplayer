// Пароль на редактор. Экран (/) работает без пароля; без входа сервер отклоняет все записи (401), чтение открыто (кроме снимков копий).
//   data/auth.json     { salt, hash } — scrypt-хэш пароля; нет файла — пароля нет (забыли пароль: удалить файл)
//   data/sessions.json { token: expiresAt } — вход помнится 30 дней и переживает перезапуск сервера
// API:
//   GET  /api/auth           → { required, loggedIn }
//   POST /api/auth/login     { password } → cookie tablo_session
//   POST /api/auth/logout
//   PUT  /api/auth/password  { current, next } — задать / сменить; next пустой — убрать пароль
// Без пароля остаются отчёты экранов (POST /api/screens) и «взять карточку» (POST /api/decks/<id>/take).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
const AUTH_FILE = path.join(DATA, 'auth.json')
const SESSIONS_FILE = path.join(DATA, 'sessions.json')
const COOKIE = 'tablo_session'
const MAX_AGE = 30 * 24 * 3600 // секунд
const TRIES = 5
const PAUSE = 60e3

// ---------- хранилище ----------
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}
function writeJson(file, obj) {
  fs.mkdirSync(DATA, { recursive: true })
  fs.writeFileSync(file + '.tmp', JSON.stringify(obj), 'utf8')
  fs.renameSync(file + '.tmp', file)
}
function readAuth() {
  const a = readJson(AUTH_FILE)
  return a && typeof a.salt === 'string' && typeof a.hash === 'string' ? a : null
}
function readSessions() {
  const s = readJson(SESSIONS_FILE) || {}
  const now = Date.now()
  const out = {}
  for (const [t, exp] of Object.entries(s)) if (Number(exp) > now) out[t] = Number(exp)
  return out
}

const hashOf = (password, salt) => crypto.scryptSync(password, Buffer.from(salt, 'hex'), 64)
function checkPassword(password, auth) {
  const got = hashOf(String(password ?? ''), auth.salt)
  const want = Buffer.from(auth.hash, 'hex')
  return got.length === want.length && crypto.timingSafeEqual(got, want)
}

// ---------- вход ----------
function tokenOf(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim()
  }
  return ''
}
function loggedIn(req) {
  const t = tokenOf(req)
  return !!t && !!readSessions()[t]
}
function startSession(res) {
  const token = crypto.randomBytes(32).toString('hex')
  const s = readSessions()
  s[token] = Date.now() + MAX_AGE * 1000
  writeJson(SESSIONS_FILE, s)
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${MAX_AGE}`)
}
function endCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`)
}

// неверные попытки по IP: после 5 — пауза минута
const fails = new Map() // ip → { n, until }
const ipOf = (req) => req.socket?.remoteAddress || ''
function waitLeft(req) {
  const f = fails.get(ipOf(req))
  return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0
}
function fail(req) {
  const ip = ipOf(req)
  const f = fails.get(ip) || { n: 0, until: 0 }
  f.n++
  if (f.n >= TRIES) {
    f.n = 0
    f.until = Date.now() + PAUSE
  }
  fails.set(ip, f)
}

/** Можно ли выполнить запрос: чтение и исключения открыты, остальное — после входа (если пароль задан). */
export function isAllowed(req) {
  const url = (req.url || '').split('?')[0]
  // содержимое снимков — личные данные: читать только после входа
  if (req.method === 'GET' && /^\/api\/backup\/(snapshot\/|mirror$)/.test(url)) return !readAuth() || loggedIn(req)
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return true
  if (url.startsWith('/api/auth')) return true // эти запросы проверяют себя сами
  if (req.method === 'POST' && (url === '/api/screens' || /^\/api\/decks\/[^/]+\/take$/.test(url))) return true
  return !readAuth() || loggedIn(req)
}

/** Задан ли пароль на редактор (для окна «Состояние системы»). */
export const authRequired = () => !!readAuth()

// ---------- API ----------
function send(res, code, obj) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(obj))
}
function readBody(req, cb) {
  let body = ''
  req.setEncoding('utf8')
  req.on('data', (c) => {
    body += c
    if (body.length > 10_000) req.destroy()
  })
  req.on('end', () => {
    try {
      cb(JSON.parse(body || '{}') || {})
    } catch {
      cb({})
    }
  })
}

export function handleAuth(req, res) {
  const url = (req.url || '').split('?')[0]
  if (!url.startsWith('/api/auth')) return false

  if (url === '/api/auth' && req.method === 'GET') {
    send(res, 200, { required: !!readAuth(), loggedIn: loggedIn(req) })
    return true
  }

  if (url === '/api/auth/logout' && req.method === 'POST') {
    const t = tokenOf(req)
    const s = readSessions()
    if (t && s[t]) {
      delete s[t]
      writeJson(SESSIONS_FILE, s)
    }
    endCookie(res)
    send(res, 200, { ok: true })
    return true
  }

  if (url === '/api/auth/login' && req.method === 'POST') {
    readBody(req, (b) => {
      const auth = readAuth()
      if (!auth) return send(res, 200, { ok: true })
      const wait = waitLeft(req)
      if (wait) return send(res, 429, { ok: false, error: `Слишком много попыток. Подождите ${wait} с`, wait })
      if (!checkPassword(b.password, auth)) {
        fail(req)
        return send(res, 403, { ok: false, error: 'Неверный пароль' })
      }
      fails.delete(ipOf(req))
      startSession(res)
      send(res, 200, { ok: true })
    })
    return true
  }

  if (url === '/api/auth/password' && req.method === 'PUT') {
    readBody(req, (b) => {
      const auth = readAuth()
      if (auth) {
        if (!loggedIn(req)) return send(res, 401, { ok: false, error: 'Нужен вход' })
        const wait = waitLeft(req)
        if (wait) return send(res, 429, { ok: false, error: `Слишком много попыток. Подождите ${wait} с`, wait })
        if (!checkPassword(b.current, auth)) {
          fail(req)
          return send(res, 403, { ok: false, error: 'Текущий пароль неверный' })
        }
      }
      const next = String(b.next ?? '')
      writeJson(SESSIONS_FILE, {}) // старые входы больше недействительны
      if (!next) {
        try {
          fs.unlinkSync(AUTH_FILE)
        } catch {
          /* файла и не было */
        }
        endCookie(res)
        return send(res, 200, { ok: true, required: false })
      }
      if (next.length < 4 || next.length > 100) return send(res, 400, { ok: false, error: 'Пароль — от 4 до 100 символов' })
      const salt = crypto.randomBytes(16).toString('hex')
      writeJson(AUTH_FILE, { salt, hash: hashOf(next, salt).toString('hex') })
      startSession(res) // тот, кто сменил пароль, остаётся внутри
      send(res, 200, { ok: true, required: true })
    })
    return true
  }

  send(res, 404, { ok: false })
  return true
}
