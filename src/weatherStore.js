// Погода на клиенте: GET /api/weather — при первом обращении, по SSE `weather`, при переподключении и раз в 5 минут.
// freshWeather — только свежие данные (младше 6 ч, погода включена); иначе null, и панели/слайд погоду не показывают.
import { computed, ref } from 'vue'
import { onServerEvent } from './store.js'
import { isFresh } from './weather.js'

const data = ref(null)
export const weatherLoaded = ref(false) // первый ответ сервера получен (или не получен — тогда экран ждёт не дольше 5 с)
const clock = ref(Date.now())
let started = false

async function load() {
  try {
    const r = await fetch('/api/weather', { cache: 'no-store' })
    if (r.ok) data.value = await r.json()
    weatherLoaded.value = true
  } catch {
    /* нет связи с сервером — остаётся прошлое (старше 6 ч оно само перестанет показываться) */
  }
}

/** Свежая погода или null. Первый вызов запускает загрузку. */
export function useWeather() {
  if (!started) {
    started = true
    load()
    onServerEvent('weather', load)
    onServerEvent('hello', load)
    setInterval(load, 5 * 60e3)
    setInterval(() => (clock.value = Date.now()), 60e3)
  }
  return freshWeather
}

export const freshWeather = computed(() => (data.value && !data.value.off && isFresh(data.value, clock.value) ? data.value : null))
