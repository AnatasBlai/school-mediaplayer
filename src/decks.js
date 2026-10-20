// Колоды карточек (data/decks.json): загрузка, сохранение (debounce 300 мс → PUT /api/decks), обновление по SSE.
// Общий для экрана (слайд «колода») и редактора (раздел «Колоды»). Устроен как playlist.js.
import { reactive, ref, watch } from 'vue'
import { onServerEvent, saveStatus } from './store.js'
import { newCardId } from './deckText.js'
import { makeSaver } from './saver.js'

export const decks = reactive({ updatedAt: 0, list: [] })
export const decksLoaded = ref(false)
export const deckById = (id) => decks.list.find((d) => d.id === id)

export function makeDeck(name = 'Новая колода') {
  return { id: newCardId(), name, theme: '6', factTime: 15, qTime: 20, aTime: 10, cards: [] }
}

export function makeCard(type) {
  if (type === 'choice') return { id: newCardId(), type, text: '', options: ['', '', '', ''], correct: 0, explain: '' }
  if (type === 'open') return { id: newCardId(), type, text: '', answer: '', explain: '' }
  return { id: newCardId(), type: 'fact', title: '', text: '' }
}

/** Сколько секунд идёт карточка на экране. */
export const cardSeconds = (deck, card) => (card.type === 'fact' ? deck.factTime : deck.qTime + deck.aTime)
/** Сколько в среднем идёт одна карточка колоды, с (нет колоды или карточек — 0). */
export function avgCardSeconds(deck) {
  if (!deck?.cards.length) return 0
  return Math.round(deck.cards.reduce((s, c) => s + cardSeconds(deck, c), 0) / deck.cards.length)
}

/** Номер дня по местному времени — для режима «одна карточка в день». */
export function dayNumber(d = new Date()) {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000)
}

// ---------- загрузка и сохранение ----------

let applying = false
let lastProbe = ''
const probeOf = () => JSON.stringify(decks.list)

const normalize = (d) => ({ updatedAt: Number(d.updatedAt) || 0, decks: Array.isArray(d.decks) ? d.decks : [] })

function applyDoc(n) {
  applying = true
  decks.updatedAt = n.updatedAt
  decks.list = n.decks
  lastProbe = probeOf()
  decksLoaded.value = true
  Promise.resolve().then(() => (applying = false))
}

const saver = makeSaver({
  url: '/api/decks',
  status: saveStatus,
  snapshot: () => ({ updatedAt: decks.updatedAt, decks: JSON.parse(JSON.stringify(decks.list)) }),
  normalize,
  applyDoc,
  names: () => Object.fromEntries(decks.list.map((d) => [d.id, d.name])),
})

function apply(d) {
  const n = normalize(d)
  applyDoc(n)
  saver.setBase(n)
}

async function load(onlyNewer) {
  try {
    const r = await fetch('/api/decks', { cache: 'no-store' })
    if (!r.ok) return
    const d = await r.json()
    if (!onlyNewer) apply(d)
    else await saver.receive(d)
  } catch {
    /* нет связи — останемся с тем, что есть */
  }
}

watch(
  decks,
  () => {
    if (applying || !decksLoaded.value) return
    const probe = probeOf()
    if (probe === lastProbe) return
    lastProbe = probe
    decks.updatedAt = Date.now()
    saver.schedule()
  },
  { deep: true },
)

let started = false
/** Загружает колоды и подписывается на их изменения. Повторный вызов ничего не делает. */
export function startDecks() {
  if (started) return
  started = true
  load(false)
  onServerEvent('decks', (d) => {
    if ((Number(d.updatedAt) || 0) > saver.baseUpdated()) load(true)
  })
  onServerEvent('hello', () => load(true))
}

/** Номер очередного показа колоды — общий счётчик на сервере; без связи — свой счётчик в этом браузере. */
const localTakes = {}
export async function takeCard(deckId) {
  try {
    const r = await fetch(`/api/decks/${deckId}/take`, { method: 'POST' })
    if (r.ok) return (await r.json()).n
  } catch {
    /* ignore */
  }
  localTakes[deckId] = (localTakes[deckId] ?? Math.floor(Math.random() * 1000)) + 1
  return localTakes[deckId]
}
