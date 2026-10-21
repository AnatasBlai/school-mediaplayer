// Кружки и секции: разбор «Пн, Ср 15:00-15:45; Пт 14:00», таблица из Excel, занятия сегодня, раскладка на экраны.
// Без Vue — общий для клиента и сервера (server/playlist.js). Дни 1 = Пн … 6 = Сб, время 'ЧЧ:ММ'.
import { splitTable } from './scheduleImport.js'

export const MAX_CLUBS = 60
export const MAX_TIMES = 6
export const DAY_SHORT = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
/** Сколько длится занятие, если конец не указан («Пт 14:00»). */
export const DEFAULT_MINUTES = 45
/** Строк «Сегодня» и карточек «Вся неделя» (на строку — cols штук) на одном экране. */
export const TODAY_ROWS = 8
export const WEEK_ROWS = 3

const pad = (n) => String(n).padStart(2, '0')
export const validTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''))
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
const fromMin = (m) => pad(Math.floor(m / 60)) + ':' + pad(m % 60)

/** Занятие чистится так же на сервере: день 1..6, оба времени верные. Иначе null. */
export function cleanTimeSlot(t) {
  const day = Number(t?.day)
  if (!(day >= 1 && day <= 6) || !Number.isInteger(day) || !validTime(t?.from) || !validTime(t?.to)) return null
  return { day, from: t.from, to: t.to }
}

/** Номер дня по названию: «Пн», «пон», «Понедельник», «среда» → 1..6; воскресенье → 7; непонятное — 0. */
function dayOf(w) {
  const s = w.toLowerCase().replace(/ё/g, 'е')
  if (!/^[а-я]+\.?$/.test(s)) return 0
  const i = [/^(пн|пон)/, /^(вт|вто)/, /^(ср|сре)/, /^(чт|чет)/, /^(пт|пят)/, /^(сб|суб)/, /^(вс|вос)/].findIndex((r) => r.test(s))
  return i + 1
}

/**
 * «Пн, Ср 15:00-15:45; Пт 14:00-14:45; Пн-Пт 8:00» → { times: [{ day, from, to }], error }.
 * Конец не указан — занятие 45 минут. Первая же ошибка в error (times при этом пустой).
 */
export function parseClubTimes(text) {
  const times = []
  const fail = (error) => ({ times: [], error })
  const parts = String(text ?? '').split(/[;\n]/).map((p) => p.trim()).filter(Boolean)
  if (!parts.length) return fail('Нет дней и времени')
  for (const part of parts) {
    const m = /^(.*?)\s*(\d{1,2})[:.](\d{2})(?:\s*[-–—]\s*(\d{1,2})[:.](\d{2}))?\s*$/.exec(part)
    if (!m) return fail(`Не понял время в «${part}» — например, «Пн, Ср 15:00-15:45»`)
    const from = pad(m[2]) + ':' + m[3]
    if (!validTime(from)) return fail(`Время «${m[2]}:${m[3]}» не бывает`)
    let to
    if (m[4] !== undefined) {
      to = pad(m[4]) + ':' + m[5]
      if (!validTime(to)) return fail(`Время «${m[4]}:${m[5]}» не бывает`)
      if (toMin(to) <= toMin(from)) return fail(`Конец занятия раньше начала: «${part}»`)
    } else to = fromMin(Math.min(23 * 60 + 59, toMin(from) + DEFAULT_MINUTES))
    // дни: «Пн, Ср», «Пн-Ср», «Пн и Ср»
    const days = []
    const words = m[1].replace(/([а-яё]+)\s*[-–—]\s*([а-яё]+)/gi, (_, a, b) => {
      const x = dayOf(a)
      const y = dayOf(b)
      return x && y && x <= y ? Array.from({ length: y - x + 1 }, (_, k) => x + k).join(' ') : a + ' ' + b
    })
    for (const w of words.split(/[\s,]+/).filter(Boolean)) {
      if (/^\d$/.test(w)) days.push(Number(w))
      else if (w.toLowerCase() === 'и') continue
      else {
        const d = dayOf(w)
        if (d === 7) return fail('Воскресенье — занятий нет, уберите «Вс»')
        if (!d) return fail(`Непонятный день «${w}» — Пн, Вт, Ср, Чт, Пт или Сб`)
        days.push(d)
      }
    }
    if (!days.length) return fail(`Нет дня недели в «${part}»`)
    if (days.some((d) => d < 1 || d > 6)) return fail(`Дни — от Пн до Сб: «${part}»`)
    for (const day of days) if (!times.some((t) => t.day === day && t.from === from)) times.push({ day, from, to })
  }
  if (times.length > MAX_TIMES) return fail(`Занятий больше ${MAX_TIMES} — разбейте кружок на два`)
  times.sort((a, b) => a.day - b.day || a.from.localeCompare(b.from))
  return { times, error: '' }
}

/** Занятия → строки для экрана: одинаковое время склеивается — «Пн, Ср 15:00–15:45». */
export function timeLines(times) {
  const groups = []
  for (const t of [...times].sort((a, b) => a.from.localeCompare(b.from) || a.day - b.day)) {
    const key = t.from + '–' + t.to
    const g = groups.find((x) => x.key === key)
    if (g) g.days.push(t.day)
    else groups.push({ key, days: [t.day] })
  }
  groups.sort((a, b) => Math.min(...a.days) - Math.min(...b.days))
  return groups.map((g) => g.days.sort((a, b) => a - b).map((d) => DAY_SHORT[d]).join(', ') + ' ' + g.key)
}
/** Занятия → текст, который понимает parseClubTimes («Пн, Ср 15:00-15:45; Пт 14:00-14:45»). */
export const timesToText = (times) => timeLines(times).join('; ').replace(/–/g, '-')

/** «каб. 210», «кабинет 210», «210» → «210»; на экране добавляется «каб.». */
export const normRoom = (s) => String(s ?? '').replace(/^\s*каб(?:инет|\.)?\s*/i, '').replace(/\s+/g, ' ').trim().slice(0, 20)

const keyOf = (c) => `${c.name}|${c.teacher}|${timesToText(c.times)}`.toLowerCase().replace(/ё/g, 'е')

/**
 * Таблица из Excel: Название | Руководитель | Кабинет | Для кого | Дни и время. existing — уже внесённые
 * (повтор — то же название, руководитель и время — не добавляется). → [{ line, name, teacher, room, who, times, error, dup }].
 */
export function parseClubTable(text, existing = []) {
  const seen = new Set(existing.map(keyOf))
  const out = []
  splitTable(text).forEach((cells, i) => {
    if (!cells.some(Boolean)) return
    const [rawName = '', rawTeacher = '', rawRoom = '', rawWho = '', rawTimes = ''] = cells
    if (i === 0 && /назван|кружок|секци/i.test(rawName) && parseClubTimes(rawTimes).error) return // строка заголовка
    const clean = (s, n) => s.replace(/\s+/g, ' ').trim().slice(0, n)
    const { times, error: timesError } = parseClubTimes(rawTimes)
    const row = { line: i + 1, name: clean(rawName, 60), teacher: clean(rawTeacher, 60), room: normRoom(rawRoom), who: clean(rawWho, 40), times, error: '', dup: false }
    row.error = !row.name ? 'Нет названия' : timesError
    if (!row.error) {
      const k = keyOf(row)
      row.dup = seen.has(k)
      seen.add(k)
    }
    out.push(row)
  })
  return out
}

/** Заголовок экрана: «Кружки и секции сегодня» / «… на неделю». */
export const clubsHeading = (it) => `${it.title || 'Кружки и секции'} ${it.mode === 'week' ? 'на неделю' : 'сегодня'}`

/**
 * Занятия сегодняшнего дня по времени: [{ name, teacher, room, who, from, to, state }],
 * state: 'past' — закончилось, 'now' — идёт, 'next' — ещё впереди. Воскресенье — пусто.
 */
export function clubsToday(it, now = new Date()) {
  const dow = now.getDay()
  const min = now.getHours() * 60 + now.getMinutes()
  const out = []
  for (const c of Array.isArray(it?.clubs) ? it.clubs : []) {
    for (const t of c.times || []) {
      if (t.day !== dow) continue
      const state = min >= toMin(t.to) ? 'past' : min >= toMin(t.from) ? 'now' : 'next'
      out.push({ name: c.name, teacher: c.teacher || '', room: c.room || '', who: c.who || '', from: t.from, to: t.to, state })
    }
  }
  return out.sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name, 'ru'))
}

/** Сколько карточек «Вся неделя» в ряду: на весь экран 3, с панелью справа 2. */
export const weekCols = (panel) => (panel ? 2 : 3)

/** Есть ли что показывать: «Сегодня» — не закончившиеся занятия дня, «Вся неделя» — любой кружок. */
export function clubsPlayable(it, now = new Date()) {
  if (it?.mode === 'week') return (it.clubs || []).length > 0
  return clubsToday(it, now).some((r) => r.state !== 'past')
}

const chunk = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, (i + 1) * n))

/**
 * Экраны слайда по очереди. «Сегодня» → [{ rows }] по TODAY_ROWS строк;
 * «Вся неделя» → [{ cards: [{ name, teacher, room, who, lines }] }] по cols × WEEK_ROWS карточек. Пустой слайд — один пустой экран.
 */
export function clubScreens(it, now = new Date(), cols = 3) {
  if (it?.mode === 'week') {
    const cards = (it.clubs || []).map((c) => ({ name: c.name, teacher: c.teacher || '', room: c.room || '', who: c.who || '', lines: timeLines(c.times || []) }))
    const pages = chunk(cards, cols * WEEK_ROWS)
    return (pages.length ? pages : [[]]).map((p) => ({ cards: p }))
  }
  const rows = clubsToday(it, now)
  // закончившиеся показываем тусклыми, пока всё помещается на один экран; иначе — только идущие и будущие
  const list = rows.length > TODAY_ROWS ? rows.filter((r) => r.state !== 'past') : rows
  const pages = chunk(list, TODAY_ROWS)
  return (pages.length ? pages : [[]]).map((p) => ({ rows: p }))
}
