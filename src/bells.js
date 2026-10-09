// Расписание звонков и вычисление «какой сейчас урок / сколько до звонка».
// Звонки хранятся текстом, по строке на урок: «номер ЧЧ:ММ-ЧЧ:ММ».

export const DEFAULT_BELLS = [
  {
    name: 'Понедельник, четверг',
    days: [1, 4],
    text: [
      '0 8:00-8:25',
      '1 8:30-9:10',
      '2 9:15-9:55',
      '3 10:10-10:50',
      '4 11:05-11:45',
      '5 12:00-12:40',
      '6 12:45-13:25',
      '7 13:35-14:15',
      '8 14:20-15:00',
      '9 15:05-15:45',
    ].join('\n'),
  },
  {
    name: 'Вторник, среда, пятница, суббота',
    days: [2, 3, 5, 6],
    text: [
      '1 8:00-8:40',
      '2 8:45-9:25',
      '3 9:40-10:20',
      '4 10:35-11:15',
      '5 11:30-12:10',
      '6 12:15-12:55',
      '7 13:05-13:45',
      '8 13:50-14:30',
      '9 14:35-15:15',
      '10 15:20-16:00',
    ].join('\n'),
  },
]

const toMin = (h, m) => Number(h) * 60 + Number(m)
export const fmt = (min) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`

export function parseBells(text) {
  const res = []
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)\D+(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/)
    if (m) res.push({ n: Number(m[1]), start: toMin(m[2], m[3]), end: toMin(m[4], m[5]) })
  }
  return res.sort((a, b) => a.start - b.start)
}

export function bellsForDay(profiles, dow) {
  const p = (profiles || []).find((x) => (x.days || []).includes(dow))
  return p ? parseBells(p.text) : []
}

/**
 * Состояние дня.
 * maxLesson — последний урок, который есть хоть у одного класса (лишние звонки не учитываются).
 * kind: 'none' | 'before' | 'lesson' | 'break' | 'after'
 */
export function bellStatus(bells, now, maxLesson) {
  if (!maxLesson) return { kind: 'none' }
  const list = bells.filter((b) => b.n <= maxLesson)
  if (!list.length) return { kind: 'none' }
  const t = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
  for (let i = 0; i < list.length; i++) {
    const b = list[i]
    if (t >= b.start && t < b.end) {
      return { kind: 'lesson', bell: b, left: b.end - t, progress: (t - b.start) / (b.end - b.start) }
    }
    if (t < b.start) {
      const prevEnd = i > 0 ? list[i - 1].end : null
      return {
        kind: i === 0 ? 'before' : 'break',
        bell: b,
        left: b.start - t,
        progress: prevEnd === null ? 0 : (t - prevEnd) / (b.start - prevEnd),
      }
    }
  }
  return { kind: 'after', bell: list[list.length - 1] }
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}
