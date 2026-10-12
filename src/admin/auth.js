// Вход в редактор. Сервер на запись без входа отвечает 401 (server/auth.js); здесь это перехватывается в одном месте:
// fetch оборачивается так, что при 401 открывается окно входа, а после входа запрос повторяется — правка не теряется.
// Подключается только из редактора (экран пароля не знает).
import { reactive } from 'vue'

export const auth = reactive({
  required: false, // пароль задан
  loggedIn: true,
  loginOpen: false, // окно «Вход в редактор»
  passOpen: false, // окно «Пароль»
})

let waiters = []

/** Открывает окно входа и ждёт, пока человек войдёт. Используют и fetch, и загрузка файлов (XHR). */
export function needLogin() {
  auth.required = true
  auth.loggedIn = false
  auth.loginOpen = true
  return new Promise((resolve) => waiters.push(resolve))
}

function loggedInNow() {
  auth.required = true
  auth.loggedIn = true
  auth.loginOpen = false
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
    if (r.status !== 401 || !u.startsWith('/api/') || u.startsWith('/api/auth')) return r
    await needLogin()
  }
}

async function post(method, url, body) {
  const r = await rawFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || `Ошибка сервера (${r.status})`)
  return d
}

export async function checkAuth() {
  try {
    const d = await (await rawFetch('/api/auth', { cache: 'no-store' })).json()
    auth.required = !!d.required
    auth.loggedIn = !d.required || !!d.loggedIn
    auth.loginOpen = auth.required && !auth.loggedIn
  } catch {
    /* сервера нет — окно входа не нужно */
  }
}

export async function login(password) {
  await post('POST', '/api/auth/login', { password })
  loggedInNow()
}

export async function logout() {
  await post('POST', '/api/auth/logout', {})
  auth.loggedIn = false
  auth.loginOpen = true
}

/** Задать / сменить пароль; next пустой — убрать. */
export async function setPassword(current, next) {
  const d = await post('PUT', '/api/auth/password', { current, next })
  auth.required = !!d.required
  auth.loggedIn = true
  auth.loginOpen = false
  auth.passOpen = false
}
