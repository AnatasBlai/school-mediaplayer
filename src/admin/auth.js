// Вход в редактор. Сервер на запись без входа отвечает 401, без права на раздел — 403 (server/auth.js); здесь это
// перехватывается в одном месте: при 401 открывается окно входа и запрос повторяется (правка не теряется),
// при 403 показывается сообщение «Нет прав на этот раздел».
// Подключается только из редактора (экран входа не знает).
import { reactive } from 'vue'

export const auth = reactive({
  required: false, // есть пользователи (иначе редактор открыт всем)
  user: null, // { id, name, login, rights } — кто вошёл
  loggedIn: true,
  loginOpen: false, // окно «Вход в редактор» (или «Создать администратора», пока пользователей нет)
  passOpen: false, // окно «Мой пароль»
  usersOpen: false, // окно «Пользователи»
  setupOpen: false, // создание первого администратора
  denied: '', // сообщение о 403
})

/** Есть ли право: без пользователей (открытый режим) — всё можно; «admin» — всё. */
export function can(right) {
  if (!auth.required) return true
  const r = auth.user?.rights || []
  return r.includes('admin') || r.includes(right)
}

let waiters = []
let deniedTimer = 0

function showDenied(text) {
  auth.denied = text
  clearTimeout(deniedTimer)
  deniedTimer = setTimeout(() => (auth.denied = ''), 6000)
}

/** Открывает окно входа и ждёт, пока человек войдёт. Используют и fetch, и загрузка файлов (XHR). */
export function needLogin() {
  auth.required = true
  auth.loggedIn = false
  auth.user = null
  auth.loginOpen = true
  return new Promise((resolve) => waiters.push(resolve))
}

/** Сервер ответил 403 (загрузка файлов делает это сама). */
export const noRights = () => showDenied('Нет прав на этот раздел')

function loggedInNow(user) {
  auth.required = true
  auth.loggedIn = true
  auth.user = user || null
  auth.loginOpen = false
  auth.setupOpen = false
  const list = waiters
  waiters = []
  list.forEach((fn) => fn())
}

const rawFetch = window.fetch.bind(window)
const urlOf = (input) => (typeof input === 'string' ? input : input?.url || String(input))
window.fetch = async (input, init) => {
  for (;;) {
    const r = await rawFetch(input, init)
    const u = urlOf(input)
    if (!u.startsWith('/api/') || u.startsWith('/api/auth')) return r
    if (r.status === 403) noRights()
    if (r.status !== 401) return r
    await needLogin()
  }
}

async function call(method, url, body) {
  const r = await rawFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || `Ошибка сервера (${r.status})`)
  return d
}

export async function checkAuth() {
  try {
    const d = await (await rawFetch('/api/auth', { cache: 'no-store' })).json()
    auth.required = !!d.required
    auth.user = d.user || null
    auth.loggedIn = !d.required || !!d.user
    auth.loginOpen = auth.required && !auth.loggedIn
  } catch {
    /* сервера нет — окно входа не нужно */
  }
}

export async function login(loginName, password) {
  const d = await call('POST', '/api/auth/login', { login: loginName, password })
  loggedInNow(d.user)
}

export async function logout() {
  await call('POST', '/api/auth/logout', {})
  auth.loggedIn = false
  auth.user = null
  auth.loginOpen = true
}

/** Сменить свой пароль. */
export async function setPassword(current, next) {
  await call('PUT', '/api/auth/password', { current, next })
  auth.passOpen = false
}

/** Первый администратор (пока пользователей нет). */
export async function createAdmin(name, loginName, password) {
  const d = await call('POST', '/api/users', { name, login: loginName, password })
  await checkAuth()
  auth.setupOpen = false
  return d
}

// ---------- пользователи (только администратор) ----------
export const listUsers = async () => (await call('GET', '/api/users')).users
export const addUser = (u) => call('POST', '/api/users', u)
export const saveUser = (id, patch) => call('PUT', '/api/users/' + id, patch)
export const removeUser = (id) => call('DELETE', '/api/users/' + id)
