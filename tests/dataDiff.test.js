import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffSchedule, diffPlaylist, diffDecks, diffMedia, limitLines } from '../src/dataDiff.js'

const lessons = (...s) => s.map((x) => ({ s: x, r: '' }))
const sched = (over = {}) => ({
  settings: { lessonsCount: 9, letters: { 8: ['А'] }, bells: [{ name: 'a', days: [1], text: '8:00' }] },
  schedule: { 8: { 2: { А: lessons('Алгебра', 'Физика', 'Химия') } } },
  changes: { ch0: [{ c: '8А', t: 'x', r: '1' }] },
  ...over,
})

test('diffSchedule: одинаковое — пусто', () => {
  assert.deepEqual(diffSchedule(sched(), sched()), [])
})

test('diffSchedule: уроки, буквы, звонки, изменения', () => {
  const b = sched({
    schedule: { 8: { 2: { А: lessons('Алгебра', 'Труд', 'Музыка') } } },
    changes: { ch0: [{ c: '8А', t: 'y', r: '1' }, { c: '9Б', t: '', r: '' }] },
  })
  b.settings = { ...b.settings, letters: { 8: ['А', 'Д'] }, bells: [] }
  const d = diffSchedule(sched(), b)
  assert.ok(d.includes('Буквы классов: добавлен 8Д'))
  assert.ok(d.includes('Звонки: изменены'))
  assert.ok(d.includes('8А, вторник: 2 урока'))
  assert.ok(d.includes('Изменения: 2 строки'))
})

test('limitLines: не больше 30 + «и ещё N»', () => {
  const l = Array.from({ length: 35 }, (_, i) => String(i))
  const r = limitLines(l)
  assert.equal(r.length, 31)
  assert.equal(r[30], 'и ещё 5')
})

test('diffPlaylist: вернутся, пропадут, изменены', () => {
  const cur = { items: [{ id: 'aaaa', type: 'news', title: 'Старая' }, { id: 'bbbb', type: 'news', title: 'Поздняя' }] }
  const snap = { items: [{ id: 'aaaa', type: 'news', title: 'Другая' }, { id: 'cccc', type: 'news', title: 'Удалённая' }] }
  const d = diffPlaylist(cur, snap)
  assert.deepEqual(d, ['Будут возвращены слайды: «Удалённая»', 'Пропадут слайды, добавленные позже: «Поздняя»', 'Изменены: «Другая»'])
  assert.deepEqual(diffPlaylist(cur, cur), [])
})

test('diffDecks: добавленные, удалённые, карточки', () => {
  const d1 = { id: 'd1', name: 'Один', cards: [{ id: 'c1', text: 'a' }] }
  const cur = { decks: [d1, { id: 'd2', name: 'Новая', cards: [] }] }
  const snap = { decks: [{ ...d1, cards: [{ id: 'c1', text: 'b' }, { id: 'c2', text: 'c' }] }] }
  const d = diffDecks(cur, snap)
  assert.deepEqual(d, ['Колода «Новая»: пропадёт (добавлена позже)', 'Колода «Один»: изменено карточек: 2'])
  assert.deepEqual(diffDecks(cur, cur), [])
})

test('diffMedia: добавленные позже, зеркало', () => {
  const m = (id) => ({ id, file: id + '.jpg', name: 'Ф' + id })
  const d = diffMedia({ items: [m('a'), m('b')] }, { items: [m('a'), m('c')] }, new Set())
  assert.equal(d.length, 3)
  assert.match(d[0], /В снимке нет 1 файла/)
  assert.match(d[2], /не вернутся/)
  assert.deepEqual(diffMedia({ items: [m('a')] }, { items: [m('a')] }), [])
})
