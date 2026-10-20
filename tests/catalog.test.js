import { test } from 'node:test'
import assert from 'node:assert/strict'
import { THEME_KEYS, BOARD_THEME_KEYS, SLIDE_TYPES, NEWS_ANIM_KEYS } from '../src/catalog.js'
import { THEMES, ALL_THEMES } from '../src/themes.js'
import { NEWS_ANIMS, SLIDE_TITLES } from '../src/playlist.js'

const sorted = (a) => [...a].sort()

test('ключи тем в catalog.js совпадают с src/themes.js', () => {
  assert.deepEqual(sorted(THEME_KEYS), sorted(Object.keys(ALL_THEMES)))
  assert.deepEqual(sorted(BOARD_THEME_KEYS), sorted(Object.keys(THEMES)))
})

test('анимации новости совпадают с NEWS_ANIMS', () => {
  assert.deepEqual(sorted(NEWS_ANIM_KEYS), sorted(Object.keys(NEWS_ANIMS)))
})

test('у каждого типа слайда есть название', () => {
  assert.deepEqual(sorted(SLIDE_TYPES), sorted(Object.keys(SLIDE_TITLES)))
})
