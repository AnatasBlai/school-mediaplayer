import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitTable, parseClassName, parseLesson, parseScheduleTable } from '../src/scheduleImport.js'

test('splitTable: кавычки, перенос внутри ячейки, ""', () => {
  const rows = splitTable('a\t"б\nв"\t"г ""д"""\r\nе\tж')
  assert.deepEqual(rows, [['a', 'б в', 'г "д"'], ['е', 'ж']])
})

test('parseClassName', () => {
  assert.deepEqual(parseClassName('5A'), { grade: '5', letter: 'А' }) // латиница
  assert.deepEqual(parseClassName(' 5 б '), { grade: '5', letter: 'Б' })
  assert.deepEqual(parseClassName('10-в'), { grade: '10', letter: 'В' })
  assert.equal(parseClassName('Математика'), null)
  assert.equal(parseClassName(''), null)
})

test('parseLesson', () => {
  assert.deepEqual(parseLesson('Математика 28/34'), { s: 'Математика', r: '28/34' })
  assert.deepEqual(parseLesson('Русский каб. 12'), { s: 'Русский', r: '12' })
  assert.deepEqual(parseLesson('Физкультура спортзал'), { s: 'Физкультура', r: 'спортзал' })
  assert.deepEqual(parseLesson('Литература'), { s: 'Литература', r: '' })
  assert.deepEqual(parseLesson(''), { s: '', r: '' })
})

test('parseScheduleTable: маленькая таблица', () => {
  const text = ['\t5A\t5Б\t6А', '1\tМатематика 28\tРусский 12\t', '2\tИстория 30\t\t', '3\t\t\t'].join('\n')
  const r = parseScheduleTable(text, { 5: ['А'] }, 9)
  assert.equal(r.classes.length, 3)
  assert.equal(r.overflow, false)
  assert.deepEqual(r.classes[0].lessons, [{ s: 'Математика', r: '28' }, { s: 'История', r: '30' }])
  assert.equal(r.classes[0].known, true)
  assert.equal(r.classes[1].known, false)
  assert.equal(r.classes[1].letter, 'Б')
  assert.deepEqual(r.classes[2].lessons, [])
})

test('parseScheduleTable: overflow, повтор, пустой ввод, нет классов', () => {
  const rows = Array.from({ length: 4 }, (_, i) => `${i + 1}\tУрок ${i + 1}`).join('\n')
  assert.equal(parseScheduleTable('\t5А\n' + rows, {}, 3).overflow, true)
  const dup = parseScheduleTable('\t5А\t5а\n1\tА\tБ', {}, 9)
  assert.equal(dup.classes.length, 1)
  assert.equal(dup.problems.length, 1)
  assert.deepEqual(parseScheduleTable('', {}, 9), { classes: [], problems: [], overflow: false })
  assert.equal(parseScheduleTable('что-то\nещё', {}, 9).classes.length, 0)
})
