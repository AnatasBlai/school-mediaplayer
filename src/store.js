import { reactive, ref, watch } from 'vue'
import { createDefaultData, GRADES } from './defaultData.js'
import { bellsForDay, bellStatus } from './bells.js'
import { makeSaver } from './saver.js'

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.settings.changesDate)) out.settings.changesDate = ''
  if (!Array.isArray(out.settings.bells) || !out.settings.bells.length) out.settings.bells = def.settings.bells
  return out
}

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v))
}

function applyDoc(n) {
  applyingRemote = true
  state.updatedAt = n.updatedAt
  state.settings = n.settings
  state.schedule = n.schedule
  state.changes = n.changes
  lastProbe = probeOf()
  Promise.resolve().then(() => (applyingRemote = false))
}

const saver = makeSaver({
  url: '/api/data',
  status: saveStatus,
  snapshot: () => JSON.parse(JSON.stringify(state)),
  normalize,
  applyDoc,
  beforeSend: (doc) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(doc))
    } catch {
      /* ignore */
    }
  },
})

function apply(d) {
  const n = normalize(d)
  applyDoc(n)
  saver.setBase(n)
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
  if (ls) applyDoc(normalize(ls)) // базы нет: свежие данные сервера потом не будут приняты за старые
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

const pushToServer = () => saver.push()

watch(
  state,
  () => {
    if (applyingRemote) return
    const probe = probeOf()
    if (probe === lastProbe) return
    lastProbe = probe
    state.updatedAt = Date.now()
    saver.schedule()
  },
  { deep: true },
)

/** Подтягивает изменения, сделанные с другого компьютера (например, экран видит правки из редактора). */
async function pollRemote() {
  try {
    const r = await fetch('/api/data', { cache: 'no-store' })
    if (!r.ok) return
    await saver.receive(await r.json())
  } catch {
    /* ignore */
  }
}

// ---------- синхронизация через SSE ----------

export const connected = ref(true) // есть ли связь с сервером (для строки состояния в редакторе)

let es = null
const extraListeners = [] // [type, fn] — подписки компонентов (например, медиатека слушает 'media')

/**
 * Подписка на событие сервера (media, hello…). fn получает разобранные данные события.
 * Возвращает функцию отписки — вызывать в onBeforeUnmount.
 */
export function onServerEvent(type, fn) {
  const entry = [type, (e) => fn(JSON.parse(e.data || '{}'))]
  extraListeners.push(entry)
  es?.addEventListener(...entry)
  return () => {
    es?.removeEventListener(...entry)
    extraListeners.splice(extraListeners.indexOf(entry), 1)
  }
}

/**
 * Загружает данные и подписывается на /api/events: сервер сообщает о каждой правке,
 * и страница сразу забирает свежие данные.
 * reloadOnRestart — перезагрузить страницу, если сервер перезапустили (экран так получает новую сборку).
 */
export async function startSync({ reloadOnRestart = false } = {}) {
  await loadData()
  if (typeof EventSource === 'undefined') return
  let boot = null
  es = new EventSource('/api/events')
  for (const entry of extraListeners) es.addEventListener(...entry)
  es.addEventListener('hello', (e) => {
    connected.value = true
    const b = JSON.parse(e.data).boot
    if (boot && b !== boot && reloadOnRestart) return location.reload()
    // переподключились после обрыва — могли пропустить правки
    if (boot) pollRemote()
    boot = b
  })
  es.addEventListener('data', (e) => {
    if ((Number(JSON.parse(e.data).updatedAt) || 0) > saver.baseUpdated()) pollRemote()
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

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Изменения «действуют» на экране: дата не задана или указанный день ещё не закончился (по часам ПК). */
export function changesActive(now = new Date()) {
  const d = state.settings.changesDate
  return !d || ymd(now) <= d
}

/** Есть ли непустые строки изменений (независимо от даты). */
export function hasChangeRows() {
  return Object.values(state.changes || {}).some((col) => (col || []).some((x) => x.c || x.t || x.r))
}

/** Есть ли что показать на экране сейчас: строки есть и день не прошёл. */
export function hasChanges(now = new Date()) {
  return changesActive(now) && hasChangeRows()
}

export { ymd }

export function clearChanges() {
  state.changes = { ch0: [], ch1: [], ch2: [] }
  state.settings.changesDate = ''
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

/**
 * Идёт ли сейчас перемена: между звонками сегодняшнего дня (звонки — из настроек расписания, уроки — до последнего,
 * который есть сегодня). До первого урока, после последнего и в воскресенье — не перемена.
 */
export function isBreak(now = new Date()) {
  const dow = now.getDay()
  if (dow === 0) return false
  return bellStatus(bellsForDay(state.settings.bells, dow), now, maxLessonOfDay(dow)).kind === 'break'
}
