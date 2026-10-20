import test from 'node:test'
import assert from 'node:assert/strict'
import { parseClassList, changedClasses, sortChangeRows } from '../src/classMarks.js'

const letters = { 8: ['А', 'Б', 'В'], 9: ['А', 'Б'] }

test('parseClassList: варианты записи класса', () => {
  assert.deepEqual(parseClassList('8А', letters), ['8А'])
  assert.deepEqual(parseClassList('8 а', letters), ['8А'])
  assert.deepEqual(parseClassList('8A', letters), ['8А']) // латиница
  assert.deepEqual(parseClassList('8А, 8Б', letters), ['8А', '8Б'])
  assert.deepEqual(parseClassList('8АБ', letters), ['8А', '8Б'])
  assert.deepEqual(parseClassList('8 и 9А', letters), ['8А', '8Б', '8В', '9А'])
  assert.deepEqual(parseClassList('8', letters), ['8А', '8Б', '8В'])
  assert.deepEqual(parseClassList('9 классы', letters), ['9А', '9Б'])
  assert.deepEqual(parseClassList('9-е классы', letters), ['9А', '9Б'])
  assert.deepEqual(parseClassList('все', letters), [])
  assert.deepEqual(parseClassList('', letters), [])
})

test('changedClasses: все колонки', () => {
  const ch = { ch0: [{ c: '8А', t: 'x', r: '' }], ch1: [{ c: '9 классы', t: '', r: '' }, { c: '', t: 'y', r: '' }] }
  assert.deepEqual([...changedClasses(ch, letters)].sort(), ['8А', '9А', '9Б'])
})

test('sortChangeRows: по параллели и букве, нераспознанные и пустые в конце', () => {
  const rows = [{ c: '9Б', t: '1' }, { c: '', t: '' }, { c: 'все', t: '2' }, { c: '8В', t: '3' }, { c: '8А', t: '4' }, { c: '9А', t: '5' }]
  assert.deepEqual(sortChangeRows(rows, letters).map((r) => r.t), ['4', '3', '5', '1', '2', ''])
})
