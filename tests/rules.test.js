import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ruleState, isBlanked, rulesText, tickerTexts, countdownState, hasRules, screenAllowed } from '../src/rules.js'

const d = (y, mo, day, h = 12, mi = 0) => new Date(y, mo - 1, day, h, mi) // месяц с 1

test('ruleState: без правил — ок', () => {
  assert.equal(ruleState(null, d(2026, 10, 19)).ok, true)
  assert.equal(ruleState({ dateFrom: '', days: [] }, d(2026, 10, 19)).ok, true)
})

test('ruleState: даты включительно', () => {
  const w = { dateFrom: '2026-10-19', dateTo: '2026-10-21' }
  assert.equal(ruleState(w, d(2026, 10, 18, 23, 59)).ok, false)
  assert.equal(ruleState(w, d(2026, 10, 19, 0, 0)).ok, true)
  assert.equal(ruleState(w, d(2026, 10, 21, 23, 59)).ok, true)
  assert.equal(ruleState(w, d(2026, 10, 22, 0, 0)).ok, false)
})

test('ruleState: «по» раньше «с»', () => {
  const r = ruleState({ dateFrom: '2026-10-21', dateTo: '2026-10-19' }, d(2026, 10, 20))
  assert.equal(r.ok, false)
  assert.match(r.reason, /раньше/)
})

test('ruleState: дни, воскресенье = 7', () => {
  const sun = d(2026, 10, 18) // воскресенье
  const mon = d(2026, 10, 19)
  assert.equal(ruleState({ days: [7] }, sun).ok, true)
  assert.equal(ruleState({ days: [7] }, mon).ok, false)
  assert.equal(ruleState({ days: [1] }, mon).ok, true)
})

test('ruleState: время [from, to)', () => {
  const w = { timeFrom: '08:00', timeTo: '12:00' }
  assert.equal(ruleState(w, d(2026, 10, 19, 7, 59)).ok, false)
  assert.equal(ruleState(w, d(2026, 10, 19, 8, 0)).ok, true)
  assert.equal(ruleState(w, d(2026, 10, 19, 11, 59)).ok, true)
  assert.equal(ruleState(w, d(2026, 10, 19, 12, 0)).ok, false)
  assert.equal(ruleState({ timeFrom: '15:00' }, d(2026, 10, 19, 23, 0)).ok, true)
  assert.equal(ruleState({ timeTo: '09:00' }, d(2026, 10, 19, 9, 0)).ok, false)
})

test('ruleState: интервал через полночь', () => {
  const w = { timeFrom: '22:00', timeTo: '06:00' }
  assert.equal(ruleState(w, d(2026, 10, 19, 23, 0)).ok, true)
  assert.equal(ruleState(w, d(2026, 10, 19, 5, 59)).ok, true)
  assert.equal(ruleState(w, d(2026, 10, 19, 6, 0)).ok, false)
  assert.equal(ruleState(w, d(2026, 10, 19, 12, 0)).ok, false)
  assert.equal(ruleState(w, d(2026, 10, 19, 22, 0)).ok, true)
})

test('ruleState: breaks с подставным isBreak', () => {
  const now = d(2026, 10, 19)
  assert.equal(ruleState({ breaks: true }, now, () => true).ok, true)
  assert.equal(ruleState({ breaks: true }, now, () => false).ok, false)
  assert.equal(ruleState({ breaks: true }, now).ok, false)
  assert.equal(hasRules({ breaks: true }), true)
})

test('isBlanked', () => {
  const now = d(2026, 10, 19, 23, 0)
  assert.equal(isBlanked(null, now), false)
  assert.equal(isBlanked({ on: false, periods: [{ timeFrom: '22:00', timeTo: '06:00', days: [] }] }, now), false)
  assert.equal(isBlanked({ on: true, periods: [{ timeFrom: '', timeTo: '', days: [] }] }, now), false) // пустой период
  assert.equal(isBlanked({ on: true, periods: [] }, now), false)
  assert.equal(isBlanked({ on: true, periods: [{ timeFrom: '22:00', timeTo: '06:00', days: [] }] }, now), true)
  assert.equal(isBlanked({ on: true, periods: [{ timeFrom: '', timeTo: '', days: [1] }] }, now), true) // весь день, Пн
  assert.equal(isBlanked({ on: true, periods: [{ timeFrom: '', timeTo: '', days: [2] }] }, now), false)
})

test('rulesText', () => {
  assert.equal(rulesText(null), '')
  assert.equal(rulesText({ days: [1, 2, 3, 4, 5] }), 'Пн–Пт')
  assert.equal(rulesText({ days: [6, 7] }), 'выходные')
  assert.equal(rulesText({ days: [1, 3] }), 'Пн, Ср')
  assert.equal(rulesText({ timeFrom: '08:00', timeTo: '12:00' }), '8:00–12:00')
  assert.equal(rulesText({ timeTo: '09:00' }), 'до 9:00')
  assert.equal(rulesText({ breaks: true }), 'на переменах')
})

test('tickerTexts: until включительно, выключено — []', () => {
  const now = d(2026, 10, 19)
  const items = [
    { text: 'вчера', until: '2026-10-18' },
    { text: 'сегодня', until: '2026-10-19' },
    { text: 'без срока', until: '' },
    { text: '', until: '' },
  ]
  assert.deepEqual(tickerTexts({ on: true, items }, now), ['сегодня', 'без срока'])
  assert.deepEqual(tickerTexts({ on: false, items }, now), [])
  assert.deepEqual(tickerTexts(null, now), [])
})

test('countdownState: без времени — весь день', () => {
  const it = { date: '2026-10-20', time: '' }
  assert.deepEqual(countdownState(it, d(2026, 10, 19, 10, 0)), { over: false, days: 1, today: false, hours: 14, mins: 0 })
  const today = countdownState(it, d(2026, 10, 20, 23, 59))
  assert.equal(today.over, false)
  assert.equal(today.today, true)
  assert.equal(today.days, 0)
  assert.equal(countdownState(it, d(2026, 10, 21, 0, 0)).over, true)
})

test('countdownState: со временем — до минуты', () => {
  const it = { date: '2026-10-20', time: '15:30' }
  assert.deepEqual(countdownState(it, d(2026, 10, 20, 10, 10)), { over: false, days: 0, today: true, hours: 5, mins: 20 })
  assert.equal(countdownState(it, d(2026, 10, 20, 15, 29)).over, false)
  assert.equal(countdownState(it, d(2026, 10, 20, 15, 30)).over, true)
  assert.equal(countdownState({ date: '', time: '' }, d(2026, 10, 20)).over, true)
  assert.equal(countdownState({ date: '2026-10-25', time: '' }, d(2026, 10, 20, 9)).days, 5)
})

test('screenAllowed: нет списка — всем; имя без регистра и пробелов; без имени — только «всем»', () => {
  assert.equal(screenAllowed(undefined, ''), true)
  assert.equal(screenAllowed([], 'Hall'), true)
  assert.equal(screenAllowed(['Hall'], ' hall '), true)
  assert.equal(screenAllowed(['Hall'], 'Canteen'), false)
  assert.equal(screenAllowed(['Hall'], ''), false)
})

test('dayShows: даты, дни, время, перемены', async () => {
  const { dayShows } = await import('../src/rules.js')
  const day = (y, m, dd) => new Date(y, m - 1, dd)
  assert.deepEqual(dayShows(null, day(2026, 10, 21)), { on: true, all: true, timeText: '', breaks: false })
  const w = { dateFrom: '2026-10-19', dateTo: '2026-10-21', days: [1, 3] }
  assert.equal(dayShows(w, day(2026, 10, 18)).on, false)
  assert.equal(dayShows(w, day(2026, 10, 19)).on, true) // пн
  assert.equal(dayShows(w, day(2026, 10, 20)).on, false) // вт — не его день
  assert.equal(dayShows(w, day(2026, 10, 21)).on, true) // ср, последний день включительно
  assert.equal(dayShows(w, day(2026, 10, 22)).on, false)
  const t = dayShows({ timeFrom: '08:00', timeTo: '12:00' }, day(2026, 10, 21))
  assert.deepEqual([t.on, t.all, t.timeText], [true, false, '8:00–12:00'])
  assert.equal(dayShows({ timeFrom: '22:00', timeTo: '06:00' }, day(2026, 10, 21)).timeText, '22:00–6:00')
  const b = dayShows({ breaks: true }, day(2026, 10, 21))
  assert.deepEqual([b.on, b.all, b.breaks], [true, false, true])
  assert.equal(dayShows({ dateFrom: '2026-12-31', dateTo: '2027-01-01' }, day(2027, 1, 1)).on, true)
})
