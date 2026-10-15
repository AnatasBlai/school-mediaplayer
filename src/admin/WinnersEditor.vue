<script setup>
// Окно правки слайда «Победители»: форма слева, живое превью справа (показывает выбранный класс).
// Группы-классы — вкладками; у группы 1–3 места (ФИО и класс, до 3 человек на место) и призёры текстом.
// Правки сразу пишутся в слайд плейлиста (и уходят на экраны, как любая правка плейлиста).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { mediaById, thumbUrl, layoutOf, NEWS_ANIMS, winnerScreensOf } from '../playlist.js'
import { makeGroup, parseOthers, podiumOf, UNDER_PODIUM, PER_PLACE } from '../winners.js'
import { plural } from '../bells.js'
import WinnersSlide from '../display/WinnersSlide.vue'
import MediaPicker from './MediaPicker.vue'
import ThemeSwatches from './ThemeSwatches.vue'

const props = defineProps({ item: Object }) // слайд type: 'winners' — правим прямо его
const emit = defineEmits(['close'])

const LABELS = ['Поздравляем!', 'Достижения', 'Гордимся!', 'Итоги']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
function today() {
  const d = new Date()
  props.item.date = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`
}

// ---------- группы ----------
if (!props.item.groups?.length) props.item.groups = [makeGroup()]
const cur = ref(0)
const group = computed(() => props.item.groups[Math.min(cur.value, props.item.groups.length - 1)])
const groupTitle = (g, i) => g.name.trim() || 'Класс ' + (i + 1)
function addGroup() {
  props.item.groups.push(makeGroup())
  cur.value = props.item.groups.length - 1
}
function removeGroup() {
  const g = group.value
  const filled = podiumOf(g).some((p) => p.length) || parseOthers(g.others).length
  if (filled && !confirm(`Убрать «${groupTitle(g, cur.value)}» вместе со всеми фамилиями?`)) return
  props.item.groups.splice(cur.value, 1)
  if (!props.item.groups.length) props.item.groups.push(makeGroup())
  cur.value = Math.min(cur.value, props.item.groups.length - 1)
}
function moveGroup(d) {
  const i = cur.value
  const j = i + d
  const gs = props.item.groups
  if (j < 0 || j >= gs.length) return
  ;[gs[i], gs[j]] = [gs[j], gs[i]]
  cur.value = j
}
const MEDALS = ['🥇', '🥈', '🥉']
function addPerson(pi) {
  if (group.value.places[pi].length < PER_PLACE) group.value.places[pi].push({ name: '', cls: '' })
}

// ---------- сводка ----------
const othersCount = computed(() => parseOthers(group.value.others).length)
const hasWinners = computed(() => podiumOf(group.value).some((p) => p.length))
const screens = computed(() => winnerScreensOf(props.item))
const groupScreens = computed(() => screens.value.filter((s) => s.group === cur.value).length)
const totalSecs = computed(() => screens.value.length * props.item.duration)
const screensText = (n) => n + ' ' + plural(n, 'экран', 'экрана', 'экранов')

const cut = ref({ title: false, names: false, list: false }) // что в превью обрезано
const picking = ref(false)
function pick(id) {
  props.item.media = id
  picking.value = false
}
function setDuration(v) {
  props.item.duration = Math.min(3600, Math.max(3, Math.round(Number(v)) || props.item.duration))
}

const titleEl = ref(null)
const onKey = (e) => e.key === 'Escape' && !picking.value && emit('close')
onMounted(() => {
  window.addEventListener('keydown', onKey)
  if (!props.item.title) titleEl.value?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="a-modal-back" @mousedown.self="emit('close')">
    <div class="a-modal win-ed">
      <div class="head">
        <h2>Победители</h2>
        <span class="a-hint">Сохраняется сама и сразу видна на экранах</span>
        <button class="a-btn primary" @click="emit('close')">Готово</button>
      </div>

      <div class="cols">
        <div class="form">
          <div class="row2">
            <label>
              <span class="a-label">Метка</span>
              <input v-model="item.label" class="a-input" list="win-labels" maxlength="40" placeholder="Поздравляем!" />
              <datalist id="win-labels">
                <option v-for="l in LABELS" :key="l" :value="l" />
              </datalist>
            </label>
            <label>
              <span class="a-label">Дата (необязательно)</span>
              <span class="with-btn">
                <input v-model="item.date" class="a-input" maxlength="40" placeholder="9 октября" />
                <button class="a-btn small" @click="today">сегодня</button>
              </span>
            </label>
          </div>

          <label>
            <span class="a-label">Заголовок</span>
            <input ref="titleEl" v-model="item.title" class="a-input" maxlength="100" placeholder="Победители ВСОШ по информатике" />
          </label>

          <div class="groups">
            <span class="a-label">Классы — идут на экране по очереди</span>
            <div class="tabs">
              <button v-for="(g, i) in item.groups" :key="i" class="tab" :class="{ on: i === cur }" @click="cur = i">{{ groupTitle(g, i) }}</button>
              <button v-if="item.groups.length < 20" class="tab add" @click="addGroup">＋ Добавить класс</button>
            </div>

            <div class="grp">
              <div class="with-btn">
                <input v-model="group.name" class="a-input" maxlength="40" placeholder="Название, например: 8 классы" />
                <button class="a-btn small" title="Раньше" :disabled="cur === 0" @click="moveGroup(-1)">←</button>
                <button class="a-btn small" title="Позже" :disabled="cur === item.groups.length - 1" @click="moveGroup(1)">→</button>
                <button class="a-btn small" title="Убрать этот класс" @click="removeGroup">✕</button>
              </div>

              <div v-for="pi in [0, 1, 2]" :key="pi" class="place">
                <span class="medal">{{ MEDALS[pi] }}</span>
                <div class="people">
                  <div v-for="(p, k) in group.places[pi]" :key="k" class="person">
                    <input v-model="p.name" class="a-input" maxlength="60" :placeholder="pi + 1 + ' место — фамилия и имя'" />
                    <input v-model="p.cls" class="a-input cls" maxlength="6" placeholder="8А" />
                    <button v-if="group.places[pi].length > 1" class="a-btn small" title="Убрать" @click="group.places[pi].splice(k, 1)">✕</button>
                  </div>
                </div>
                <button v-if="group.places[pi].length < PER_PLACE" class="a-btn small more" title="Ещё один человек на этом месте" @click="addPerson(pi)">＋ ещё</button>
              </div>
              <span class="a-hint">Пустое место останется на пьедестале тусклым.</span>

              <label>
                <span class="a-label">Призёры · {{ othersCount }}</span>
                <textarea
                  v-model="group.others"
                  class="a-textarea"
                  rows="6"
                  maxlength="3000"
                  placeholder="Каждый с новой строки: класс и ФИО&#10;8А Иванов Иван&#10;8Б Петрова Мария"
                ></textarea>
              </label>
              <span class="a-hint">
                Этот класс займёт {{ screensText(groupScreens) }}.
                <template v-if="hasWinners && othersCount > UNDER_PODIUM">
                  Под пьедесталом помещается {{ UNDER_PODIUM }} призёров, остальные покажутся на экране «продолжение».
                </template>
                <template v-else-if="!hasWinners && othersCount">Победителей нет — призёры займут всё место.</template>
              </span>
            </div>
          </div>

          <div>
            <span class="a-label">Фото</span>
            <div class="photo-row">
              <img v-if="item.media && mediaById(item.media)" class="mini" :src="thumbUrl(mediaById(item.media))" alt="" />
              <button class="a-btn" @click="picking = true">{{ item.media ? 'Заменить' : 'Выбрать из медиатеки' }}</button>
              <button v-if="item.media" class="a-btn" @click="delete item.media">Без фото</button>
              <span v-if="item.media" class="a-seg">
                <button :class="{ on: item.fit !== 'contain' }" @click="item.fit = 'cover'">Заполнить</button>
                <button :class="{ on: item.fit === 'contain' }" @click="item.fit = 'contain'">Целиком</button>
              </span>
            </div>
          </div>

          <div>
            <span class="a-label">Анимация</span>
            <div class="photo-row">
              <span class="a-seg">
                <button v-for="(v, k) in NEWS_ANIMS" :key="k" :class="{ on: (item.anim || 'none') === k }" @click="item.anim = k">{{ v[0] }}</button>
              </span>
            </div>
            <span class="a-hint">{{ NEWS_ANIMS[item.anim || 'none'][1] }}<template v-if="!item.media && ['zoom', 'drift', 'parallax'].includes(item.anim)"> Без фото — как «Появление текста».</template></span>
          </div>

          <div class="row2">
            <div>
              <span class="a-label">Цвет</span>
              <ThemeSwatches v-model="item.theme" />
            </div>
            <label>
              <span class="a-label">Секунд на каждый экран</span>
              <input type="number" class="a-input a-num" min="3" max="3600" :value="item.duration" @change="setDuration($event.target.value)" />
              <span class="a-hint">Весь слайд: {{ screensText(screens.length) }}, {{ totalSecs }} с</span>
            </label>
          </div>
        </div>

        <div class="preview">
          <span class="a-label">Так будет на экране · {{ groupTitle(group, cur) }}</span>
          <div class="screen">
            <WinnersSlide :item="item" :active="false" preview measure :group="cur" :layout="layoutOf(item)" @overflow="cut = $event" />
          </div>
          <p v-if="cut.title" class="a-warn">⚠ Заголовок не помещается целиком — сократите его</p>
          <p v-if="cut.names" class="a-warn">⚠ Имя на пьедестале не помещается — сократите его (например, без отчества)</p>
          <p v-if="cut.list" class="a-warn">⚠ Призёры не помещаются даже мелким шрифтом — сократите заголовок или уберите метку и дату</p>
        </div>
      </div>
    </div>

    <MediaPicker v-if="picking" :current="item.media || ''" @pick="pick" @close="picking = false" />
  </div>
</template>

<style scoped>
.win-ed {
  width: min(1400px, 96vw);
}
.head {
  display: flex;
  align-items: center;
  gap: 14px;
}
.head .a-hint {
  margin-right: auto;
}
.cols {
  display: flex;
  gap: 20px;
  min-height: 0;
  overflow: auto;
}
.form {
  flex: 0 0 520px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.form label {
  display: flex;
  flex-direction: column;
}
.form .a-input,
.form .a-textarea {
  width: 100%;
}
.row2 {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.row2 > * {
  flex: 1;
}
.with-btn {
  display: flex;
  gap: 6px;
}
.photo-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.mini {
  width: 96px;
  height: 54px;
  object-fit: cover;
  border-radius: 6px;
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.tab {
  padding: 6px 12px;
  border: 1px solid #3b404a;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  background: #2a2e36;
  color: #c9ccd2;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.tab.on {
  background: #3d7be0;
  border-color: #3d7be0;
  color: #fff;
}
.tab.add {
  background: none;
  border-style: dashed;
  color: #8b909a;
}
.grp {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid #3b404a;
  border-radius: 0 8px 8px 8px;
  background: #23262d;
}
.place {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.medal {
  flex: none;
  width: 26px;
  padding-top: 6px;
  font-size: 20px;
  text-align: center;
}
.people {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.person {
  display: flex;
  gap: 6px;
}
.form .person .cls {
  flex: none;
  width: 64px;
}
.more {
  flex: none;
  margin-top: 2px;
}
.preview {
  flex: 1;
  min-width: 0;
}
.screen {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  overflow: hidden;
  background: #000;
}
</style>
