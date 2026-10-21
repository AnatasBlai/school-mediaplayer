// Погода без Vue (его импортирует и сервер): таблица кодов WMO → значок и слово, разбор ответа Open-Meteo,
// подписи для панелей и слайда. Сами запросы в интернет — server/weather.js.

export const DEFAULT_WEATHER = { on: false, place: 'Учалы', lat: 54.32, lon: 59.38 }
export const STALE_MS = 6 * 3600e3 // данные старше шести часов не показываем

// значки: sun | partly | cloud | rain | snow | storm | fog (рисует display/WeatherIcon.vue)
const CODES = {
  0: ['sun', 'ясно'],
  1: ['sun', 'малооблачно'],
  2: ['partly', 'переменная облачность'],
  3: ['cloud', 'пасмурно'],
  45: ['fog', 'туман'],
  48: ['fog', 'изморозь'],
  51: ['rain', 'морось'],
  53: ['rain', 'морось'],
  55: ['rain', 'сильная морось'],
  56: ['rain', 'ледяная морось'],
  57: ['rain', 'ледяная морось'],
  61: ['rain', 'небольшой дождь'],
  63: ['rain', 'дождь'],
  65: ['rain', 'сильный дождь'],
  66: ['rain', 'ледяной дождь'],
  67: ['rain', 'ледяной дождь'],
  71: ['snow', 'небольшой снег'],
  73: ['snow', 'снег'],
  75: ['snow', 'сильный снег'],
  77: ['snow', 'снежная крупа'],
  80: ['rain', 'небольшой ливень'],
  81: ['rain', 'ливень'],
  82: ['rain', 'сильный ливень'],
  85: ['snow', 'снегопад'],
  86: ['snow', 'сильный снегопад'],
  95: ['storm', 'гроза'],
  96: ['storm', 'гроза с градом'],
  99: ['storm', 'гроза с градом'],
}
const UNKNOWN = ['cloud', 'облачно']

/** { icon, word } по коду WMO; неизвестный код — «облачно». */
export function weatherKind(code) {
  const [icon, word] = CODES[Number(code)] || UNKNOWN
  return { icon, word }
}

/** «−3°», «+5°», «0°» (настоящий минус, не дефис). */
export function fmtTemp(t) {
  const n = Math.round(Number(t))
  if (!Number.isFinite(n)) return '—'
  return n === 0 ? '0°' : n < 0 ? '−' + -n + '°' : '+' + n + '°'
}

/** Температура без знака плюс — для крупной цифры и строки панели. */
export const fmtTempShort = (t) => fmtTemp(t).replace('+', '')

const num = (v) => (v !== null && v !== '' && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : null)

/**
 * Разбирает ответ Open-Meteo в { current: { temp, code, wind }, daily: [{ date, code, max, min }] }.
 * Нет текущей температуры — ошибка (бросает Error).
 */
export function parseForecast(j) {
  const c = j?.current
  const temp = num(c?.temperature_2m)
  if (temp === null) throw new Error('в ответе нет температуры')
  const d = j?.daily || {}
  const daily = []
  for (let i = 0; i < (Array.isArray(d.time) ? d.time.length : 0) && i < 4; i++) {
    const max = num(d.temperature_2m_max?.[i])
    const min = num(d.temperature_2m_min?.[i])
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.time[i]) || max === null || min === null) continue
    daily.push({ date: d.time[i], code: num(d.weather_code?.[i]) ?? 3, max, min })
  }
  return { current: { temp, code: num(c.weather_code) ?? 3, wind: num(c.wind_speed_10m) ?? 0 }, daily }
}

/** Настройки погоды из schedule.json: чужие и битые значения заменяются умолчаниями. */
export function cleanWeatherSettings(w) {
  const lat = num(w?.lat)
  const lon = num(w?.lon)
  const ok = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  return {
    on: w?.on === true,
    place: String(w?.place ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || DEFAULT_WEATHER.place,
    lat: ok ? lat : DEFAULT_WEATHER.lat,
    lon: ok ? lon : DEFAULT_WEATHER.lon,
  }
}

/** Свежие ли данные (weather.json: at — время последнего удачного запроса). */
export const isFresh = (w, nowMs = Date.now()) => !!(w && w.current && w.at && nowMs - w.at < STALE_MS && nowMs >= w.at - 3600e3)

/** Заголовок слайда: «Погода в Учалах» для Учал, для остальных мест — «Погода: Название». */
export const weatherTitle = (place) => (!place || place === DEFAULT_WEATHER.place ? 'Погода в Учалах' : 'Погода: ' + place)

const DAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
/** Название дня недели по 'ГГГГ-ММ-ДД'. */
export const dayNameOf = (ymd) => DAYS[new Date(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)).getDay()]

/** Дни прогноза после сегодняшнего (до 3) — карточки на слайде. */
export function nextDays(w, now = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
  return (w?.daily || []).filter((d) => d.date > today).slice(0, 3)
}

/** Строка для панелей: «−3° · облачно». */
export function weatherLine(w) {
  return w?.current ? `${fmtTempShort(w.current.temp)} · ${weatherKind(w.current.code).word}` : ''
}
