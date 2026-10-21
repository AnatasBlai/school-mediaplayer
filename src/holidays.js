// Праздники и памятные даты для слайда «Сегодня» — без Vue (список и проверку использует и сервер).
// Как добавить дату: строка `{ d: 'ММ-ДД', title: 'Название', note: 'Пояснение (можно без него)', group }` в HOLIDAYS.
// group: 'ru' — Россия, 'rb' — Башкортостан, 'world' — международные дни. Только проверенные фиксированные даты;
// плавающие праздники (Ураза-байрам, Курбан-байрам, День матери…) здесь не нужны — школа добавляет их на год в окне слайда.

export const HOLIDAY_GROUPS = {
  ru: 'Праздники России',
  rb: 'Башкортостан',
  world: 'Международные дни',
  school: 'Школьные даты',
}
export const HOLIDAY_GROUP_KEYS = Object.keys(HOLIDAY_GROUPS)
/** Значок группы на экране. */
export const GROUP_ICONS = { ru: '🏛', rb: '🏔', world: '🌍', school: '🎓' }
/** Сколько дат показывается на экране за раз. */
export const MAX_SHOWN = 3

export const HOLIDAYS = [
  { d: '01-01', title: 'Новый год', group: 'ru' },
  { d: '01-07', title: 'Рождество Христово', group: 'ru' },
  { d: '01-25', title: 'День российского студенчества', group: 'ru' },
  { d: '01-27', title: 'День полного освобождения Ленинграда от фашистской блокады', group: 'ru' },
  { d: '02-08', title: 'День российской науки', group: 'ru' },
  { d: '02-21', title: 'Международный день родного языка', group: 'world' },
  { d: '02-23', title: 'День защитника Отечества', group: 'ru' },
  { d: '03-08', title: 'Международный женский день', group: 'ru' },
  { d: '04-12', title: 'День космонавтики', group: 'ru' },
  { d: '05-01', title: 'Праздник Весны и Труда', group: 'ru' },
  { d: '05-09', title: 'День Победы', group: 'ru' },
  { d: '05-24', title: 'День славянской письменности и культуры', group: 'ru' },
  { d: '06-01', title: 'Международный день защиты детей', group: 'world' },
  { d: '06-06', title: 'День русского языка', note: 'Пушкинский день', group: 'ru' },
  { d: '06-12', title: 'День России', group: 'ru' },
  { d: '06-22', title: 'День памяти и скорби', group: 'ru' },
  { d: '09-01', title: 'День знаний', group: 'ru' },
  { d: '09-03', title: 'День солидарности в борьбе с терроризмом', group: 'ru' },
  { d: '10-01', title: 'Международный день пожилых людей', group: 'world' },
  { d: '10-05', title: 'День учителя', group: 'ru' },
  { d: '10-11', title: 'День Республики Башкортостан', group: 'rb' },
  { d: '11-04', title: 'День народного единства', group: 'ru' },
  { d: '12-09', title: 'День Героев Отечества', group: 'ru' },
  { d: '12-12', title: 'День Конституции Российской Федерации', group: 'ru' },
  { d: '12-24', title: 'День Конституции Республики Башкортостан', group: 'rb' },
]

const pad = (n) => String(n).padStart(2, '0')
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] // февраль с запасом на 29.02

/** Дата «ММ-ДД» или «ГГГГ-ММ-ДД» существует в календаре? */
export function validHolidayDate(s) {
  const m = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/.exec(String(s || ''))
  if (!m) return false
  const mon = Number(m[2])
  const day = Number(m[3])
  return mon >= 1 && mon <= 12 && day >= 1 && day <= DAYS_IN_MONTH[mon - 1]
}

/**
 * Даты сегодняшнего дня для слайда `it` ({ groups, extra }): [{ title, note, group }].
 * Порядок: Россия, Башкортостан, международные, свои. Свои с годом — только в этот год.
 */
export function holidaysFor(it, now = new Date()) {
  const groups = Array.isArray(it?.groups) ? it.groups : []
  const md = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const ymd = `${now.getFullYear()}-${md}`
  const out = []
  for (const h of HOLIDAYS) if (h.d === md && groups.includes(h.group)) out.push({ title: h.title, note: h.note || '', group: h.group })
  if (groups.includes('school')) {
    for (const e of Array.isArray(it?.extra) ? it.extra : []) {
      if (e && (e.d === md || e.d === ymd)) out.push({ title: e.title, note: e.note || '', group: 'school' })
    }
  }
  const order = HOLIDAY_GROUP_KEYS
  return out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group))
}
