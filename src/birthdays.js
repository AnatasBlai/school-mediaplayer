// Именинники: разбор дат и таблицы из Excel, кто празднует сегодня, имя для экрана, раскладка на экраны.
// Без Vue — общий для клиента и сервера (server/birthdays.js). Хранится только день и месяц ('ММ-ДД'), без года.
import { splitTable } from './scheduleImport.js'

export const TEACHER = 'учитель'
/** Имён на одном экране слайда; больше — экраны по очереди. */
export const PER_SCREEN = 12

const pad = (n) => String(n).padStart(2, '0')
const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр']
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

/** Месяц и день → 'ММ-ДД' или null, если такой даты нет (29 февраля есть). */
function mmdd(m, d) {
  m = Number(m)
  d = Number(d)
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= DAYS_IN[m - 1])) return null
  return pad(m) + '-' + pad(d)
}

/** «05.03.2012», «5.3», «05/03», «5 марта 2012», «2012-03-05» → '03-05'; год отбрасывается. Не дата — null. */
export function parseBirthDate(s) {
  const t = String(s ?? '').trim().toLowerCase().replace(/\s*г\.?$/, '')
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return mmdd(m[2], m[3])
  m = t.match(/^(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\s*[./-]\s*(\d{2}|\d{4}))?$/)
  if (m) return mmdd(m[2], m[1])
  m = t.match(/^(\d{1,2})\s+([а-яё]+)\.?(?:\s+\d{4})?$/)
  if (m) {
    const w = m[2]
    // «ма» — только май/мая (иначе «март» попал бы сюда); короткие «мар», «сен» — по началу слова
    const i = w === 'май' || w === 'мая' ? 4 : MONTHS.findIndex((p, k) => k !== 4 && (w.startsWith(p) || (w.length >= 3 && p.startsWith(w))))
    if (i >= 0) return mmdd(i + 1, m[1])
  }
  return null
}

/** 'ММ-ДД' → «5 марта». */
export function fmtBirthDate(d) {
  const m = /^(\d\d)-(\d\d)$/.exec(d || '')
  return m ? `${Number(m[2])} ${MONTHS_GEN[Number(m[1]) - 1]}` : ''
}

// латинские буквы, похожие на русские («8A» в Excel часто латиницей)
const LATIN = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х' }

/** «8а», «8 - А», «учитель», «учит.», «педагог» → '8А' | 'учитель'; непонятное — ''. */
export function normBirthCls(s) {
  const t = String(s ?? '').trim()
  if (/^(уч|педагог|преп)/i.test(t)) return TEACHER
  const m = /^(\d{1,2})\s*[-–]?\s*([A-Za-zА-Яа-яЁё])?(?:\s*класс)?$/i.exec(t)
  if (!m) return ''
  const up = (m[2] || '').toUpperCase()
  return m[1] + (LATIN[up] || up)
}

const keyOf = (name, d) => String(name).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim() + '|' + d

/**
 * Таблица из Excel: ФИО | класс | дата. existing — уже внесённые (повторы с тем же ФИО и датой не добавляются).
 * → [{ line, name, cls, d, error, dup }]; строка-заголовок («ФИО», «Класс»…) пропускается.
 */
export function parseBirthdayTable(text, existing = []) {
  const seen = new Set(existing.map((x) => keyOf(x.name, x.d)))
  const out = []
  splitTable(text).forEach((cells, i) => {
    if (!cells.some(Boolean)) return
    const [rawName = '', rawCls = '', rawDate = ''] = cells
    if (i === 0 && /фио|фамил|имя/i.test(rawName) && !parseBirthDate(rawDate)) return
    const name = rawName.replace(/\s+/g, ' ').trim().slice(0, 80)
    const cls = normBirthCls(rawCls)
    const d = parseBirthDate(rawDate)
    let error = ''
    if (!name) error = 'Нет ФИО'
    else if (!rawCls) error = 'Нет класса (для учителя — «учитель»)'
    else if (!cls) error = `Непонятный класс «${rawCls}»`
    else if (!rawDate) error = 'Нет даты'
    else if (!d) error = `Непонятная дата «${rawDate}»`
    const row = { line: i + 1, name, cls, d: d || '', error, dup: false }
    if (!error) {
      const k = keyOf(name, d)
      row.dup = seen.has(k)
      seen.add(k)
    }
    out.push(row)
  })
  return out
}

/** Повтор: то же ФИО и та же дата. */
export const sameBirthday = (a, b) => keyOf(a.name, a.d) === keyOf(b.name, b.d)

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
/** Какие 'ММ-ДД' празднуются в этот день: в невисокосный год 29 февраля — 28-го. */
function keysOfDay(date) {
  const k = pad(date.getMonth() + 1) + '-' + pad(date.getDate())
  return k === '02-28' && !isLeap(date.getFullYear()) ? [k, '02-29'] : [k]
}

const clsRank = (cls) => {
  const m = /^(\d+)(.*)$/.exec(cls)
  return m ? Number(m[1]) * 100 + (m[2].charCodeAt(0) || 0) / 10000 : 1e6
}

/**
 * Именинники на дату now: [{ ...запись, weekend }]. В понедельник — и те, у кого день рождения был в выходные
 * (weekend: true); если суббота учебная (saturdayIsSchoolDay) — только воскресные. Сначала ученики по классам, потом учителя.
 */
export function birthdaysFor(items, now = new Date(), saturdayIsSchoolDay = false) {
  const days = [{ date: now, weekend: false }]
  if (now.getDay() === 1) {
    const back = (n) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - n)
    days.push({ date: back(1), weekend: true })
    if (!saturdayIsSchoolDay) days.push({ date: back(2), weekend: true })
  }
  const out = []
  for (const { date, weekend } of days) {
    const keys = keysOfDay(date)
    for (const it of items || []) if (keys.includes(it.d)) out.push({ ...it, weekend })
  }
  return out.sort((a, b) => (a.cls === TEACHER) - (b.cls === TEACHER) || a.weekend - b.weekend || clsRank(a.cls) - clsRank(b.cls) || a.name.localeCompare(b.name, 'ru'))
}

/**
 * Имя для экрана из «Фамилия Имя Отчество». Ученик: «Иван И.», full — «Иван Иванов».
 * Учитель: «Мария Ивановна» (как обращаются в школе), full — «Мария Ивановна Петрова». Одно слово — как есть.
 */
export function displayName(name, cls, full = false) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (w.length < 2) return w[0] || ''
  const [last, first, middle] = w
  if (cls === TEACHER && middle) return full ? `${first} ${middle} ${last}` : `${first} ${middle}`
  return full ? `${first} ${last}` : `${first} ${last[0].toUpperCase()}.`
}

/** Есть ли уроки в субботу (тогда в понедельник не поздравляем «субботних»). schedule — data/schedule.json. */
export function saturdayHasLessons(data) {
  for (const g of Object.values(data?.schedule || {})) for (const arr of Object.values(g?.['6'] || {})) if ((arr || []).some((l) => l?.s)) return true
  return false
}

/** Список для экрана (GET /api/birthdays/today): только имя, класс и «в выходные» — без дат. */
export const todayForScreen = (items, now, satSchool, full) =>
  birthdaysFor(items, now, satSchool).map((x) => ({ name: displayName(x.name, x.cls, full), cls: x.cls, weekend: x.weekend }))

/** Экраны слайда: поровну по ≤ PER_SCREEN имён, на каждом — { students, teachers }. Никого — []. */
export function birthdayScreens(people, per = PER_SCREEN) {
  const list = people || []
  if (!list.length) return []
  const n = Math.ceil(list.length / Math.ceil(list.length / per))
  const out = []
  for (let i = 0; i < list.length; i += n) {
    const part = list.slice(i, i + n)
    out.push({ students: part.filter((p) => p.cls !== TEACHER), teachers: part.filter((p) => p.cls === TEACHER) })
  }
  return out
}
