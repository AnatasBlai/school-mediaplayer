import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mediaRefs, remapMedia, mergePlaylistAdd, mergeDecks, cmpVersion, transferName } from '../src/transfer.js'

const pl = () => ({
  items: [
    { id: 'a1', type: 'image', media: 'm1' },
    { id: 'a2', type: 'news', media: 'm2', title: 'X' },
    { id: 'a3', type: 'schedule' },
  ],
  templates: [{ id: 't1', name: 'Т', slide: { type: 'image', media: 'm1' } }],
  ticker: { on: true, speed: 'normal', items: [{ text: 'один', until: '' }] },
})

test('mediaRefs: слайды, шаблоны и карточки колод', () => {
  const decks = { decks: [{ id: 'd1', cards: [{ id: 'c1', media: 'm9' }, { id: 'c2' }] }] }
  assert.deepEqual([...mediaRefs(pl(), decks)].sort(), ['m1', 'm2', 'm9'])
  assert.equal(mediaRefs(undefined).size, 0)
})

test('remapMedia: переписывает по таблице, не трогает исходный документ', () => {
  const src = pl()
  const out = remapMedia(src, new Map([['m1', 'x1'], ['m2', 'm2']]))
  assert.equal(out.items[0].media, 'x1')
  assert.equal(out.items[1].media, 'm2')
  assert.equal(out.templates[0].slide.media, 'x1')
  assert.equal(src.items[0].media, 'm1')
})

test('remapMedia: null убирает ссылку, id вне таблицы остаётся; колоды и объект вместо Map', () => {
  const out = remapMedia(pl(), { m1: null })
  assert.equal('media' in out.items[0], false)
  assert.equal(out.items[1].media, 'm2')
  const d = remapMedia({ decks: [{ cards: [{ media: 'a' }, { media: 'b' }] }] }, { a: 'z' })
  assert.deepEqual(d.decks[0].cards.map((c) => c.media), ['z', 'b'])
})

test('mergePlaylistAdd: совпавший id — на месте, новые — в конец, школьные настройки не трогаются', () => {
  const cur = { ...pl(), layout: 'panel', blank: { on: true, periods: [] }, urgent: { on: false, id: '' } }
  const file = {
    items: [{ id: 'a2', type: 'news', title: 'Новая' }, { id: 'n1', type: 'schedule' }],
    templates: [{ id: 't1', name: 'Т2', slide: {} }, { id: 't2', name: 'Н', slide: {} }],
    ticker: { on: false, speed: 'slow', items: [{ text: 'один', until: '' }, { text: 'два', until: '' }] },
    layout: 'full',
  }
  const r = mergePlaylistAdd(cur, file)
  assert.deepEqual(r.playlist.items.map((x) => x.id), ['a1', 'a2', 'a3', 'n1'])
  assert.equal(r.playlist.items[1].title, 'Новая')
  assert.equal(r.playlist.layout, 'panel')
  assert.equal(r.playlist.blank.on, true)
  assert.equal(r.playlist.ticker.on, true)
  assert.deepEqual(r.playlist.ticker.items.map((x) => x.text), ['один', 'два'])
  assert.deepEqual([r.added, r.updated, r.tplAdded, r.tplUpdated, r.tickerAdded], [1, 1, 1, 1, 1])
})

test('mergePlaylistAdd: бегущая строка не больше 10', () => {
  const cur = pl()
  cur.ticker.items = Array.from({ length: 9 }, (_, i) => ({ text: 'т' + i, until: '' }))
  const file = { items: [], templates: [], ticker: { items: [{ text: 'a', until: '' }, { text: 'b', until: '' }, { text: 'c', until: '' }] } }
  const r = mergePlaylistAdd(cur, file)
  assert.equal(r.playlist.ticker.items.length, 10)
  assert.equal(r.tickerAdded, 1)
  assert.equal(r.tickerSkipped, 2)
})

test('mergeDecks: по id заменить или добавить, школьные остаются', () => {
  const r = mergeDecks([{ id: 'd1', name: 'старая' }, { id: 'd2', name: 'школьная' }], [{ id: 'd1', name: 'новая' }, { id: 'd3', name: 'третья' }])
  assert.deepEqual(r.map((d) => d.name), ['новая', 'школьная', 'третья'])
})

test('cmpVersion и transferName', () => {
  assert.equal(cmpVersion('0.13.0', '0.12.9'), 1)
  assert.equal(cmpVersion('0.12.0', '0.12.0'), 0)
  assert.equal(cmpVersion('0.9.5', '0.10.0'), -1)
  assert.equal(transferName(new Date(2026, 9, 5, 9, 7)), 'tablo-2026-10-05_09-07.zip')
})
