// Погода из Open-Meteo (без ключа) — data/weather.json { at, tried, ok, error?, place, lat, lon, current, daily }.
// at — время последнего УДАЧНОГО запроса, tried — последней попытки; при ошибке прошлые данные остаются (старше 6 ч экран
// их не показывает). Настройки — schedule.json settings.weather { on, place, lat, lon }; выключено — в интернет не ходим.
//   GET /api/weather → данные (открыт); при выключенной погоде { off: true }; SSE weather { at }
// Запускает только server.js (startWeatherScheduler); модуль при импорте data/ не трогает.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { broadcast } from './events.js'
import { parseForecast, cleanWeatherSettings } from '../src/weather.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const FILE = path.join(ROOT, 'data', 'weather.json')
const SCHEDULE_FILE = path.join(ROOT, 'data', 'schedule.json')

const PERIOD = 30 * 60e3 // как часто обновлять
const RETRY = 5 * 60e3 // после ошибки пробуем чаще
const TIMEOUT = 10_000

export function readSettings() {
  try {
    return cleanWeatherSettings(JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8')).settings?.weather)
  } catch {
    return cleanWeatherSettings(null)
  }
}

export function readWeather() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return null
  }
}

function writeWeather(d) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2), 'utf8')
  fs.renameSync(tmp, FILE)
}

/** Для окна «Состояние»: включена ли погода, когда обновлялась, что с ошибкой. */
export function weatherSummary() {
  const s = readSettings()
  const w = readWeather()
  return { on: s.on, place: s.place, at: w?.at || 0, tried: w?.tried || 0, ok: w ? w.ok !== false : true, error: w?.error || '' }
}

let busy = false
/** Один запрос погоды. Ошибка не бросается — записывается в weather.json. */
export async function updateWeather(s = readSettings()) {
  if (busy) return
  busy = true
  const old = readWeather()
  const tried = Date.now()
  try {
    const q = new URLSearchParams({
      latitude: s.lat,
      longitude: s.lon,
      current: 'temperature_2m,weather_code,wind_speed_10m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
      wind_speed_unit: 'ms',
      timezone: 'Asia/Yekaterinburg',
      forecast_days: 4,
    })
    console.log(`[погода] запрос: ${s.place} (${s.lat}, ${s.lon})`)
    const r = await fetch('https://api.open-meteo.com/v1/forecast?' + q, { signal: AbortSignal.timeout(TIMEOUT) })
    if (!r.ok) throw new Error('ответ ' + r.status)
    const f = parseForecast(await r.json())
    writeWeather({ at: tried, tried, ok: true, place: s.place, lat: s.lat, lon: s.lon, ...f })
    broadcast('weather', { at: tried })
  } catch (e) {
    const error = e?.name === 'TimeoutError' ? 'нет ответа за 10 с' : e?.cause?.code || e?.message || String(e)
    console.log('[погода] ошибка: ' + error)
    // прошлые данные остаются; чужое место (сменили настройки) не оставляем
    const same = old && old.lat === s.lat && old.lon === s.lon
    writeWeather({ ...(same ? old : {}), tried, ok: false, error, place: s.place, lat: s.lat, lon: s.lon })
    if (!same) broadcast('weather', { at: 0 })
  } finally {
    busy = false
  }
}

let wasOn = null
async function tick() {
  const s = readSettings()
  if (s.on !== wasOn) {
    // включили или выключили в настройках: экраны сразу перечитывают /api/weather
    if (wasOn !== null) broadcast('weather', { at: 0 })
    wasOn = s.on
  }
  if (!s.on) return
  const w = readWeather()
  const moved = w && (w.lat !== s.lat || w.lon !== s.lon)
  const due = !w || moved || Date.now() - (w.tried || 0) >= (w.ok === false ? RETRY : PERIOD)
  if (due) await updateWeather(s)
}

export function startWeatherScheduler() {
  setTimeout(tick, 5e3).unref()
  setInterval(tick, 60e3).unref()
}

/** Возвращает true, если запрос обработан. */
export function handleWeather(req, res) {
  const url = (req.url || '').split('?')[0]
  if (url !== '/api/weather') return false
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.end('{"ok":false}')
    return true
  }
  res.end(JSON.stringify(readSettings().on ? readWeather() || {} : { off: true }))
  return true
}
