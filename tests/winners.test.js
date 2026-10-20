import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLine, winnerScreens } from '../src/winners.js'

test('parseLine', () => {
  assert.deepEqual(parseLine('8А Иванов Иван'), { cls: '8А', name: 'Иванов Иван' })
  assert.deepEqual(parseLine('8 а Иванов Иван'), { cls: '8А', name: 'Иванов Иван' })
  assert.deepEqual(parseLine('Иванов Иван 8 а'), { cls: '8А', name: 'Иванов Иван' })
  assert.deepEqual(parseLine('Иванов Иван'), { cls: '', name: 'Иванов Иван' })
  assert.equal(parseLine('  '), null)
})

const people = (n) => Array.from({ length: n }, (_, i) => `8А Ученик${i}`).join('\n')
const podium = [[{ name: 'А', cls: '8А' }], [{ name: 'Б', cls: '8Б' }], [{ name: 'В', cls: '8В' }]]

test('winnerScreens: пьедестал и призёры', () => {
  assert.equal(winnerScreens({ groups: [{ name: 'x', places: podium, others: '' }] }, 2).length, 1)
  const s = winnerScreens({ groups: [{ name: 'x', places: podium, others: people(5) }] }, 2)
  assert.equal(s.length, 1)
  assert.equal(s[0].list.length, 5)
  const s2 = winnerScreens({ groups: [{ name: 'x', places: podium, others: people(6) }] }, 2)
  assert.equal(s2.length, 2)
  assert.equal(s2[1].podium, null)
  assert.equal(s2[1].part, 1)
})

test('winnerScreens: без пьедестала, делится поровну', () => {
  // cols=2 → 22 на экран; 30 человек → 15 + 15
  const s = winnerScreens({ groups: [{ name: 'x', places: [[], [], []], others: people(30) }] }, 2)
  assert.deepEqual(s.map((x) => x.list.length), [15, 15])
  assert.equal(winnerScreens({ groups: [{ name: 'x', places: [[], [], []], others: people(22) }] }, 2).length, 1)
})

test('winnerScreens: пустые группы пропускаются', () => {
  const s = winnerScreens({ groups: [{ name: 'пусто', places: [[{ name: '' }], [], []], others: '' }, { name: 'y', places: podium, others: '' }] }, 3)
  assert.equal(s.length, 1)
  assert.equal(s[0].group, 1)
  assert.deepEqual(winnerScreens(null, 2), [])
})
