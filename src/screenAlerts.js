// Какие экраны молчат в учебное время (чистые функции, без Vue). Время — миллисекунды по часам сервера.
import { bellsForDay, inSchoolHours } from './bells.js'

export const SILENT_MS = 5 * 60_000 // «не отвечает» — без связи дольше 5 минут

const dayStart = (ms) => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Начало прошлого учебного дня (до сегодняшнего); hasLessons(dow) — есть ли в этот день уроки. */
export function prevSchoolDayStart(nowMs, hasLessons) {
  const d = new Date(dayStart(nowMs))
  for (let i = 0; i < 7; i++) {
    d.setDate(d.getDate() - 1)
    if (hasLessons(d.getDay())) return d.getTime()
  }
  return dayStart(nowMs)
}

/**
 * Экраны, о которых нужно предупредить: нет связи больше 5 минут, сейчас учебное время и экран был на связи
 * сегодня или в прошлый учебный день. items — { seen, goneAt } и поля для вывода; online(s) — на связи ли.
 * Возвращает [{ ...экран, silentMs }].
 */
export function silentScreens(items, nowMs, { bells, maxLessonOf, online }) {
  const now = new Date(nowMs)
  const dow = now.getDay()
  if (!inSchoolHours(now, bellsForDay(bells, dow), maxLessonOf(dow))) return []
  const from = prevSchoolDayStart(nowMs, (n) => maxLessonOf(n) > 0)
  const out = []
  for (const s of items) {
    if (online(s)) continue
    const last = Math.max(s.seen || 0, s.goneAt || 0)
    if (last < from || nowMs - last <= SILENT_MS) continue
    out.push({ ...s, silentMs: nowMs - last })
  }
  return out
}
