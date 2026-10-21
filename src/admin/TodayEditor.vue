<script setup>
// Окно правки слайда «Сегодня»: группы праздников галочками, свои даты, цвет, анимация, время.
// Справа живое превью: даты сегодняшнего дня, а если их нет — пример. Правки сразу пишутся в слайд плейлиста.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { layoutOf, saveAsTemplate } from '../playlist.js'
import { HOLIDAY_GROUPS, holidaysFor, validHolidayDate } from '../holidays.js'
import TodaySlide from '../display/TodaySlide.vue'
import ThemeSwatches from './ThemeSwatches.vue'

const props = defineProps({ item: Object }) // слайд type: 'today' — правим прямо его
const emit = defineEmits(['close'])

const ANIMS = { none: 'Без анимации', rise: 'Появление: панель и строки по очереди' }
const MAX_EXTRA = 100
const SAMPLE = [
  { title: 'День учителя', note: '', group: 'ru' },
  { title: 'День Республики Башкортостан', note: 'Пример пояснения', group: 'rb' },
  { title: 'День лицея', note: '', group: 'school' },
]
const today = computed(() => holidaysFor(props.item, new Date()))
const list = computed(() => (today.value.length ? today.value : SAMPLE))

function toggleGroup(k) {
  const g = props.item.groups
  if (g.includes(k)) props.item.groups = g.filter((x) => x !== k)
  else props.item.groups = Object.keys(HOLIDAY_GROUPS).filter((x) => x === k || g.includes(x))
}

// в файле дата — «ММ-ДД» или «ГГГГ-ММ-ДД», а человек вводит «12.05» / «12.05.2026» — переводим при выходе из поля
function fromHuman(v) {
  const s = String(v || '').trim()
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = /^(\d{1,2})\.(\d{1,2})$/.exec(s)
  if (m) return `${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return s
}
const toHuman = (d) => {
  const m = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/.exec(d || '')
  return m ? `${m[3]}.${m[2]}${m[1] ? '.' + m[1] : ''}` : d || ''
}
function addExtra() {
  if (props.item.extra.length < MAX_EXTRA) props.item.extra.push({ d: '', title: '', note: '' })
}
function setDate(e, ev) {
  e.d = fromHuman(ev.target.value)
  ev.target.value = toHuman(e.d)
}
const bad = (e) => !!e.d && !validHolidayDate(e.d)

function setDuration(v) {
  props.item.duration = Math.min(3600, Math.max(3, Math.round(Number(v)) || props.item.duration))
}

const onKey = (ev) => ev.key === 'Escape' && emit('close')
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="a-modal-back" @mousedown.self="emit('close')">
    <div class="a-modal td-ed">
      <div class="head">
        <h2>Сегодня: праздники и даты</h2>
        <span class="a-hint">Сохраняется сам и сразу виден на экранах</span>
        <button class="a-btn" title="Запомнить этот слайд как заготовку" @click="saveAsTemplate(item)">Сохранить как шаблон</button>
        <button class="a-btn primary" @click="emit('close')">Готово</button>
      </div>

      <div class="cols">
        <div class="form">
          <div>
            <span class="a-label">Какие даты показывать</span>
            <div class="groups">
              <label v-for="(name, k) in HOLIDAY_GROUPS" :key="k" class="a-check">
                <input type="checkbox" :checked="item.groups.includes(k)" @change="toggleGroup(k)" />{{ name }}
              </label>
            </div>
            <b class="state" :class="{ none: !today.length }">
              {{ today.length ? `Сегодня дат: ${today.length} — слайд показывается` : 'Сегодня подходящих дат нет — слайд пропускается' }}
            </b>
          </div>

          <div v-if="item.groups.includes('school')" class="extra">
            <span class="a-label">Свои даты ({{ item.extra.length }})</span>
            <p class="a-hint">
              Дата «12.05» — каждый год, «12.05.2026» — только в этот год. Ураза-байрам и Курбан-байрам каждый год в разные
              дни — добавьте их на этот год.
            </p>
            <div v-for="(e, k) in item.extra" :key="k" class="ex">
              <input class="a-input d" :class="{ err: bad(e) }" :value="toHuman(e.d)" placeholder="12.05" maxlength="10" @change="setDate(e, $event)" />
              <input v-model="e.title" class="a-input t" maxlength="80" placeholder="Название" />
              <input v-model="e.note" class="a-input n" maxlength="160" placeholder="Пояснение (можно пустое)" />
              <button class="a-btn" title="Убрать дату" @click="item.extra.splice(k, 1)">✕</button>
            </div>
            <button class="a-btn" :disabled="item.extra.length >= MAX_EXTRA" @click="addExtra">＋ Своя дата</button>
            <p v-if="item.extra.some(bad)" class="a-hint warn">Дата не похожа на настоящую — такая строка не сохранится.</p>
          </div>

          <div>
            <span class="a-label">Анимация</span>
            <span class="a-seg">
              <button v-for="(v, k) in ANIMS" :key="k" :class="{ on: (item.anim || 'none') === k }" @click="item.anim = k">{{ v }}</button>
            </span>
          </div>

          <div class="row2">
            <div>
              <span class="a-label">Цвет</span>
              <ThemeSwatches v-model="item.theme" />
            </div>
            <label>
              <span class="a-label">Секунд на экране</span>
              <input type="number" class="a-input a-num" min="3" max="3600" :value="item.duration" @change="setDuration($event.target.value)" />
              <span class="a-hint">Если дат в один день больше трёх — показываются первые три</span>
            </label>
          </div>
        </div>

        <div class="preview">
          <span class="a-label">{{ today.length ? 'Так будет на экране сегодня' : 'Так будет на экране (пример)' }}</span>
          <div class="screen"><TodaySlide :item="item" :list="list" preview :layout="layoutOf(item)" /></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.td-ed {
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
  flex: 0 0 560px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.form label {
  display: flex;
  flex-direction: column;
}
.form label.a-check {
  flex-direction: row;
}
.groups {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
}
.state {
  display: block;
  margin-top: 6px;
  color: #8fe0a2;
}
.state.none {
  color: #9aa1ad;
}
.extra {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid #353943;
}
.ex {
  display: flex;
  gap: 6px;
  width: 100%;
}
.ex .d {
  flex: 0 0 100px;
}
.ex .t,
.ex .n {
  flex: 1;
  min-width: 0;
}
.err {
  border-color: #e05a5a;
}
.warn {
  color: #e8a050;
}
.row2 {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.row2 > * {
  flex: 1;
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
