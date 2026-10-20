import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBells, bellsForDay, bellStatus, plural, DEFAULT_BELLS } from '../src/bells.js'

const at = (h, m, s = 0) => new Date(2026, 9, 19, h, m, s)
const bells = parseBells('1 8:30-9:10\n2 9:15-9:55\n3 10:10-10:50\n9 15:05-15:45')

test('parseBells: разделители, точка, мусор, сортировка', () => {
  const r = parseBells('2 9.15 – 9.55\nмусор\n1 8:30—9:10\n\n3 10:10-10:50')
  assert.deepEqual(r, [
    { n: 1, start: 510, end: 550 },
    { n: 2, start: 555, end: 595 },
    { n: 3, start: 610, end: 650 },
  ])
  assert.deepEqual(parseBells(''), [])
  assert.deepEqual(parseBells(null), [])
})

test('bellsForDay: профиль по дню недели', () => {
  assert.equal(bellsForDay(DEFAULT_BELLS, 1)[0].n, 0)
  assert.equal(bellsForDay(DEFAULT_BELLS, 2)[0].n, 1)
  assert.deepEqual(bellsForDay(DEFAULT_BELLS, 7), [])
  assert.deepEqual(bellsForDay(null, 1), [])
})

test('bellStatus: none', () => {
  assert.equal(bellStatus(bells, at(9, 0), 0).kind, 'none')
  assert.equal(bellStatus([], at(9, 0), 3).kind, 'none')
})

test('bellStatus: before, lesson, break, after', () => {
  const b = bellStatus(bells, at(8, 0), 3)
  assert.equal(b.kind, 'before')
  assert.equal(b.left, 30)
  const l = bellStatus(bells, at(8, 50), 3)
  assert.equal(l.kind, 'lesson')
  assert.equal(l.bell.n, 1)
  assert.equal(l.left, 20)
  assert.equal(bellStatus(bells, at(9, 10), 3).kind, 'break') // конец урока не включительно
  assert.equal(bellStatus(bells, at(8, 30), 3).kind, 'lesson') // начало включительно
  const br = bellStatus(bells, at(9, 12), 3)
  assert.equal(br.kind, 'break')
  assert.equal(br.bell.n, 2)
  assert.equal(bellStatus(bells, at(10, 50), 3).kind, 'after')
  assert.equal(bellStatus(bells, at(10, 50), 3).bell.n, 3)
})

test('bellStatus: звонки сверх maxLesson не считаются', () => {
  // урок 9 есть в звонках, но уроков у классов только до 3
  assert.equal(bellStatus(bells, at(12, 0), 3).kind, 'after')
  assert.equal(bellStatus(bells, at(15, 20), 3).kind, 'after')
  assert.equal(bellStatus(bells, at(15, 20), 9).kind, 'lesson')
})

test('plural', () => {
  const f = (n) => plural(n, 'день', 'дня', 'дней')
  assert.equal(f(1), 'день')
  assert.equal(f(2), 'дня')
  assert.equal(f(5), 'дней')
  assert.equal(f(11), 'дней')
  assert.equal(f(21), 'день')
  assert.equal(f(112), 'дней')
  assert.equal(f(0), 'дней')
})
