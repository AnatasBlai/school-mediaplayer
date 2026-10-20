import { test } from 'node:test'
import assert from 'node:assert/strict'
import { merge3, describeConflicts } from '../src/merge.js'

const sch = (cells) => ({ settings: { a: 1 }, schedule: { 8: { 2: { А: cells } } }, changes: { ch0: [] } })

test('merge3: правки в разных местах расписания складываются', () => {
  const base = { schedule: { 8: { 2: { А: [{ s: 'Алгебра', r: '1' }] } }, 6: { 2: { Б: [{ s: 'Физика', r: '2' }] } } } }
  const mine = JSON.parse(JSON.stringify(base))
  const theirs = JSON.parse(JSON.stringify(base))
  mine.schedule[8][2].А[2] = { s: 'Химия', r: '5' }
  theirs.schedule[6][2].Б[0].s = 'Биология'
  const { merged, conflicts } = merge3(base, mine, theirs)
  assert.equal(conflicts.length, 0)
  assert.equal(merged.schedule[8][2].А[2].s, 'Химия')
  assert.equal(merged.schedule[6][2].Б[0].s, 'Биология')
})

test('merge3: одна ячейка у обоих — побеждает своя, конфликт записан и описан', () => {
  const base = sch([{ s: 'Алгебра', r: '1' }, { s: 'Физика', r: '2' }])
  const mine = sch([{ s: 'Алгебра', r: '1' }, { s: 'Химия', r: '2' }])
  const theirs = sch([{ s: 'Алгебра', r: '1' }, { s: 'Биология', r: '2' }])
  const { merged, conflicts } = merge3(base, mine, theirs)
  assert.equal(merged.schedule[8][2].А[1].s, 'Химия')
  assert.deepEqual(conflicts, [['schedule', '8', '2', 'А', 1, 's']])
  assert.equal(describeConflicts(conflicts), '8А, вторник, 2 урок')
})

test('merge3: разные поля одной ячейки не конфликтуют', () => {
  const base = sch([{ s: 'Алгебра', r: '1' }])
  const { merged, conflicts } = merge3(base, sch([{ s: 'Алгебра', r: '7' }]), sch([{ s: 'Геометрия', r: '1' }]))
  assert.equal(conflicts.length, 0)
  assert.deepEqual(merged.schedule[8][2].А, [{ s: 'Геометрия', r: '7' }])
})

test('merge3: слайды по id — удалён у одного и изменён у другого: остаётся изменённый', () => {
  const a = { id: 'aaaa', title: 'A' }
  const b = { id: 'bbbb', title: 'B' }
  const base = { items: [a, b] }
  // я удалил aaaa, они изменили aaaa
  let r = merge3(base, { items: [b] }, { items: [{ ...a, title: 'A2' }, b] })
  assert.deepEqual(r.merged.items.map((x) => x.title), ['A2', 'B'])
  // они удалили bbbb, я изменил bbbb
  r = merge3(base, { items: [a, { ...b, title: 'B2' }] }, { items: [a] })
  assert.deepEqual(r.merged.items.map((x) => x.title), ['A', 'B2'])
  // удалён у одного, второй не трогал — удалён
  r = merge3(base, { items: [b] }, { items: [a, b] })
  assert.deepEqual(r.merged.items.map((x) => x.id), ['bbbb'])
  assert.equal(r.conflicts.length, 0)
})

test('merge3: добавлены разные слайды — остаются оба, порядок сохраняется', () => {
  const a = { id: 'aaaa' }
  const b = { id: 'bbbb' }
  const base = { items: [a, b] }
  const mine = { items: [a, { id: 'mine' }, b] }
  const theirs = { items: [a, b, { id: 'their' }] }
  const { merged, conflicts } = merge3(base, mine, theirs)
  assert.deepEqual(merged.items.map((x) => x.id), ['aaaa', 'mine', 'bbbb', 'their'])
  assert.equal(conflicts.length, 0)
})

test('merge3: я переставил слайды, они не трогали порядок — порядок мой', () => {
  const [a, b, c] = ['aaaa', 'bbbb', 'cccc'].map((id) => ({ id }))
  const { merged } = merge3({ items: [a, b, c] }, { items: [c, a, b] }, { items: [a, { ...b, x: 1 }, c] })
  assert.deepEqual(merged.items.map((x) => x.id), ['cccc', 'aaaa', 'bbbb'])
  assert.equal(merged.items[2].x, 1)
})

test('merge3: числа и строки в массиве — целиком, своё побеждает', () => {
  const { merged, conflicts } = merge3({ d: [1, 2] }, { d: [1, 2, 3] }, { d: [1, 4] })
  assert.deepEqual(merged.d, [1, 2, 3])
  assert.equal(conflicts.length, 1)
})

test('merge3: исходные объекты не меняются', () => {
  const base = sch([{ s: 'А', r: '' }])
  const mine = sch([{ s: 'Б', r: '' }])
  const copy = JSON.stringify(mine)
  merge3(base, mine, sch([{ s: 'В', r: '' }]))
  assert.equal(JSON.stringify(mine), copy)
})
