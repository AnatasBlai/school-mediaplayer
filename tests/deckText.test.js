import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCards, cardsToText } from '../src/deckText.js'

const text = [
  'Просто факт',
  'Заголовок; текст факта',
  '? Загадка; ответ; ! пояснение',
  '? Вопрос; *верный; неверный; ещё; ! почему',
  '? Вопрос без варианта',
].join('\n')

test('parseCards: типы карточек', () => {
  const c = parseCards(text)
  assert.equal(c.length, 5)
  assert.deepEqual(c[0], { type: 'fact', title: '', text: 'Просто факт' })
  assert.deepEqual(c[1], { type: 'fact', title: 'Заголовок', text: 'текст факта' })
  assert.deepEqual(c[2], { type: 'open', text: 'Загадка', answer: 'ответ', explain: 'пояснение' })
  assert.deepEqual(c[3], { type: 'choice', text: 'Вопрос', options: ['верный', 'неверный', 'ещё'], correct: 0, explain: 'почему' })
  assert.equal(c[4].type, 'open')
})

test('parseCards: табуляция и пустые строки', () => {
  assert.deepEqual(parseCards('А\tБ\n\n  \n'), [{ type: 'fact', title: 'А', text: 'Б' }])
  assert.deepEqual(parseCards(''), [])
})

test('parseCards → cardsToText → parseCards даёт то же', () => {
  const a = parseCards(text)
  assert.deepEqual(parseCards(cardsToText(a)), a)
})
