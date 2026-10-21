import { test } from 'node:test'
import assert from 'node:assert/strict'
import { weatherKind, fmtTemp, fmtTempShort, parseForecast, cleanWeatherSettings, isFresh, weatherTitle, nextDays, weatherLine, STALE_MS } from '../src/weather.js'

test('weatherKind: коды WMO → значок и слово', () => {
  assert.deepEqual(weatherKind(0), { icon: 'sun', word: 'ясно' })
  assert.equal(weatherKind(2).icon, 'partly')
  assert.equal(weatherKind(3).icon, 'cloud')
  assert.equal(weatherKind(45).icon, 'fog')
  assert.equal(weatherKind(63).icon, 'rain')
  assert.equal(weatherKind(81).icon, 'rain')
  assert.equal(weatherKind(73).icon, 'snow')
  assert.equal(weatherKind(86).icon, 'snow')
  assert.equal(weatherKind(95).icon, 'storm')
  assert.equal(weatherKind(99).word, 'гроза с градом')
  assert.deepEqual(weatherKind(12345), { icon: 'cloud', word: 'облачно' })
})

test('fmtTemp: настоящий минус, ноль без знака, округление', () => {
  assert.equal(fmtTemp(-3.4), '−3°')
  assert.equal(fmtTemp(5.6), '+6°')
  assert.equal(fmtTemp(-0.2), '0°')
  assert.equal(fmtTemp(NaN), '—')
  assert.equal(fmtTempShort(5), '5°')
  assert.equal(fmtTempShort(-25), '−25°')
})

const SAMPLE = {
  current: { temperature_2m: -3.2, weather_code: 3, wind_speed_10m: 2.6 },
  daily: { time: ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'], weather_code: [3, 61, 71, 0], temperature_2m_max: [1, 4, -2, 0], temperature_2m_min: [-5, 0, -8, -6] },
}

test('parseForecast: текущая погода и 4 дня', () => {
  const w = parseForecast(SAMPLE)
  assert.deepEqual(w.current, { temp: -3.2, code: 3, wind: 2.6 })
  assert.equal(w.daily.length, 4)
  assert.deepEqual(w.daily[1], { date: '2026-10-22', code: 61, max: 4, min: 0 })
})

test('parseForecast: без температуры — ошибка, битые дни пропускаются', () => {
  assert.throws(() => parseForecast({ current: {} }))
  assert.throws(() => parseForecast(null))
  const w = parseForecast({ ...SAMPLE, daily: { ...SAMPLE.daily, temperature_2m_max: [1, null, 2, 3] } })
  assert.equal(w.daily.length, 3)
})

test('cleanWeatherSettings: умолчания, границы координат', () => {
  assert.deepEqual(cleanWeatherSettings(undefined), { on: false, place: 'Учалы', lat: 54.32, lon: 59.38 })
  assert.equal(cleanWeatherSettings({ on: true }).on, true)
  assert.equal(cleanWeatherSettings({ on: 'yes' }).on, false)
  assert.equal(cleanWeatherSettings({ lat: 100, lon: 10 }).lat, 54.32)
  assert.equal(cleanWeatherSettings({ lat: '55.5', lon: '37.6', place: ' Москва ' }).lat, 55.5)
  assert.equal(cleanWeatherSettings({ place: ' Москва ' }).place, 'Москва')
})

test('isFresh: старше 6 часов — устарели', () => {
  const now = 1_000_000_000_000
  const w = { at: now - 1000, current: { temp: 1, code: 0, wind: 0 } }
  assert.equal(isFresh(w, now), true)
  assert.equal(isFresh({ ...w, at: now - STALE_MS - 1 }, now), false)
  assert.equal(isFresh({ at: now }, now), false)
  assert.equal(isFresh(null, now), false)
})

test('weatherTitle, nextDays, weatherLine', () => {
  assert.equal(weatherTitle('Учалы'), 'Погода в Учалах')
  assert.equal(weatherTitle('Москва'), 'Погода: Москва')
  const w = { ...parseForecast(SAMPLE), at: 1 }
  assert.deepEqual(nextDays(w, new Date(2026, 9, 21)).map((d) => d.date), ['2026-10-22', '2026-10-23', '2026-10-24'])
  assert.equal(nextDays(w, new Date(2026, 9, 23)).length, 1)
  assert.equal(weatherLine(w), '−3° · пасмурно')
  assert.equal(weatherLine(null), '')
})
