import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDishes, schoolWeek, dayKeyOf, menuDay, menuHeading, fitMenu, tableToLines } from '../src/menu.js'
import { cleanItem } from '../server/playlist.js'

const d = (y, mo, day, h = 12, mi = 0) => new Date(y, mo - 1, day, h, mi)
const meal = (n, name = 'Обед') => ({ name, time: '', lines: Array.from({ length: n }, (_, i) => 'Блюдо ' + (i + 1)).join('\n') })

test('parseDishes: название, выход, цена', () => {
  assert.deepEqual(parseDishes('Каша рисовая — 200 г — 35 ₽'), [{ name: 'Каша рисовая', size: '200 г', price: '35 ₽' }])
  assert.deepEqual(parseDishes('Чай — 10 руб'), [{ name: 'Чай', size: '', price: '10 руб' }])
  assert.deepEqual(parseDishes('Хлеб — 50 г'), [{ name: 'Хлеб', size: '50 г', price: '' }])
  assert.deepEqual(parseDishes('Суп-лапша\n\n  Компот  '), [
    { name: 'Суп-лапша', size: '', price: '' },
    { name: 'Компот', size: '', price: '' },
  ])
})

test('schoolWeek: неделя с 1 сентября — первая, дальше по очереди', () => {
  assert.equal(schoolWeek(d(2026, 9, 1)), 1) // вторник
  assert.equal(schoolWeek(d(2026, 9, 6)), 1) // воскресенье той же недели
  assert.equal(schoolWeek(d(2026, 9, 7)), 2)
  assert.equal(schoolWeek(d(2026, 9, 14)), 1)
  assert.equal(schoolWeek(d(2026, 10, 21)), 2) // 7 недель после первой
  assert.equal(schoolWeek(d(2027, 1, 12)), schoolWeek(d(2026, 12, 29))) // через Новый год считаем от прошлой осени
})

test('dayKeyOf: вторая неделя — ключи 8…13, воскресенье — нет', () => {
  const it = { twoWeeks: true }
  assert.equal(dayKeyOf(it, d(2026, 10, 21)), '10')
  assert.equal(dayKeyOf(it, d(2026, 10, 28)), '3')
  assert.equal(dayKeyOf({}, d(2026, 10, 21)), '3')
  assert.equal(dayKeyOf(it, d(2026, 10, 25)), null)
})

test('menuDay: сегодня, завтра после уроков, пропуск дней без меню', () => {
  const it = { days: { 1: [meal(2)], 2: [meal(2)], 3: [meal(2)], 4: [meal(2)], 5: [meal(2)] } }
  assert.equal(menuDay(it, d(2026, 10, 21, 10), false).dow, 3) // среда
  const tm = menuDay(it, d(2026, 10, 21, 16), true)
  assert.equal(tm.dow, 4)
  assert.equal(tm.tomorrow, true)
  const mon = menuDay(it, d(2026, 10, 23, 16), true) // пятница → понедельник
  assert.equal(mon.dow, 1)
  assert.equal(mon.later, true)
  assert.equal(menuDay(it, d(2026, 10, 24, 10), false), null) // суббота без меню
  assert.equal(menuDay(it, d(2026, 10, 25, 10), false), null) // воскресенье
  assert.equal(menuDay({ days: {} }, d(2026, 10, 21), true), null)
})

test('menuHeading', () => {
  const it = { title: 'Меню на сегодня' }
  assert.equal(menuHeading(it, { dow: 2 }), 'Меню на сегодня · вторник')
  assert.equal(menuHeading(it, { dow: 3, tomorrow: true }), 'Меню на завтра · среда')
  assert.equal(menuHeading(it, { dow: 1, later: true }), 'Меню на понедельник')
})

test('fitMenu: мало блюд — крупно на одном экране, много — мельче или несколько экранов', () => {
  const small = fitMenu([{ name: 'Обед', time: '', dishes: Array(5).fill({ name: 'x' }) }])
  assert.equal(small.pages.length, 1)
  assert.equal(small.size, 52)
  const mid = fitMenu([{ name: 'Обед', time: '', dishes: Array(30).fill({ name: 'x' }) }])
  assert.equal(mid.pages.length, 1)
  assert.ok(mid.size < 52)
  const big = fitMenu([{ name: 'Обед', time: '', dishes: Array(60).fill({ name: 'x' }) }])
  assert.ok(big.pages.length > 1)
  assert.equal(big.pages.flat().reduce((s, m) => s + m.dishes.length, 0), 60)
})

test('tableToLines', () => {
  assert.equal(tableToLines([['Каша', '200 г', '35'], ['Чай', '', '10'], ['', '', ''], ['Хлеб']]), 'Каша — 200 г — 35 ₽\nЧай — 10 ₽\nХлеб')
})

test('cleanItem(menu): ключи дней, до 4 приёмов, вторая неделя только при twoWeeks', () => {
  const days = { 1: [meal(1), meal(1), meal(1), meal(1), meal(1)], 8: [meal(1)], 7: [meal(1)], 3: [] }
  const a = cleanItem({ type: 'menu', days, title: 'x'.repeat(80) })
  assert.deepEqual(Object.keys(a.days), ['1'])
  assert.equal(a.days[1].length, 4)
  assert.equal(a.title.length, 40)
  const b = cleanItem({ type: 'menu', twoWeeks: true, days })
  assert.deepEqual(Object.keys(b.days), ['1', '8'])
})
