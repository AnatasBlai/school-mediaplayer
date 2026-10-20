// Экраны и что они сейчас показывают (GET /api/screens, обновление по SSE 'screens').
import { computed, reactive } from 'vue'
import { onServerEvent, state, maxLessonOfDay } from '../store.js'
import { silentScreens } from '../screenAlerts.js'

export const ONLINE_MS = 75_000 // экран шлёт отчёт раз в 30 с; дольше 75 с тишины — считаем, что связи нет

// skew — разница часов сервера и этого компьютера, чтобы «идёт N с» не врало
export const screens = reactive({ items: [], skew: 0, now: Date.now(), loaded: false })

async function load() {
  try {
    const r = await fetch('/api/screens', { cache: 'no-store' })
    if (!r.ok) return
    const d = await r.json()
    screens.skew = d.now - Date.now()
    screens.items = d.items
    screens.loaded = true
  } catch {
    /* нет связи */
  }
}

/** Время по часам сервера. */
export const serverNow = () => screens.now + screens.skew
export const isOnline = (s) => serverNow() - s.seen < ONLINE_MS

export const screenLabel = (s) => s.name || 'Экран ' + s.ip

/** Экраны для списка: тот же компьютер с другим id (очистили данные браузера, другой браузер) — старую запись прячем. */
export const visibleScreens = computed(() => {
  const live = new Set(screens.items.filter(isOnline).map((s) => screenLabel(s) + '|' + s.ip))
  return screens.items.filter((s) => isOnline(s) || !live.has(screenLabel(s) + '|' + s.ip))
})

/** Экраны, которые молчат в учебное время (плашка в шапке, строка «Экраны» в «Состоянии»). */
export const silentList = computed(() => {
  void screens.now
  return silentScreens(visibleScreens.value, serverNow(), { bells: state.settings.bells, maxLessonOf: maxLessonOfDay, online: isOnline })
})

export async function removeScreen(id) {
  await fetch('/api/screens/' + encodeURIComponent(id), { method: 'DELETE' })
  await load()
}

/** id слайдов, которые сейчас идут хоть на одном экране на связи. */
export const onScreenIds = computed(() => new Set(screens.items.filter(isOnline).map((s) => s.slide.id)))

let started = false
export function startScreens() {
  if (started) return
  started = true
  load()
  onServerEvent('screens', load)
  onServerEvent('hello', load)
  // «идёт N с» и «на связи» пересчитываются раз в секунду; список — раз в 20 с (экран мог пропасть молча)
  setInterval(() => (screens.now = Date.now()), 1000)
  setInterval(load, 20_000)
}
