import { reactive, ref, watch } from 'vue'
import { createDefaultData, GRADES } from './defaultData.js'

const LS_KEY = 'shedule-data-v1'

export const state = reactive(createDefaultData())
export const saveStatus = ref('') // '', 'saving', 'saved', 'offline'

let applyingRemote = false
let lastProbe = ''
const probeOf = () => JSON.stringify({ settings: state.settings, schedule: state.schedule, changes: state.changes })

function normalize(d) {
  const def = createDefaultData()
  const out = {
    version: 1,
    updatedAt: Number(d?.updatedAt) || 0,
    settings: { ...def.settings, ...(d?.settings || {}) },
    schedule: d?.schedule && typeof d.schedule === 'object' ? d.schedule : def.schedule,
    changes: d?.changes && typeof d.changes === 'object' ? d.changes : def.changes,
  }
  out.settings.letters = { ...def.settings.letters, ...(d?.settings?.letters || {}) }
  out.settings.interval = clamp(Number(out.settings.interval) || 15, 3, 600)
  out.settings.lessonsCount = clamp(Number(out.settings.lessonsCount) || 8, 1, 12)
  out.settings.changesInterval = clamp(Number(out.settings.changesInterval) || 20, 3, 600)
  out.settings.changesCols = clamp(Number(out.settings.changesCols) || 3, 1, 4)
  if (!Array.isArray(out.settings.bells) || !out.settings.bells.length) out.settings.bells = def.settings.bells
  return out
}

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v))
}

function apply(d) {
  applyingRemote = true
  const n = normalize(d)
  state.updatedAt = n.updatedAt
  state.settings = n.settings
  state.schedule = n.schedule
  state.changes = n.changes
  lastProbe = probeOf()
  Promise.resolve().then(() => (applyingRemote = false))
}

export async function loadData() {
  try {
    const r = await fetch('/api/data', { cache: 'no-store' })
    if (r.ok) {
      apply(await r.json())
      return
    }
    if (r.status === 404) {
      // первый запуск — сохраняем стартовые данные на сервер
      const ls = readLocal()
      apply(ls || createDefaultData())
      await pushToServer()
      return
    }
  } catch {
    /* сервера нет — работаем из браузера */
  }
  const ls = readLocal()
  if (ls) apply(ls)
  saveStatus.value = 'offline'
}

function readLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

async function pushToServer() {
  const json = JSON.stringify(state)
  try {
    localStorage.setItem(LS_KEY, json)
  } catch {
    /* ignore */
  }
  try {
    saveStatus.value = 'saving'
    const r = await fetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    })
    saveStatus.value = r.ok ? 'saved' : 'offline'
  } catch {
    saveStatus.value = 'offline'
  }
}

let timer = null
watch(
  state,
  () => {
    if (applyingRemote) return
    const probe = probeOf()
    if (probe === lastProbe) return
    lastProbe = probe
    state.updatedAt = Date.now()
    clearTimeout(timer)
    timer = setTimeout(pushToServer, 300)
  },
  { deep: true },
)

/** Подтягивает изменения, сделанные с другого компьютера (например, экран видит правки из редактора). */
async function pollRemote() {
  try {
    const r = await fetch('/api/data', { cache: 'no-store' })
    if (!r.ok) return
    const d = await r.json()
    if ((Number(d.updatedAt) || 0) > state.updatedAt) {
      apply(d)
    }
  } catch {
    /* ignore */
  }
}

// ---------- синхронизация через SSE ----------

export const connected = ref(true) // есть ли связь с сервером (для строки состояния в редакторе)

/**
 * Загружает данные и подписывается на /api/events: сервер сообщает о каждой правке,
 * и страница сразу забирает свежие данные.
 * reloadOnRestart — перезагрузить страницу, если сервер перезапустили (экран так получает новую сборку).
 */
export async function startSync({ reloadOnRestart = false } = {}) {
  await loadData()
  if (typeof EventSource === 'undefined') return
  let boot = null
  const es = new EventSource('/api/events')
  es.addEventListener('hello', (e) => {
    connected.value = true
    const b = JSON.parse(e.data).boot
    if (boot && b !== boot && reloadOnRestart) return location.reload()
    // переподключились после обрыва — могли пропустить правки
    if (boot) pollRemote()
    boot = b
  })
  es.addEventListener('data', (e) => {
    if ((Number(JSON.parse(e.data).updatedAt) || 0) > state.updatedAt) pollRemote()
  })
  // EventSource сам переподключается через 3 с (retry), здесь только отмечаем обрыв
  es.onerror = () => (connected.value = false)
}

// ---------- доступ к урокам ----------

export function getLessons(grade, day, letter) {
  const count = state.settings.lessonsCount
  const arr = state.schedule?.[grade]?.[day]?.[letter] || []
  const res = []
  for (let i = 0; i < count; i++) res.push(arr[i] || { s: '', r: '' })
  return res
}

export function setLessonField(grade, day, letter, idx, field, value) {
  const sch = state.schedule
  sch[grade] ??= {}
  sch[grade][day] ??= {}
  sch[grade][day][letter] ??= []
  const arr = sch[grade][day][letter]
  while (arr.length <= idx) arr.push({ s: '', r: '' })
  arr[idx] = { ...arr[idx], [field]: value }
  // убираем пустой хвост, чтобы файл оставался аккуратным
  while (arr.length && !arr[arr.length - 1].s && !arr[arr.length - 1].r) arr.pop()
}

// ---------- изменения ----------

export function getChanges(col) {
  const count = state.settings.lessonsCount
  const arr = state.changes?.[col] || []
  const res = []
  for (let i = 0; i < count; i++) res.push(arr[i] || { c: '', t: '', r: '' })
  return res
}

export function setChangeField(col, idx, field, value) {
  state.changes ??= {}
  state.changes[col] ??= []
  const arr = state.changes[col]
  while (arr.length <= idx) arr.push({ c: '', t: '', r: '' })
  arr[idx] = { ...arr[idx], [field]: value }
  const empty = (x) => !x.c && !x.t && !x.r
  while (arr.length && empty(arr[arr.length - 1])) arr.pop()
}

export function hasChanges() {
  return Object.values(state.changes || {}).some((col) => (col || []).some((x) => x.c || x.t || x.r))
}

export function clearChanges() {
  state.changes = { ch0: [], ch1: [], ch2: [] }
}

/** Последний урок дня, который есть хоть у одного класса (для звонков). */
export function maxLessonOfDay(day) {
  let max = 0
  for (const g of Object.values(state.schedule || {})) {
    for (const arr of Object.values(g?.[day] || {})) {
      for (let i = (arr || []).length - 1; i >= 0; i--) {
        if (arr[i]?.s) {
          max = Math.max(max, i + 1)
          break
        }
      }
    }
  }
  return max
}

export { GRADES }

// стартовое значение «пробы», чтобы первая загрузка не считалась правкой
lastProbe = probeOf()
