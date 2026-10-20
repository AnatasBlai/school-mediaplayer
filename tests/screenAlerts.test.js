import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_BELLS, inSchoolHours, bellsForDay } from '../src/bells.js'
import { silentScreens, prevSchoolDayStart } from '../src/screenAlerts.js'

const at = (d, h, m) => new Date(2026, 9, d, h, m).getTime() // 19 окт 2026 — понедельник
const maxLessonOf = (dow) => (dow >= 1 && dow <= 5 ? 6 : 0)
const opts = { bells: DEFAULT_BELLS, maxLessonOf, online: (s) => !!s.on }

test('inSchoolHours: границы учебного дня', () => {
  const b = bellsForDay(DEFAULT_BELLS, 2) // вторник: с 8:00, 6-й урок до 12:55
  const t = (h, m) => new Date(2026, 9, 20, h, m)
  assert.equal(inSchoolHours(t(7, 59), b, 6), false)
  assert.equal(inSchoolHours(t(8, 0), b, 6), true)
  assert.equal(inSchoolHours(t(12, 40), b, 6), true)
  assert.equal(inSchoolHours(t(13, 0), b, 6), false)
  assert.equal(inSchoolHours(t(10, 0), b, 0), false)
})

test('silentScreens: молчит дольше 5 минут в учебное время', () => {
  const now = at(20, 10, 0) // вторник
  const mk = (min) => ({ id: 'a', seen: now - min * 60_000, goneAt: 0 })
  assert.equal(silentScreens([mk(4)], now, opts).length, 0)
  const r = silentScreens([mk(12)], now, opts)
  assert.equal(r.length, 1)
  assert.equal(Math.round(r[0].silentMs / 60_000), 12)
  assert.equal(silentScreens([{ ...mk(12), on: true }], now, opts).length, 0) // на связи
})

test('silentScreens: ночью и в выходной тихо', () => {
  const s = (now) => [{ id: 'a', seen: now - 3_600_000, goneAt: 0 }]
  assert.equal(silentScreens(s(at(20, 21, 0)), at(20, 21, 0), opts).length, 0)
  assert.equal(silentScreens(s(at(25, 10, 0)), at(25, 10, 0), opts).length, 0) // воскресенье
})

test('silentScreens: давно заброшенный экран не тревожит', () => {
  const now = at(20, 10, 0) // вторник; прошлый учебный день — понедельник
  assert.equal(silentScreens([{ id: 'a', seen: at(19, 15, 0), goneAt: 0 }], now, opts).length, 1)
  assert.equal(silentScreens([{ id: 'a', seen: at(17, 15, 0), goneAt: 0 }], now, opts).length, 0) // с субботы
  assert.equal(silentScreens([{ id: 'a', seen: 0, goneAt: at(20, 9, 0) }], now, opts).length, 1) // закрыли страницу
})

test('prevSchoolDayStart: через выходные', () => {
  assert.equal(prevSchoolDayStart(at(19, 10, 0), (n) => maxLessonOf(n) > 0), at(16, 0, 0)) // пн → пятница
})
