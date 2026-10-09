<script setup>
// Колоды (/admin#decks): наборы карточек — факты, вопросы с вариантами, загадки.
// Слева список колод, в середине настройки и карточки, справа превью выбранной карточки «как на экране».
// Правки сохраняются сами (src/decks.js). Вставка списком — формат из src/deckText.js.
import { computed, ref, watch } from 'vue'
import { decks, decksLoaded, deckById, makeDeck, makeCard, cardSeconds, startDecks } from '../decks.js'
import { CARD_TYPES, LETTERS, parseCards, cardsToText, newCardId } from '../deckText.js'
import { playlist, makeSlide, mediaById, thumbUrl, startPlaylist, layoutOf } from '../playlist.js'
import DeckCard from '../display/DeckCard.vue'
import MediaPicker from './MediaPicker.vue'
import ThemeSwatches from './ThemeSwatches.vue'

startDecks()
startPlaylist()

// ---------- выбранная колода ----------
const selId = ref(sessionStorage.getItem('deck-sel') || '')
const deck = computed(() => deckById(selId.value) || decks.list[0] || null)
watch(
  () => deck.value?.id,
  (id) => {
    if (id) sessionStorage.setItem('deck-sel', id)
    previewId.value = ''
  },
)

function addDeck() {
  const d = makeDeck()
  decks.list.push(d)
  selId.value = d.id
}
const usesInPlaylist = (id) => playlist.items.filter((it) => it.type === 'deck' && it.deck === id).length
function removeDeck() {
  const d = deck.value
  const uses = usesInPlaylist(d.id)
  const msg = `Удалить колоду «${d.name}» (${d.cards.length} карт.)?` + (uses ? `\nОна стоит в плейлисте (${uses}) — эти слайды тоже уберутся.` : '')
  if (!confirm(msg)) return
  playlist.items = playlist.items.filter((it) => !(it.type === 'deck' && it.deck === d.id))
  decks.list.splice(decks.list.indexOf(d), 1)
  selId.value = decks.list[0]?.id || ''
}
function toPlaylist() {
  playlist.items.push(makeSlide('deck', deck.value.id))
}
function setTime(k, v) {
  deck.value[k] = Math.min(600, Math.max(3, Math.round(Number(v)) || deck.value[k]))
}

const counts = computed(() => {
  const c = { fact: 0, choice: 0, open: 0 }
  for (const x of deck.value?.cards || []) c[x.type]++
  return c
})

// ---------- карточки ----------
function addCard(type) {
  const c = makeCard(type)
  deck.value.cards.push(c)
  previewId.value = c.id
}
function removeCard(i) {
  deck.value.cards.splice(i, 1)
}
function moveCard(i, d) {
  const cards = deck.value.cards
  const j = i + d
  if (j < 0 || j >= cards.length) return
  cards.splice(j, 0, cards.splice(i, 1)[0])
}
/** Смена вида карточки: текст сохраняем, недостающие поля добавляем. */
function setType(c, type) {
  const fresh = makeCard(type)
  for (const k of Object.keys(c)) if (!['id', 'type', 'text', 'media'].includes(k)) delete c[k]
  for (const [k, v] of Object.entries(fresh)) if (!(k in c)) c[k] = v
  c.type = type
}

// картинка к карточке
const pickFor = ref(null)
function pick(id) {
  pickFor.value.media = id
  pickFor.value = null
}

// ---------- превью ----------
const previewId = ref('')
const previewCard = computed(() => {
  const cards = deck.value?.cards || []
  return cards.find((c) => c.id === previewId.value) || cards[0] || null
})
const previewPhase = ref('q')
// шаблон в превью — как у первого слайда этой колоды в плейлисте, иначе общий
const previewLayout = computed(() => {
  const it = playlist.items.find((x) => x.type === 'deck' && x.deck === deck.value?.id)
  return it ? layoutOf(it) : playlist.layout
})
const previewTotal = computed(() => (deck.value && previewCard.value ? cardSeconds(deck.value, previewCard.value) : 0))

// ---------- вставка списком ----------
const pasteOpen = ref(false)
const pasteText = ref('')
const parsed = computed(() => parseCards(pasteText.value))
const parsedCounts = computed(() => {
  const c = { fact: 0, choice: 0, open: 0 }
  for (const x of parsed.value) c[x.type]++
  return c
})
function addParsed() {
  for (const c of parsed.value) deck.value.cards.push({ id: newCardId(), ...c })
  pasteText.value = ''
  pasteOpen.value = false
}
const EXAMPLE = `Слово дня — knowledge; Знание — сила.
Байкал — самое глубокое озеро в мире.
? Сколько бит в байте?; 4; *8; 16; ! В одном байте 8 бит
? Зимой и летом одним цветом; Ёлка`

const copied = ref(false)
async function copyText() {
  try {
    await navigator.clipboard.writeText(cardsToText(deck.value.cards))
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    pasteOpen.value = true
    pasteText.value = cardsToText(deck.value.cards)
  }
}
</script>

<template>
  <section class="decks">
    <!-- список колод -->
    <aside class="list">
      <button v-for="d in decks.list" :key="d.id" class="deck-item" :class="{ on: deck && d.id === deck.id }" @click="selId = d.id">
        <span class="deck-name">{{ d.name }}</span>
        <span class="deck-meta">
          {{ d.cards.length }} карт.
          <span v-if="usesInPlaylist(d.id)" class="in-pl">в плейлисте</span>
        </span>
      </button>
      <button class="a-btn primary" @click="addDeck">＋ Новая колода</button>
      <p class="a-hint">
        Колода — набор карточек. В плейлисте она стоит одним слайдом: каждый показ — следующая карточка
        (или одна карточка на весь день).
      </p>
    </aside>

    <div v-if="decksLoaded && !deck" class="empty">Колод пока нет. Создайте первую кнопкой слева.</div>

    <template v-if="deck">
      <!-- настройки и карточки -->
      <div class="editor">
        <div class="settings">
          <input v-model="deck.name" class="a-input deck-title" maxlength="60" placeholder="Название колоды" />
          <div class="set-row">
            <div>
              <span class="a-label">Цвет</span>
              <ThemeSwatches v-model="deck.theme" />
            </div>
            <label>
              <span class="a-label">Факт, с</span>
              <input type="number" class="a-input a-num" min="3" max="600" :value="deck.factTime" @change="setTime('factTime', $event.target.value)" />
            </label>
            <label>
              <span class="a-label">Вопрос, с</span>
              <input type="number" class="a-input a-num" min="3" max="600" :value="deck.qTime" @change="setTime('qTime', $event.target.value)" />
            </label>
            <label>
              <span class="a-label">Ответ, с</span>
              <input type="number" class="a-input a-num" min="3" max="600" :value="deck.aTime" @change="setTime('aTime', $event.target.value)" />
            </label>
          </div>
          <div class="set-row">
            <button class="a-btn primary" @click="toPlaylist">＋ В плейлист</button>
            <span v-if="usesInPlaylist(deck.id)" class="a-hint">уже в плейлисте: {{ usesInPlaylist(deck.id) }}</span>
            <span class="spacer"></span>
            <button class="a-btn" :disabled="!deck.cards.length" title="Скопировать все карточки текстом — для правки в таблице" @click="copyText">
              {{ copied ? 'Скопировано ✓' : 'Скопировать текстом' }}
            </button>
            <button class="a-btn danger" @click="removeDeck">Удалить колоду</button>
          </div>
        </div>

        <div class="cards-head">
          <b>Карточки: {{ deck.cards.length }}</b>
          <span class="a-hint">факты {{ counts.fact }} · с вариантами {{ counts.choice }} · вопросы/загадки {{ counts.open }}</span>
          <span class="spacer"></span>
          <button class="a-btn small" @click="addCard('fact')">＋ Факт</button>
          <button class="a-btn small" @click="addCard('choice')">＋ Вопрос с вариантами</button>
          <button class="a-btn small" @click="addCard('open')">＋ Загадка</button>
          <button class="a-btn small" :class="{ primary: pasteOpen }" @click="pasteOpen = !pasteOpen">Вставить списком</button>
        </div>

        <!-- вставка списком -->
        <div v-if="pasteOpen" class="paste">
          <div class="paste-help">
            <b>Одна строка — одна карточка.</b> Колонки разделяются «;» или табуляцией (можно копировать прямо из Excel).
            <ul>
              <li><code>Текст</code> или <code>Заголовок; текст</code> — факт</li>
              <li><code>? Вопрос; ответ; ! пояснение</code> — вопрос или загадка</li>
              <li><code>? Вопрос; *верный; неверный; неверный; ! пояснение</code> — варианты (до 4, верный со «*»)</li>
            </ul>
          </div>
          <textarea v-model="pasteText" class="a-textarea" rows="8" :placeholder="EXAMPLE"></textarea>
          <div class="paste-foot">
            <span class="a-hint" v-if="parsed.length">
              Будет добавлено: {{ parsed.length }} — факты {{ parsedCounts.fact }}, с вариантами {{ parsedCounts.choice }},
              вопросы/загадки {{ parsedCounts.open }}
            </span>
            <span class="spacer"></span>
            <button class="a-btn" @click="pasteText = EXAMPLE">Пример</button>
            <button class="a-btn primary" :disabled="!parsed.length" @click="addParsed">Добавить в конец колоды</button>
          </div>
        </div>

        <div v-if="!deck.cards.length && !pasteOpen" class="empty small">
          Карточек нет. Добавьте их кнопками выше или вставьте списком.
        </div>

        <ol class="cards">
          <li v-for="(c, i) in deck.cards" :key="c.id" class="card" :class="{ on: previewCard && c.id === previewCard.id }" @focusin="previewId = c.id">
            <div class="card-top">
              <span class="num">{{ i + 1 }}</span>
              <select class="a-select" :value="c.type" @change="setType(c, $event.target.value)">
                <option v-for="(t, k) in CARD_TYPES" :key="k" :value="k">{{ t }}</option>
              </select>
              <button class="a-btn small" title="Показать в превью" @click="previewId = c.id">👁</button>
              <span class="spacer"></span>
              <img v-if="c.media && mediaById(c.media)" class="mini" :src="thumbUrl(mediaById(c.media))" alt="" />
              <button class="a-btn small" @click="pickFor = c">{{ c.media ? 'Картинка…' : '＋ Картинка' }}</button>
              <button v-if="c.media" class="a-btn small" title="Убрать картинку" @click="delete c.media">без картинки</button>
              <button class="a-btn small" :disabled="i === 0" @click="moveCard(i, -1)">↑</button>
              <button class="a-btn small" :disabled="i === deck.cards.length - 1" @click="moveCard(i, 1)">↓</button>
              <button class="a-btn small danger" title="Удалить карточку" @click="removeCard(i)">✕</button>
            </div>

            <template v-if="c.type === 'fact'">
              <input v-model="c.title" class="a-input" maxlength="80" placeholder="Заголовок (необязательно), например «Слово дня — knowledge»" />
              <textarea v-model="c.text" class="a-textarea" rows="2" maxlength="400" placeholder="Текст факта"></textarea>
            </template>

            <template v-else-if="c.type === 'choice'">
              <textarea v-model="c.text" class="a-textarea" rows="2" maxlength="400" placeholder="Вопрос"></textarea>
              <div class="opts">
                <label v-for="(o, oi) in c.options" :key="oi" class="opt" :class="{ right: c.correct === oi }">
                  <input type="radio" :name="'ok-' + c.id" :checked="c.correct === oi" title="Верный ответ" @change="c.correct = oi" />
                  <b>{{ LETTERS[oi] }}</b>
                  <input v-model="c.options[oi]" class="a-input" maxlength="120" :placeholder="oi < 2 ? 'Вариант' : 'Вариант (необязательно)'" />
                </label>
              </div>
              <input v-model="c.explain" class="a-input" maxlength="300" placeholder="Пояснение после ответа (необязательно)" />
            </template>

            <template v-else>
              <textarea v-model="c.text" class="a-textarea" rows="2" maxlength="400" placeholder="Вопрос или загадка"></textarea>
              <div class="pair">
                <input v-model="c.answer" class="a-input" maxlength="200" placeholder="Ответ" />
                <input v-model="c.explain" class="a-input" maxlength="300" placeholder="Пояснение (необязательно)" />
              </div>
            </template>
          </li>
        </ol>
      </div>

      <!-- превью -->
      <aside class="preview">
        <span class="a-label">Так будет на экране</span>
        <div class="screen">
          <DeckCard v-if="previewCard" :deck="deck" :card="previewCard" :layout="previewLayout" :phase="previewPhase" :left="previewPhase === 'a' ? deck.aTime : previewCard.type === 'fact' ? deck.factTime : deck.qTime" />
        </div>
        <div v-if="previewCard && previewCard.type !== 'fact'" class="a-seg">
          <button :class="{ on: previewPhase === 'q' }" @click="previewPhase = 'q'">Вопрос</button>
          <button :class="{ on: previewPhase === 'a' }" @click="previewPhase = 'a'">Ответ</button>
        </div>
        <p v-if="previewCard" class="a-hint">
          Карточка идёт {{ previewTotal }} с<template v-if="previewCard.type !== 'fact'"> ({{ deck.qTime }} с вопрос + {{ deck.aTime }} с ответ)</template>.
        </p>
      </aside>
    </template>

    <MediaPicker v-if="pickFor" :current="pickFor.media || ''" @pick="pick" @close="pickFor = null" />
  </section>
</template>

<style scoped>
.decks {
  height: 100%;
  display: flex;
  gap: 16px;
  font-size: 14px;
  overflow: hidden;
}
.spacer {
  flex: 1;
}
.empty {
  flex: 1;
  padding: 40px;
  text-align: center;
  color: #8b909a;
  font-weight: 700;
}
.empty.small {
  flex: 0;
  padding: 20px;
}

/* список колод */
.list {
  flex: 0 0 240px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: auto;
}
.deck-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  border: 2px solid transparent;
  border-radius: 10px;
  padding: 10px 12px;
  background: #26292f;
  color: #f2f2f2;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.deck-item:hover {
  background: #2d3138;
}
.deck-item.on {
  border-color: #3d7be0;
  background: #2a3550;
}
.deck-name {
  font-weight: 800;
}
.deck-meta {
  color: #a4a9b3;
  font-size: 12px;
  font-weight: 600;
}
.in-pl {
  margin-left: 4px;
  padding: 0 6px;
  border-radius: 5px;
  background: rgba(63, 174, 90, 0.85);
  color: #fff;
  font-weight: 700;
}
.list .a-btn {
  margin-top: 6px;
}

/* редактор колоды */
.editor {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  padding-right: 4px;
}
.settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: 12px;
  background: #26292f;
}
.deck-title {
  font-size: 20px;
  font-weight: 800;
}
.set-row {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 14px;
}
.set-row label {
  display: flex;
  flex-direction: column;
}
.cards-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
}
.paste {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 12px;
  background: #22252b;
  border: 1px solid #3d7be0;
}
.paste-help {
  color: #c9ccd3;
  line-height: 1.5;
}
.paste-help ul {
  margin: 4px 0 0;
  padding-left: 20px;
}
.paste-help code {
  padding: 1px 6px;
  border-radius: 4px;
  background: #15171b;
  color: #ffd27a;
}
.paste-foot {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cards {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 2px solid transparent;
  border-radius: 10px;
  background: #26292f;
}
.card.on {
  border-color: #3d7be0;
}
.card-top {
  display: flex;
  align-items: center;
  gap: 6px;
}
.num {
  min-width: 24px;
  color: #8b909a;
  font-weight: 800;
}
.mini {
  width: 54px;
  height: 30px;
  object-fit: cover;
  border-radius: 4px;
}
.opts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 10px;
}
.opt {
  display: flex;
  align-items: center;
  gap: 6px;
}
.opt .a-input {
  flex: 1;
}
.opt input[type='radio'] {
  accent-color: #2fae5b;
}
.opt.right .a-input {
  border-color: #2fae5b;
}
.pair {
  display: flex;
  gap: 8px;
}
.pair .a-input:first-child {
  flex: 0 0 40%;
}
.pair .a-input:last-child {
  flex: 1;
}

/* превью */
.preview {
  flex: 0 0 440px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.screen {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  overflow: hidden;
  background: #000;
}
</style>
