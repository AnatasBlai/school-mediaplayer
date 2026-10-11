// Правила показа слайда: when = { dateFrom, dateTo: 'ГГГГ-ММ-ДД', timeFrom, timeTo: 'ЧЧ:ММ', days: [1..7] }.
// Пустое поле — без ограничения. Дни: 1 — понедельник … 7 — воскресенье, [] — каждый день.
// Время до timeTo не включительно, даты — включительно. timeFrom > timeTo — интервал через полночь (22:00–06:00).
// Проверяются по часам устройства, которое показывает страницу (как и звонки).

export const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
export const EMPTY_WHEN = { dateFrom: '', dateTo: '', timeFrom: '', timeTo: '', days: [] }

const pad = (n) => String(n).padStart(2, '0')
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const fmtDate = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}${iso.slice(0, 4) === String(new Date().getFullYear()) ? '' : '.' + iso.slice(0, 4)}`
const fmtTime = (hhmm) => hhmm.replace(/^0(\d)/, '$1')

export function hasRules(w) {
  return !!w && !!(w.dateFrom || w.dateTo || w.timeFrom || w.timeTo || w.days?.length)
}

/** Подходит ли момент now под правила: { ok, reason } — reason объясняет, почему слайд сейчас не идёт. */
export function ruleState(w, now = new Date()) {
  if (!hasRules(w)) return { ok: true, reason: '' }
  const today = isoDate(now)
  if (w.dateFrom && w.dateTo && w.dateFrom > w.dateTo) return { ok: false, reason: 'дата «по» раньше даты «с»' }
  if (w.dateFrom && today < w.dateFrom) return { ok: false, reason: `начнётся ${fmtDate(w.dateFrom)}` }
  if (w.dateTo && today > w.dateTo) return { ok: false, reason: `закончился ${fmtDate(w.dateTo)}` }
  const dow = now.getDay() || 7
  if (w.days?.length && !w.days.includes(dow)) return { ok: false, reason: 'сегодня не его день' }
  if (w.timeFrom || w.timeTo) {
    const m = now.getHours() * 60 + now.getMinutes()
    const a = w.timeFrom ? minutes(w.timeFrom) : 0
    const b = w.timeTo ? minutes(w.timeTo) : 24 * 60
    const inside = a <= b ? m >= a && m < b : m >= a || m < b
    if (!inside) return { ok: false, reason: 'не то время суток' }
  }
  return { ok: true, reason: '' }
}

/**
 * Гашение экрана: blank = { on, periods: [{ timeFrom, timeTo, days }] }. Экран погашен, если подходит хоть один
 * период. Период без времени — весь день (в указанные дни); совсем пустой период не считается.
 */
export function isBlanked(blank, now = new Date()) {
  if (!blank?.on) return false
  return (blank.periods || []).some((p) => hasRules(p) && ruleState(p, now).ok)
}

/** Короткое описание правил: «с 12.10 по 20.10 · 8:00–12:00 · Пн, Ср». */
export function rulesText(w) {
  if (!hasRules(w)) return ''
  const parts = []
  if (w.dateFrom && w.dateTo) parts.push(w.dateFrom === w.dateTo ? fmtDate(w.dateFrom) : `${fmtDate(w.dateFrom)} – ${fmtDate(w.dateTo)}`)
  else if (w.dateFrom) parts.push('с ' + fmtDate(w.dateFrom))
  else if (w.dateTo) parts.push('по ' + fmtDate(w.dateTo))
  if (w.timeFrom && w.timeTo) parts.push(`${fmtTime(w.timeFrom)}–${fmtTime(w.timeTo)}`)
  else if (w.timeFrom) parts.push('с ' + fmtTime(w.timeFrom))
  else if (w.timeTo) parts.push('до ' + fmtTime(w.timeTo))
  if (w.days?.length) {
    const d = w.days
    if (d.join() === '1,2,3,4,5') parts.push('Пн–Пт')
    else if (d.join() === '1,2,3,4,5,6') parts.push('Пн–Сб')
    else if (d.join() === '6,7') parts.push('выходные')
    else parts.push(d.map((x) => DAY_SHORT[x - 1]).join(', '))
  }
  return parts.join(' · ')
}

/** Тексты действующих объявлений бегущей строки (until включительно; пусто — без срока). Выключено — []. */
export function tickerTexts(ticker, now) {
  if (!ticker?.on) return []
  const today = isoDate(now)
  return (ticker.items || []).filter((i) => i.text && (!i.until || i.until >= today)).map((i) => i.text)
}
