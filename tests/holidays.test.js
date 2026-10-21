import { test } from 'node:test'
import assert from 'node:assert/strict'
import { holidaysFor, validHolidayDate, HOLIDAYS, HOLIDAY_GROUP_KEYS } from '../src/holidays.js'
import { cleanItem } from '../server/playlist.js'

const ALL = ['ru', 'rb', 'world', 'school']
const D = (m, d, y = 2026) => new Date(y, m - 1, d, 12)

test('постоянная дата и группы', () => {
  const r = holidaysFor({ groups: ALL, extra: [] }, D(10, 11))
  assert.deepEqual(r.map((x) => x.group), ['rb'])
  assert.equal(r[0].title, 'День Республики Башкортостан')
  assert.equal(holidaysFor({ groups: ALL, extra: [] }, D(9, 1))[0].title, 'День знаний')
})

test('группа выключена и пустой день', () => {
  assert.equal(holidaysFor({ groups: ['ru'], extra: [] }, D(10, 11)).length, 0)
  assert.equal(holidaysFor({ groups: ALL, extra: [] }, D(10, 20)).length, 0)
})

test('свои даты: каждый год и на конкретный год', () => {
  const it = { groups: ['school'], extra: [{ d: '05-12', title: 'А' }, { d: '2026-05-12', title: 'Б', note: 'н' }, { d: '2025-05-12', title: 'В' }] }
  assert.deepEqual(holidaysFor(it, D(5, 12, 2026)).map((x) => x.title), ['А', 'Б'])
  assert.deepEqual(holidaysFor(it, D(5, 12, 2027)).map((x) => x.title), ['А'])
  assert.equal(holidaysFor({ ...it, groups: ['ru'] }, D(5, 12)).length, 0)
})

test('порядок: встроенные раньше своих', () => {
  const it = { groups: ALL, extra: [{ d: '10-01', title: 'Своя' }] }
  assert.deepEqual(holidaysFor(it, D(10, 1)).map((x) => x.group), ['world', 'school'])
})

test('встроенный список: даты настоящие, без повторов, группы известные', () => {
  const seen = new Set()
  for (const h of HOLIDAYS) {
    assert.ok(validHolidayDate(h.d), h.d)
    assert.ok(HOLIDAY_GROUP_KEYS.includes(h.group), h.title)
    const k = h.d + h.title
    assert.ok(!seen.has(k))
    seen.add(k)
  }
})

test('validHolidayDate', () => {
  assert.ok(validHolidayDate('02-29'))
  assert.ok(validHolidayDate('2026-05-12'))
  assert.ok(!validHolidayDate('13-01'))
  assert.ok(!validHolidayDate('04-31'))
  assert.ok(!validHolidayDate('12.05'))
})

test('cleanItem today: группы, свои даты, ограничения', () => {
  const long = 'я'.repeat(300)
  const it = cleanItem({
    type: 'today', groups: ['ru', 'xx', 'school'],
    extra: [{ d: '05-12', title: long, note: long }, { d: '99-99', title: 'плохая' }, { d: '06-01', title: '' }, ...Array(150).fill({ d: '01-02', title: 'x' })],
    theme: 'нет', anim: 'rise', duration: 8,
  })
  assert.deepEqual(it.groups, ['ru', 'school'])
  assert.equal(it.extra.length, 100)
  assert.equal(it.extra[0].title.length, 80)
  assert.equal(it.extra[0].note.length, 160)
  assert.equal(it.theme, '6')
  assert.equal(it.anim, 'rise')
  assert.equal(it.duration, 8)
})
