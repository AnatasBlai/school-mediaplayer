import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseClubTimes, timesToText, timeLines, parseClubTable, clubsToday, clubsPlayable, clubScreens, normRoom } from '../src/clubs.js'
import { cleanItem } from '../server/playlist.js'

const club = (name, times, extra = {}) => ({ name, teacher: 'Петров А. А.', room: '210', who: '5–7 классы', times, ...extra })
const T = (day, from, to) => ({ day, from, to })
const d = (y, m, day, h, min) => new Date(y, m - 1, day, h, min) // 21.10.2026 — среда

test('parseClubTimes: дни списком, диапазоном, без конца', () => {
  const r = parseClubTimes('Пн, Ср 15:00-15:45; Пт 14:00')
  assert.equal(r.error, '')
  assert.deepEqual(r.times, [T(1, '15:00', '15:45'), T(3, '15:00', '15:45'), T(5, '14:00', '14:45')])
  assert.deepEqual(parseClubTimes('Пн-Ср 9:00–9:40').times.map((t) => t.day), [1, 2, 3])
  assert.deepEqual(parseClubTimes('понедельник и среда 16.30-17.15').times, [T(1, '16:30', '17:15'), T(3, '16:30', '17:15')])
})

test('parseClubTimes: ошибки', () => {
  assert.ok(parseClubTimes('').error)
  assert.ok(parseClubTimes('Пн').error)
  assert.ok(parseClubTimes('15:00').error)
  assert.ok(parseClubTimes('Вс 15:00').error)
  assert.ok(parseClubTimes('Фу 15:00').error)
  assert.ok(parseClubTimes('Пн 25:00').error)
  assert.ok(parseClubTimes('Пн 16:00-15:00').error)
  assert.ok(parseClubTimes('Пн-Сб 15:00; Пн 16:00').error) // 7 занятий
})

test('timesToText / timeLines склеивают одинаковое время и читаются обратно', () => {
  const times = [T(5, '14:00', '14:45'), T(1, '15:00', '15:45'), T(3, '15:00', '15:45')]
  assert.deepEqual(timeLines(times), ['Пн, Ср 15:00–15:45', 'Пт 14:00–14:45'])
  assert.deepEqual(parseClubTimes(timesToText(times)).times, [T(1, '15:00', '15:45'), T(3, '15:00', '15:45'), T(5, '14:00', '14:45')])
})

test('parseClubTable: Excel, заголовок, ошибки, повторы', () => {
  const text = 'Название\tРуководитель\tКабинет\tДля кого\tДни и время\nРобототехника\tПетров А. А.\tкаб. 210\t5–7 классы\tПн, Ср 15:00-15:45\n\t\t\t\tПн 10:00\nШахматы\tИванов\t12\t\tПн\nРобототехника\tПетров А. А.\t210\t\tПн, Ср 15:00-15:45'
  const rows = parseClubTable(text)
  assert.equal(rows.length, 4)
  assert.equal(rows[0].room, '210')
  assert.equal(rows[0].error, '')
  assert.equal(rows[1].error, 'Нет названия')
  assert.ok(rows[2].error)
  assert.equal(rows[3].dup, true)
  assert.equal(normRoom('Кабинет 12 '), '12')
})

test('clubsToday: сортировка по времени и состояния', () => {
  const it = { mode: 'today', clubs: [club('Шахматы', [T(3, '16:00', '16:45')]), club('Робототехника', [T(3, '15:00', '15:45'), T(1, '15:00', '15:45')]), club('Хор', [T(3, '13:00', '13:45')])] }
  const r = clubsToday(it, d(2026, 10, 21, 15, 10))
  assert.deepEqual(r.map((x) => x.name + ':' + x.state), ['Хор:past', 'Робототехника:now', 'Шахматы:next'])
  assert.deepEqual(clubsToday(it, d(2026, 10, 25, 15, 10)), []) // воскресенье
})

test('clubsPlayable: «Сегодня» пропускается, когда всё закончилось; «Вся неделя» — нет', () => {
  const clubs = [club('Робототехника', [T(3, '15:00', '15:45')])]
  assert.equal(clubsPlayable({ mode: 'today', clubs }, d(2026, 10, 21, 15, 10)), true)
  assert.equal(clubsPlayable({ mode: 'today', clubs }, d(2026, 10, 21, 19, 0)), false)
  assert.equal(clubsPlayable({ mode: 'today', clubs }, d(2026, 10, 22, 8, 0)), false)
  assert.equal(clubsPlayable({ mode: 'week', clubs }, d(2026, 10, 21, 19, 0)), true)
  assert.equal(clubsPlayable({ mode: 'week', clubs: [] }, d(2026, 10, 21, 19, 0)), false)
})

test('clubScreens: страницы', () => {
  const many = Array.from({ length: 30 }, (_, i) => club('Кружок ' + i, [T(3, '15:00', '15:45')]))
  assert.equal(clubScreens({ mode: 'week', clubs: many }, new Date(), 3).length, 4) // 9 на экран
  assert.equal(clubScreens({ mode: 'week', clubs: many }, new Date(), 2).length, 5) // 6 на экран
  assert.equal(clubScreens({ mode: 'week', clubs: [] }).length, 1)
  const day = clubScreens({ mode: 'today', clubs: many }, d(2026, 10, 21, 10, 0))
  assert.equal(day.length, 4) // 30 строк по 8
  assert.equal(day[0].rows.length, 8)
  // мало занятий — закончившиеся остаются (тусклые)
  const few = clubScreens({ mode: 'today', clubs: many.slice(0, 5) }, d(2026, 10, 21, 16, 0))
  assert.equal(few[0].rows.length, 5)
})

test('cleanItem clubs: ограничения и мусор', () => {
  const it = cleanItem({
    id: 'abcd1234', type: 'clubs', mode: 'oops', title: 'я'.repeat(100), theme: 'zz', duration: 12,
    clubs: [
      { name: 'я'.repeat(100), teacher: 'Т', room: '1'.repeat(40), who: 'к', times: [T(1, '15:00', '15:45'), T(9, '15:00', '15:45'), T(2, '25:00', '26:00'), ...Array.from({ length: 10 }, (_, i) => T(2, '1' + i + ':00', '1' + i + ':30'))] },
      { name: '', times: [T(1, '15:00', '15:45')] }, // без названия
      { name: 'Без занятий', times: [] }, // без занятий
    ],
  })
  assert.equal(it.mode, 'today')
  assert.equal(it.title.length, 60)
  assert.equal(it.theme, '6')
  assert.equal(it.clubs.length, 1)
  assert.equal(it.clubs[0].name.length, 60)
  assert.equal(it.clubs[0].room.length, 20)
  assert.equal(it.clubs[0].times.length, 6)
  assert.equal(cleanItem({ id: 'abcd1234', type: 'clubs', mode: 'week', clubs: [] }).mode, 'week')
})
