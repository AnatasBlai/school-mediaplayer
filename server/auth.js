// Личные входы и права на разделы. Экран (/) работает без входа; чтение API открыто (кроме копий и списка пользователей).
//   data/users.json    { users: [{ id, name, login, salt, hash, rights: [], disabled }] } — scrypt-хэш; нет файла / пустой — входов нет,
//                      всё открыто (забыли пароль администратора: удалить файл)
//   data/sessions.json { token: { exp, user } } — вход помнится 30 дней и переживает перезапуск; старый формат (token: число) недействителен
//   data/auth.json     старый общий пароль: при старте превращается в пользователя admin (тот же пароль), файл → auth.json.old
// API:
//   GET  /api/auth           → { required, user: { id, name, login, rights } | null }
//   POST /api/auth/login     { login, password } → cookie tablo_session
//   POST /api/auth/logout
//   PUT  /api/auth/password  { current, next } — свой пароль (остальные входы этого человека завершаются)
//   GET/POST /api/users, PUT/DELETE /api/users/<id> — только «Администратор»; в ответах нет salt/hash.
//        Пока пользователей нет, POST /api/users открыт и создаёт первого администратора (и сразу входит).
// Отчёты экранов (POST /api/screens) и «взять карточку» (POST /api/decks/<id>/take) идут без входа.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
const AUTH_FILE = path.join(DATA, 'auth.json')
const USERS_FILE = path.join(DATA, 'users.json')
const SESSIONS_FILE = path.join(DATA, 'sessions.json')
const COOKIE = 'tablo_session'
const MAX_AGE = 30 * 24 * 3600 // секунд
const TRIES = 5
const PAUSE = 60e3

export const RIGHTS = ['schedule', 'playlist', 'decks', 'media', 'admin']

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

const hashOf = (password, salt) => crypto.scryptSync(password, Buffer.from(salt, 'hex'), 64)
function checkPassword(password, u) {
  const got = hashOf(String(password ?? ''), u.salt)
  const want = Buffer.from(u.hash, 'hex')
  return got.length === want.length && crypto.timingSafeEqual(got, want)
}
function makeHash(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  return { salt, hash: hashOf(password, salt).toString('hex') }
}

function readUsers() {
  const f = readJson(USERS_FILE)
  const list = Array.isArray(f?.users) ? f.users : []
  return list.filter((u) => u && typeof u.id === 'string' && typeof u.login === 'string' && typeof u.salt === 'string' && typeof u.hash === 'string')
}
const writeUsers = (users) => writeJson(USERS_FILE, { users })
const hasRight = (u, right) => u.rights.includes('admin') || u.rights.includes(right)
const publicUser = (u) => ({ id: u.id, name: u.name, login: u.login, rights: u.rights, disabled: !!u.disabled })

// старый общий пароль → пользователь admin со всеми правами (один раз; вызывает server.js при старте, не при импорте)
export function migrateOldPassword() {
  if (fs.existsSync(USERS_FILE)) return
  const a = readJson(AUTH_FILE)
  if (!a || typeof a.salt !== 'string' || typeof a.hash !== 'string') return
  writeUsers([{ id: crypto.randomBytes(4).toString('hex'), name: 'Администратор', login: 'admin', salt: a.salt, hash: a.hash, rights: [...RIGHTS], disabled: false }])
  try {
    fs.renameSync(AUTH_FILE, AUTH_FILE + '.old')
  } catch {
    /* не переименовался — users.json уже есть, повторно не мигрируем */
  }
}

function readSessions() {
  const s = readJson(SESSIONS_FILE) || {}
  const now = Date.now()
  const out = {}
  for (const [t, v] of Object.entries(s)) if (v && typeof v === 'object' && Number(v.exp) > now && typeof v.user === 'string') out[t] = v
  return out
}
/** Убирает входы пользователя (кроме токена `keep`). */
function dropSessions(userId, keep = '') {
  const s = readSessions()
  for (const [t, v] of Object.entries(s)) if (v.user === userId && t !== keep) delete s[t]
  writeJson(SESSIONS_FILE, s)
}

// ---------- вход ----------
function tokenOf(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim()
  }
  return ''
}
/** Кто вошёл: пользователь из users.json (не отключённый) или null. */
function userOf(req) {
  const t = tokenOf(req)
  const s = t && readSessions()[t]
  if (!s) return null
  const u = readUsers().find((x) => x.id === s.user)
  return u && !u.disabled ? u : null
}
function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex')
  const s = readSessions()
  s[token] = { exp: Date.now() + MAX_AGE * 1000, user: userId }
  writeJson(SESSIONS_FILE, s)
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${MAX_AGE}`)
}
function endCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`)
}

// неверные попытки: после 5 — пауза минута; считаются отдельно по IP и по логину
const fails = new Map() // ключ → { n, until }
const ipOf = (req) => req.socket?.remoteAddress || ''
const keysOf = (req, login) => ['ip:' + ipOf(req), ...(login ? ['login:' + login] : [])]
function waitLeft(keys) {
  let w = 0
  for (const k of keys) {
    const f = fails.get(k)
    if (f && f.until > Date.now()) w = Math.max(w, Math.ceil((f.until - Date.now()) / 1000))
  }
  return w
}
function fail(keys) {
  for (const k of keys) {
    const f = fails.get(k) || { n: 0, until: 0 }
    f.n++
    if (f.n >= TRIES) {
      f.n = 0
      f.until = Date.now() + PAUSE
    }
    fails.set(k, f)
  }
}

// ---------- права по адресу (одна таблица) ----------
// Какое право нужно для записи по адресу. null — без входа. Чтение (GET) открыто, кроме перечисленного в readRight.
// Новый адрес, не вошедший в таблицу, требует «admin» (закрыт по умолчанию).
const WRITE_RIGHTS = [
  [/^\/api\/data$/, 'schedule'], // расписание, изменения, звонки, настройки табло
  [/^\/api\/playlist$/, 'playlist'], // слайды, бегущая строка, гашение, срочный режим
  [/^\/api\/screens\//, 'playlist'], // «убрать экран из списка» — в разделе «Плейлист»
  [/^\/api\/decks(\/|$)/, 'decks'],
  [/^\/api\/media(\/|$)/, 'media'],
]
const OPEN_WRITES = [/^\/api\/auth(\/|$)/, /^\/api\/screens$/, /^\/api\/decks\/[^/]+\/take$/] // отчёт экрана, «взять карточку», вход (проверяют себя сами)
function rightFor(method, url) {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    // содержимое снимков и пользователи — только администратору
    return /^\/api\/(backup\/(snapshot\/|mirror$)|users(\/|$))/.test(url) ? 'admin' : null
  }
  if (OPEN_WRITES.some((re) => re.test(url))) return null
  if (method === 'POST' && url === '/api/users' && !readUsers().length) return null // первый администратор
  for (const [re, right] of WRITE_RIGHTS) if (re.test(url)) return right
  return 'admin'
}

/** Можно ли выполнить запрос → { ok, code } (401 — войдите, 403 — нет прав). Нет пользователей — всё открыто. */
export function isAllowed(req) {
  const url = (req.url || '').split('?')[0]
  const right = rightFor(req.method, url)
  if (!right || !readUsers().length) return { ok: true }
  const u = userOf(req)
  if (!u) return { ok: false, code: 401, error: 'Нужен вход в редактор' }
  if (!hasRight(u, right)) return { ok: false, code: 403, error: 'Нет прав на этот раздел' }
  return { ok: true }
}

/** Заданы ли входы (для окна «Состояние системы»). */
export const authRequired = () => readUsers().length > 0

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

const LOGIN_RE = /^[a-z0-9]{3,30}$/
const cleanRights = (r) => RIGHTS.filter((x) => Array.isArray(r) && r.includes(x))
const badPass = (p) => (typeof p !== 'string' || p.length < 4 || p.length > 100 ? 'Пароль — от 4 до 100 символов' : '')

/** Проверка имени и логина; id — кого правим (его логин не считается занятым). */
function checkIdentity(users, b, id) {
  const name = String(b.name ?? '').trim().slice(0, 60)
  const login = String(b.login ?? '').trim().toLowerCase()
  if (!name) return { error: 'Укажите имя' }
  if (!LOGIN_RE.test(login)) return { error: 'Логин — латиница и цифры, от 3 до 30 символов' }
  if (users.some((u) => u.login === login && u.id !== id)) return { error: 'Такой логин уже есть' }
  return { name, login }
}
const activeAdmins = (users) => users.filter((u) => !u.disabled && u.rights.includes('admin'))

function handleUsers(req, res, url) {
  const m = url.match(/^\/api\/users(?:\/([^/]+))?$/)
  if (!m) return send(res, 404, { ok: false })
  const id = m[1] ? decodeURIComponent(m[1]) : ''
  const me = userOf(req)

  if (req.method === 'GET' && !id) return send(res, 200, { users: readUsers().map(publicUser) })

  if (req.method === 'POST' && !id) {
    return readBody(req, (b) => {
      const users = readUsers()
      const first = !users.length
      const who = checkIdentity(users, b)
      if (who.error) return send(res, 400, { ok: false, error: who.error })
      const pe = badPass(b.password)
      if (pe) return send(res, 400, { ok: false, error: pe })
      const u = { id: crypto.randomBytes(4).toString('hex'), name: who.name, login: who.login, ...makeHash(b.password), rights: first ? [...RIGHTS] : cleanRights(b.rights), disabled: false }
      writeUsers([...users, u])
      if (first) startSession(res, u.id)
      send(res, 200, { ok: true, user: publicUser(u) })
    })
  }

  if (req.method === 'PUT' && id) {
    return readBody(req, (b) => {
      const users = readUsers()
      const u = users.find((x) => x.id === id)
      if (!u) return send(res, 404, { ok: false, error: 'Пользователя нет' })
      const who = checkIdentity(users, { name: b.name ?? u.name, login: b.login ?? u.login }, id)
      if (who.error) return send(res, 400, { ok: false, error: who.error })
      const rights = b.rights === undefined ? u.rights : cleanRights(b.rights)
      const disabled = b.disabled === undefined ? !!u.disabled : !!b.disabled
      const self = me && me.id === id
      if (self && disabled) return send(res, 400, { ok: false, error: 'Нельзя отключить самого себя' })
      const rest = activeAdmins(users.filter((x) => x.id !== id))
      if (u.rights.includes('admin') && !u.disabled && (disabled || !rights.includes('admin')) && !rest.length)
        return send(res, 400, { ok: false, error: 'Должен остаться хотя бы один администратор' })
      let pass = {}
      if (b.password !== undefined && b.password !== '') {
        const pe = badPass(b.password)
        if (pe) return send(res, 400, { ok: false, error: pe })
        pass = makeHash(b.password)
      }
      Object.assign(u, { name: who.name, login: who.login, rights, disabled }, pass)
      writeUsers(users)
      // сменили пароль или отключили — входы этого человека завершаются (свой — остаётся)
      if (pass.hash || disabled) dropSessions(id, self ? tokenOf(req) : '')
      send(res, 200, { ok: true, user: publicUser(u) })
    })
  }

  if (req.method === 'DELETE' && id) {
    const users = readUsers()
    const u = users.find((x) => x.id === id)
    if (!u) return send(res, 404, { ok: false, error: 'Пользователя нет' })
    if (me && me.id === id) return send(res, 400, { ok: false, error: 'Нельзя удалить самого себя' })
    if (u.rights.includes('admin') && !u.disabled && !activeAdmins(users.filter((x) => x.id !== id)).length)
      return send(res, 400, { ok: false, error: 'Должен остаться хотя бы один администратор' })
    writeUsers(users.filter((x) => x.id !== id))
    dropSessions(id)
    return send(res, 200, { ok: true })
  }

  send(res, 405, { ok: false })
}

export function handleAuth(req, res) {
  const url = (req.url || '').split('?')[0]
  if (/^\/api\/users(\/|$)/.test(url)) {
    handleUsers(req, res, url)
    return true
  }
  if (!url.startsWith('/api/auth')) return false

  if (url === '/api/auth' && req.method === 'GET') {
    const u = userOf(req)
    send(res, 200, { required: readUsers().length > 0, user: u ? { id: u.id, name: u.name, login: u.login, rights: u.rights } : null })
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
      const users = readUsers()
      if (!users.length) return send(res, 200, { ok: true })
      const login = String(b.login ?? '').trim().toLowerCase()
      const keys = keysOf(req, login)
      const wait = waitLeft(keys)
      if (wait) return send(res, 429, { ok: false, error: `Слишком много попыток. Подождите ${wait} с`, wait })
      const u = users.find((x) => x.login === login)
      // для неизвестного логина тоже считаем хэш — по времени ответа логины не угадать
      const good = u ? checkPassword(b.password, u) : (hashOf(String(b.password ?? ''), '00'), false)
      if (!good) {
        fail(keys)
        return send(res, 403, { ok: false, error: 'Неверный логин или пароль' })
      }
      if (u.disabled) return send(res, 403, { ok: false, error: 'Вход для этого пользователя отключён' })
      keys.forEach((k) => fails.delete(k))
      startSession(res, u.id)
      send(res, 200, { ok: true, user: publicUser(u) })
    })
    return true
  }

  if (url === '/api/auth/password' && req.method === 'PUT') {
    readBody(req, (b) => {
      const users = readUsers()
      const u = userOf(req)
      if (!u) return send(res, 401, { ok: false, error: 'Нужен вход' })
      const keys = keysOf(req, u.login)
      const wait = waitLeft(keys)
      if (wait) return send(res, 429, { ok: false, error: `Слишком много попыток. Подождите ${wait} с`, wait })
      if (!checkPassword(b.current, u)) {
        fail(keys)
        return send(res, 403, { ok: false, error: 'Текущий пароль неверный' })
      }
      const pe = badPass(b.next)
      if (pe) return send(res, 400, { ok: false, error: pe })
      Object.assign(users.find((x) => x.id === u.id), makeHash(b.next))
      writeUsers(users)
      dropSessions(u.id, tokenOf(req)) // на других компьютерах нужно войти заново
      send(res, 200, { ok: true })
    })
    return true
  }

  send(res, 404, { ok: false })
  return true
}
