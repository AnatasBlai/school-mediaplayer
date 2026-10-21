import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBirthDate, normBirthCls, parseBirthdayTable, birthdaysFor, displayName, birthdayScreens, saturdayHasLessons, todayForScreen } from '../src/birthdays.js'
import { cleanBirthday } from '../server/birthdays.js'

const P = (name, cls, d) => ({ id: name, name, cls, d })

test('даты в разном виде, год отбрасывается', () => {
  assert.equal(parseBirthDate('05.03.2012'), '03-05')
  assert.equal(parseBirthDate('5.3'), '03-05')
  assert.equal(parseBirthDate('05/03/12'), '03-05')
  assert.equal(parseBirthDate('5 марта'), '03-05')
  assert.equal(parseBirthDate('5 марта 2012 г.'), '03-05')
  assert.equal(parseBirthDate('12 мая'), '05-12')
  assert.equal(parseBirthDate('1 сен'), '09-01')
  assert.equal(parseBirthDate('2012-03-05'), '03-05')
  assert.equal(parseBirthDate('29.02.2008'), '02-29')
  assert.equal(parseBirthDate('31.04'), null)
  assert.equal(parseBirthDate('завтра'), null)
  assert.equal(parseBirthDate(''), null)
})

test('класс: «8а», латиница, учитель', () => {
  assert.equal(normBirthCls('8а'), '8А')
  assert.equal(normBirthCls('10 - b'), '10В')
  assert.equal(normBirthCls('Учитель'), 'учитель')
  assert.equal(normBirthCls('учит.'), 'учитель')
  assert.equal(normBirthCls('ааа'), '')
})

test('таблица из Excel: заголовок, ошибки, повторы', () => {
  const t = 'ФИО\tКласс\tДата\nИванов Иван\t8а\t05.03.2012\nПетров Пётр\t\t1.1\nСидоров\t9Б\t32.01\nИванов  Иван\t8А\t5 марта\nУже Есть\t5А\t1 мая'
  const rows = parseBirthdayTable(t, [P('уже есть', '5А', '05-01')])
  assert.equal(rows.length, 5)
  assert.deepEqual([rows[0].name, rows[0].cls, rows[0].d, rows[0].error, rows[0].dup], ['Иванов Иван', '8А', '03-05', '', false])
  assert.match(rows[1].error, /класс/)
  assert.match(rows[2].error, /дата/i)
  assert.equal(rows[3].dup, true) // тот же человек дважды во вставке
  assert.equal(rows[4].dup, true) // уже в списке
})

test('обычный день: только сегодняшние; ученики раньше учителей', () => {
  const items = [P('Учителева Мария Ивановна', 'учитель', '10-21'), P('Б Б', '9А', '10-21'), P('А А', '5Б', '10-21'), P('Не Сегодня', '5А', '10-22')]
  const r = birthdaysFor(items, new Date(2026, 9, 21))
  assert.deepEqual(r.map((x) => x.cls), ['5Б', '9А', 'учитель'])
  assert.ok(r.every((x) => !x.weekend))
})

test('понедельник: и выходные; учебная суббота — только воскресенье', () => {
  const items = [P('Пн', '5А', '10-19'), P('Вс', '5А', '10-18'), P('Сб', '5А', '10-17'), P('Пт', '5А', '10-16')]
  const mon = new Date(2026, 9, 19)
  assert.deepEqual(birthdaysFor(items, mon).map((x) => [x.name, x.weekend]), [['Пн', false], ['Вс', true], ['Сб', true]])
  assert.deepEqual(birthdaysFor(items, mon, true).map((x) => x.name), ['Пн', 'Вс'])
  assert.deepEqual(birthdaysFor(items, new Date(2026, 9, 18)).map((x) => x.name), ['Вс']) // в воскресенье — как обычно
})

test('29 февраля: в невисокосный год — 28-го', () => {
  const items = [P('Високосный', '7А', '02-29')]
  assert.equal(birthdaysFor(items, new Date(2027, 1, 28)).length, 1)
  assert.equal(birthdaysFor(items, new Date(2028, 1, 28)).length, 0)
  assert.equal(birthdaysFor(items, new Date(2028, 1, 29)).length, 1)
  // 28.02.2027 — воскресенье: в понедельник 1 марта он среди «выходных»
  assert.deepEqual(birthdaysFor(items, new Date(2027, 2, 1)).map((x) => x.weekend), [true])
})

test('пустой список', () => {
  assert.deepEqual(birthdaysFor([], new Date()), [])
  assert.deepEqual(birthdaysFor(undefined, new Date()), [])
  assert.deepEqual(birthdayScreens([]), [])
})

test('имя на экране', () => {
  assert.equal(displayName('Иванов Иван Петрович', '8А'), 'Иван И.')
  assert.equal(displayName('Иванов Иван Петрович', '8А', true), 'Иван Иванов')
  assert.equal(displayName('Петрова Мария Ивановна', 'учитель'), 'Мария Ивановна')
  assert.equal(displayName('Петрова Мария Ивановна', 'учитель', true), 'Мария Ивановна Петрова')
  assert.equal(displayName('Алсу', '5А'), 'Алсу')
})

test('экраны: больше 12 — поровну, учителя отдельно', () => {
  const people = Array.from({ length: 15 }, (_, i) => ({ name: 'N' + i, cls: i >= 13 ? 'учитель' : '5А' }))
  const s = birthdayScreens(people)
  assert.deepEqual(s.map((x) => x.students.length + x.teachers.length), [8, 7])
  assert.equal(s[1].teachers.length, 2)
  assert.equal(birthdayScreens(people.slice(0, 12)).length, 1)
})

test('учебная суббота и список для экрана без дат', () => {
  assert.equal(saturdayHasLessons({ schedule: { 5: { 6: { А: [{ s: '' }, { s: 'Физкультура' }] } } } }), true)
  assert.equal(saturdayHasLessons({ schedule: { 5: { 1: { А: [{ s: 'Математика' }] } } } }), false)
  const r = todayForScreen([P('Иванов Иван', '8А', '10-21')], new Date(2026, 9, 21), false, false)
  assert.deepEqual(r, [{ name: 'Иван И.', cls: '8А', weekend: false }])
})

test('cleanBirthday: без даты или имени — выбрасывается, длины режутся', () => {
  assert.equal(cleanBirthday({ name: 'А', cls: '5А', d: '' }), null)
  assert.equal(cleanBirthday({ name: '', cls: '5А', d: '01-01' }), null)
  assert.equal(cleanBirthday({ name: 'А', cls: '5А', d: '13-01' }), null)
  const c = cleanBirthday({ id: 'abcd', name: 'Я'.repeat(100), cls: 'учитель-учитель', d: '02-29', year: 2010 })
  assert.deepEqual(c, { id: 'abcd', name: 'Я'.repeat(80), cls: 'учитель-уч', d: '02-29' })
})
