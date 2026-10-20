import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanItem, cleanTemplates } from '../server/playlist.js'
import { cleanDeck } from '../server/decks.js'

test('cleanItem: неизвестный тип и пустое → null', () => {
  assert.equal(cleanItem({ type: 'bogus' }), null)
  assert.equal(cleanItem(null), null)
})

test('cleanItem: countdown без даты → null, с датой — ок', () => {
  assert.equal(cleanItem({ type: 'countdown', title: 'x' }), null)
  assert.equal(cleanItem({ type: 'countdown', date: '2026-13' }), null)
  const it = cleanItem({ type: 'countdown', date: '2026-10-20', time: '25:00' })
  assert.equal(it.date, '2026-10-20')
  assert.equal(it.time, '')
})

test('cleanItem: id — плохой заменяется, хороший остаётся', () => {
  assert.equal(cleanItem({ type: 'schedule', id: 'abc123' }).id, 'abc123')
  const bad = cleanItem({ type: 'schedule', id: 'Плохой id!' })
  assert.match(bad.id, /^[a-z0-9]{4,32}$/)
})

test('cleanItem: лишние поля выбрасываются', () => {
  const it = cleanItem({ type: 'changes', id: 'ch01', hack: 1, media: 'abc', fit: 'cover', skipEmpty: true })
  assert.equal(it.hack, undefined)
  assert.equal(it.media, undefined)
  assert.equal(it.fit, undefined)
  assert.equal(cleanItem({ type: 'image', media: 'abc12', evil: 1 }).evil, undefined)
  assert.equal(cleanItem({ type: 'image' }), null) // без фото
})

test('cleanItem: duration 3…3600', () => {
  const dur = (v) => cleanItem({ type: 'schedule', duration: v }).duration
  assert.equal(dur(1), 3)
  assert.equal(dur(99999), 3600)
  assert.equal(dur(30), 30)
  assert.equal(dur('abc'), 15) // по умолчанию
})

test('cleanDeck', () => {
  assert.equal(cleanDeck(null), null)
  const d = cleanDeck({ id: 'ПЛОХО', name: '', theme: 'нет', factTime: 1, hack: 1, cards: [{ type: 'fact', text: 'a' }, { type: 'zzz' }] })
  assert.match(d.id, /^[a-z0-9]{4,32}$/)
  assert.equal(d.name, 'Колода')
  assert.equal(d.theme, '6')
  assert.equal(d.factTime, 3)
  assert.equal(d.hack, undefined)
  assert.equal(d.cards.length, 1)
})

test('baseConflict: новее базы — конфликт; нет заголовка — пишем как раньше', async () => {
  const { baseConflict, nextUpdated } = await import('../server/conflict.js')
  assert.equal(baseConflict({ headers: { 'x-base-updated': '100' } }, 200), true)
  assert.equal(baseConflict({ headers: { 'x-base-updated': '200' } }, 200), false)
  assert.equal(baseConflict({ headers: {} }, 200), false)
  assert.equal(nextUpdated(150, 200), 201) // часы клиента отстают — версия всё равно растёт
  assert.equal(nextUpdated(300, 200), 300)
})

test('cleanItem: screens — обрезка, без пустых и повторов, не больше 10', () => {
  const base = { type: 'schedule', id: 'abcd1' }
  assert.equal('screens' in cleanItem({ ...base, screens: [] }), false)
  assert.deepEqual(cleanItem({ ...base, screens: [' Hall ', 'hall', '', 5, 'x'.repeat(50)] }).screens, ['Hall', '5', 'x'.repeat(40)])
  assert.equal(cleanItem({ ...base, screens: Array.from({ length: 15 }, (_, i) => 'e' + i) }).screens.length, 10)
})

test('cleanTemplates: имя ≤40, слайд чистится, id и on не входят, битое выбрасывается', () => {
  const out = cleanTemplates([
    { id: 'abcd1', name: ' Поздравляем '.repeat(5), slide: { type: 'news', id: 'zzzz9', on: false, title: 'Имя', theme: 'нет' } },
    { name: 'Без даты', slide: { type: 'countdown', title: 'x' } },
    { name: '', slide: { type: 'news' } },
    { name: 'Мусор', slide: { type: 'bogus' } },
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].id, 'abcd1')
  assert.ok(out[0].name.length <= 40)
  assert.equal(out[0].slide.id, undefined)
  assert.equal(out[0].slide.on, undefined)
  assert.equal(out[0].slide.theme, '6')
  assert.equal(cleanTemplates(null).length, 0)
  assert.equal(cleanTemplates(Array.from({ length: 60 }, (_, i) => ({ name: 'n' + i, slide: { type: 'news' } }))).length, 50)
})
