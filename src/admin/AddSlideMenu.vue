<script setup>
// Кнопка «＋ Добавить слайд» с выезжающим меню типов. Само добавление делает PlaylistEditor (событие add).
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { decks } from '../decks.js'
import { playlist, BUILTIN_TEMPLATES } from '../playlist.js'
import { can } from './auth.js'

const emit = defineEmits(['add', 'template', 'rename-template', 'remove-template']) // add(type, deckId?)  type: media | schedule | changes | news | winners | countdown | menu | birthdays | deck; template(шаблон)

const KINDS = [
  { type: 'media', icon: '▣', title: 'Фото или видео', note: 'Файлы из медиатеки' },
  { type: 'schedule', icon: '5–11', title: 'Расписание', note: 'Табло уроков по параллелям' },
  { type: 'changes', icon: 'Изм.', title: 'Изменения', note: 'Замены в расписании' },
  { type: 'news', icon: 'Нов.', title: 'Новость', note: 'Заголовок, текст и фото' },
  { type: 'winners', icon: '🏆', title: 'Победители', note: 'Пьедестал и призёры по классам' },
  { type: 'countdown', icon: '⏳', title: 'Обратный отсчёт', note: 'Сколько дней до события' },
  { type: 'menu', icon: '🍽', title: 'Меню столовой', note: 'Меню на сегодня по дням недели' },
  { type: 'birthdays', icon: '🎂', title: 'Именинники', note: 'Сам поздравляет с днём рождения' },
]

const open = ref(false)
const deckOpen = ref(false) // раскрыт ли список колод внутри меню
const tplOpen = ref(false) // раскрыт ли список шаблонов
const root = ref(null)

function toggle() {
  open.value = !open.value
  deckOpen.value = false
  tplOpen.value = false
}
function pickTemplate(t) {
  open.value = false
  emit('template', t)
}
// цвет миниатюры шаблона — по теме его слайда
const tplType = (t) => cls(t.slide.type)
// класс значка по типу слайда; у «menu» — свой, иначе совпадёт с классом выпадающего меню (.menu)
const cls = (type) => (type === 'menu' ? 'canteen' : type)
function pick(type, deck) {
  open.value = false
  emit('add', type, deck)
}

// закрыть по клику мимо меню и по Esc
const onDown = (e) => open.value && !root.value?.contains(e.target) && (open.value = false)
const onKey = (e) => e.key === 'Escape' && (open.value = false)
onMounted(() => {
  window.addEventListener('mousedown', onDown)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onDown)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="add">
    <button class="a-btn primary big" :class="{ open }" @click="toggle">
      <span>＋ Добавить слайд</span>
      <span class="arrow">▾</span>
    </button>

    <div class="menu" :class="{ open }">
      <button v-for="k in KINDS" :key="k.type" class="item" @click="pick(k.type)">
        <span class="ico" :class="cls(k.type)">{{ k.icon }}</span>
        <span class="txt">
          <b>{{ k.title }}</b>
          <small>{{ k.note }}</small>
        </span>
      </button>
      <button class="item" :class="{ on: deckOpen }" @click="deckOpen = !deckOpen">
        <span class="ico deck">?!</span>
        <span class="txt">
          <b>Колода</b>
          <small>Факты, вопросы, загадки — каждый показ новая карточка</small>
        </span>
        <span class="more">{{ deckOpen ? '▴' : '▾' }}</span>
      </button>
      <div v-if="deckOpen" class="decks">
        <button v-for="d in decks.list" :key="d.id" class="deck-item" @click="pick('deck', d.id)">
          {{ d.name }} <span>{{ d.cards.length }}</span>
        </button>
        <a v-if="!decks.list.length" class="a-link" href="#decks">Колод пока нет — создать →</a>
      </div>
      <button class="item" :class="{ on: tplOpen }" @click="tplOpen = !tplOpen">
        <span class="ico tpl">❖</span>
        <span class="txt">
          <b>Из шаблона</b>
          <small>Готовые заготовки и ваши шаблоны</small>
        </span>
        <span class="more">{{ tplOpen ? '▴' : '▾' }}</span>
      </button>
      <div v-if="tplOpen" class="decks">
        <div v-for="t in BUILTIN_TEMPLATES" :key="t.id" class="tpl-row">
          <button class="deck-item" :title="t.name" @click="pickTemplate(t)">
            <span class="dot" :class="tplType(t)"></span><b>{{ t.name }}</b>
          </button>
        </div>
        <div v-for="t in playlist.templates" :key="t.id" class="tpl-row">
          <button class="deck-item" :title="t.name" @click="pickTemplate(t)">
            <span class="dot" :class="tplType(t)"></span><b>{{ t.name }}</b>
          </button>
          <button v-if="can('playlist')" class="mini" title="Переименовать" @click="emit('rename-template', t)">✎</button>
          <button v-if="can('playlist')" class="mini" title="Удалить" @click="emit('remove-template', t)">✕</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.add {
  position: relative;
}
.big {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  font-size: 15px;
}
.arrow {
  transition: transform 0.2s;
}
.big.open .arrow {
  transform: rotate(180deg);
}
/* меню выезжает вниз из-под кнопки */
.menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: calc(100vh - 160px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border-radius: 12px;
  background: #2b2e35;
  border: 1px solid #3b404a;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5);
  opacity: 0;
  transform: translateY(-8px);
  pointer-events: none;
  visibility: hidden;
  transition:
    opacity 0.15s,
    transform 0.15s,
    visibility 0.15s;
}
.menu.open {
  opacity: 1;
  transform: none;
  pointer-events: auto;
  visibility: visible;
}
.item {
  display: flex;
  align-items: center;
  gap: 12px;
  border: none;
  border-radius: 8px;
  padding: 7px 10px 7px 7px;
  background: transparent;
  color: #f2f2f2;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.item:hover,
.item.on {
  background: #3b404a;
}
.ico {
  flex: 0 0 auto;
  width: 56px;
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: #000;
  color: #fff;
  font-weight: 900;
  font-size: 12px;
}
.ico.media {
  background: linear-gradient(135deg, #4a6a8a, #1c2a3a);
  font-size: 16px;
}
.ico.schedule {
  background: linear-gradient(135deg, #f0a32a, #c45a10);
}
.ico.changes {
  background: linear-gradient(135deg, #6b4a2b, #3f7a3a);
}
.ico.news {
  background: linear-gradient(135deg, #2c74c0, #0c2c68);
}
.ico.winners {
  background: linear-gradient(135deg, #e0b030, #7a4a0c);
  font-size: 16px;
}
.ico.countdown {
  background: linear-gradient(135deg, #e0752a, #7a1f0c);
  font-size: 15px;
}
.ico.canteen {
  background: linear-gradient(135deg, #3c9a4a, #0c4a2a);
  font-size: 15px;
}
.ico.birthdays {
  background: linear-gradient(135deg, #e04a8a, #6a0c3a);
  font-size: 15px;
}
.ico.tpl {
  background: linear-gradient(135deg, #2f9a8a, #0c3a4a);
  font-size: 16px;
}
.ico.deck {
  background: linear-gradient(135deg, #7a2fd0, #12052e);
  font-size: 15px;
}
.txt {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.txt b {
  font-weight: 800;
  font-size: 14px;
}
.txt small {
  color: #8b909a;
  font-size: 12px;
  font-weight: 600;
}
.more {
  color: #8b909a;
}
.decks {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 0 4px 75px;
}
.deck-item {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  border: none;
  border-radius: 7px;
  padding: 6px 10px;
  background: #22252b;
  color: #e6e8ec;
  font: inherit;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}
.deck-item:hover {
  background: #3b404a;
}
.deck-item span {
  color: #8b909a;
}
.tpl-row {
  display: flex;
  gap: 2px;
  min-width: 0;
}
.tpl-row .deck-item {
  flex: 1;
  min-width: 0;
  justify-content: flex-start;
  align-items: center;
}
.tpl-row .deck-item b {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 700;
}
.dot {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  border-radius: 4px;
  background: #2c74c0;
}
.dot.countdown {
  background: #e0752a;
}
.dot.canteen {
  background: #3c9a4a;
}
.dot.birthdays {
  background: #e04a8a;
}
.dot.winners {
  background: #e0b030;
}
.mini {
  flex: 0 0 auto;
  border: none;
  border-radius: 7px;
  padding: 0 9px;
  background: #22252b;
  color: #aeb3bd;
  font: inherit;
  cursor: pointer;
}
.mini:hover {
  background: #3b404a;
  color: #fff;
}
.decks .a-link {
  padding: 6px 10px;
}
</style>
