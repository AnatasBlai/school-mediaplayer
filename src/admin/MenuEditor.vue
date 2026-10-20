<script setup>
// Окно правки меню столовой: слева вкладки дней и приёмы пищи, справа живое превью выбранного дня.
// Правки сразу пишутся в слайд плейлиста.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { layoutOf, saveAsTemplate } from '../playlist.js'
import { splitTable } from '../scheduleImport.js'
import { DAY_NAMES, MAX_MEALS, fitMenu, mealsOf, tableToLines } from '../menu.js'
import { DAY_SHORT } from '../rules.js'
import MenuSlide from '../display/MenuSlide.vue'
import ThemeSwatches from './ThemeSwatches.vue'

const props = defineProps({ item: Object }) // слайд type: 'menu' — правим прямо его
const emit = defineEmits(['close'])

const MEAL_NAMES = ['Завтрак', 'Второй завтрак', 'Обед', 'Полдник', 'Ужин']
const week = ref(1)
const dow = ref(new Date().getDay() === 0 ? 1 : new Date().getDay()) // день недели 1…6
const keyOf = (w, d) => String(w === 2 ? 7 + d : d)
const key = computed(() => keyOf(props.item.twoWeeks ? week.value : 1, dow.value))
const meals = computed(() => props.item.days[key.value] || [])

function setTwoWeeks(v) {
  props.item.twoWeeks = v
  if (!v) week.value = 1
}
function setDuration(v) {
  props.item.duration = Math.min(3600, Math.max(3, Math.round(Number(v)) || props.item.duration))
}
const filled = (k) => (props.item.days[k] || []).some((m) => m.lines.trim())

function addMeal() {
  const list = (props.item.days[key.value] ||= [])
  if (list.length >= MAX_MEALS) return
  const name = MEAL_NAMES.find((n) => !list.some((m) => m.name === n)) || ''
  list.push({ name, time: '', lines: '' })
}
function removeMeal(i) {
  meals.value.splice(i, 1)
  if (!meals.value.length) delete props.item.days[key.value]
}

// ---------- вставка из Excel: столбцы «блюдо | выход | цена» ----------
const paste = ref({ open: false, meal: 0, text: '' })
function openPaste(i) {
  paste.value = { open: true, meal: i, text: '' }
}
function applyPaste() {
  const lines = tableToLines(splitTable(paste.value.text))
  const m = meals.value[paste.value.meal]
  if (m && lines) m.lines = m.lines.trim() ? m.lines.trim() + '\n' + lines : lines
  paste.value.open = false
}

// ---------- копирование дня ----------
const copy = ref({ open: false, to: [] })
const copyTargets = computed(() => {
  const list = []
  for (const w of props.item.twoWeeks ? [1, 2] : [1]) {
    for (let d = 1; d <= 6; d++) {
      const k = keyOf(w, d)
      if (k !== key.value) list.push({ k, label: (props.item.twoWeeks ? w + ' нед. ' : '') + DAY_SHORT[d - 1] })
    }
  }
  return list
})
function openCopy() {
  copy.value = { open: !copy.value.open, to: [] }
}
function applyCopy() {
  const src = JSON.parse(JSON.stringify(meals.value))
  for (const k of copy.value.to) {
    if (src.length) props.item.days[k] = JSON.parse(JSON.stringify(src))
    else delete props.item.days[k]
  }
  copy.value.open = false
}

const pages = computed(() => fitMenu(mealsOf(props.item, key.value)).pages.length)
const pageNo = ref(0)

const onKey = (e) => e.key === 'Escape' && emit('close')
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="a-modal-back" @mousedown.self="emit('close')">
    <div class="a-modal menu-ed">
      <div class="head">
        <h2>Меню столовой</h2>
        <span class="a-hint">Сохраняется само и сразу видно на экранах</span>
        <button class="a-btn" title="Запомнить этот слайд как заготовку" @click="saveAsTemplate(item)">Сохранить как шаблон</button>
        <button class="a-btn primary" @click="emit('close')">Готово</button>
      </div>

      <div class="cols">
        <div class="form">
          <div class="row2">
            <label>
              <span class="a-label">Заголовок</span>
              <input v-model="item.title" class="a-input" maxlength="40" placeholder="Меню на сегодня" />
            </label>
            <label class="a-check two">
              <input :checked="item.twoWeeks" type="checkbox" @change="setTwoWeeks($event.target.checked)" /> Две недели (чётная / нечётная)
            </label>
          </div>
          <span class="a-hint">После последнего урока экран сам покажет меню на завтра. Неделя считается от 1 сентября.</span>

          <div v-if="item.twoWeeks" class="a-seg weeks">
            <button :class="{ on: week === 1 }" @click="week = 1">1 нед.</button>
            <button :class="{ on: week === 2 }" @click="week = 2">2 нед.</button>
          </div>
          <div class="a-seg days">
            <button v-for="d in 6" :key="d" :class="{ on: dow === d, filled: filled(keyOf(item.twoWeeks ? week : 1, d)) }" @click="dow = d">
              {{ DAY_SHORT[d - 1] }}
            </button>
          </div>

          <div v-for="(m, i) in meals" :key="i" class="meal">
            <div class="mrow">
              <input v-model="m.name" class="a-input" list="menu-meals" maxlength="30" placeholder="Завтрак" />
              <input v-model="m.time" class="a-input time" maxlength="20" placeholder="9:10–9:25" />
              <button class="a-btn small" title="Вставить столбцы из Excel" @click="openPaste(i)">Из Excel</button>
              <button class="a-btn small" title="Убрать приём пищи" @click="removeMeal(i)">✕</button>
            </div>
            <textarea v-model="m.lines" class="a-input lines" maxlength="2000" rows="6" placeholder="Каша рисовая — 200 г — 35 ₽&#10;Чай — 200 мл — 10 ₽"></textarea>
            <div v-if="paste.open && paste.meal === i" class="paste">
              <span class="a-hint">Скопируйте из Excel три столбца (блюдо | выход | цена) и вставьте сюда</span>
              <textarea v-model="paste.text" class="a-input" rows="4" autofocus></textarea>
              <div class="prow">
                <button class="a-btn primary small" :disabled="!paste.text.trim()" @click="applyPaste">Добавить блюда</button>
                <button class="a-btn small" @click="paste.open = false">Отмена</button>
              </div>
            </div>
          </div>
          <datalist id="menu-meals">
            <option v-for="n in MEAL_NAMES" :key="n" :value="n" />
          </datalist>
          <div class="acts">
            <button class="a-btn" :disabled="meals.length >= MAX_MEALS" @click="addMeal">＋ Приём пищи</button>
            <button class="a-btn" :disabled="!meals.length" @click="openCopy">Скопировать день на…</button>
          </div>
          <span class="a-hint">Строка блюда: «Название — выход — цена». Выход и цена не обязательны. До {{ MAX_MEALS }} приёмов в день.</span>

          <div v-if="copy.open" class="copy">
            <span class="a-label">Скопировать этот день на:</span>
            <div class="chips">
              <label v-for="t in copyTargets" :key="t.k" class="a-check"><input v-model="copy.to" type="checkbox" :value="t.k" /> {{ t.label }}</label>
            </div>
            <div class="prow">
              <button class="a-btn primary small" :disabled="!copy.to.length" @click="applyCopy">Скопировать</button>
              <button class="a-btn small" @click="copy.open = false">Отмена</button>
            </div>
          </div>

          <div class="row2">
            <div>
              <span class="a-label">Цвет</span>
              <ThemeSwatches v-model="item.theme" />
            </div>
            <label>
              <span class="a-label">Показывать, сек. на экран</span>
              <input type="number" class="a-input a-num" min="3" max="3600" :value="item.duration" @change="setDuration($event.target.value)" />
            </label>
          </div>
        </div>

        <div class="preview">
          <span class="a-label">
            Так будет на экране — {{ DAY_NAMES[dow] }}
            <template v-if="pages > 1">
              · меню не помещается, оно пойдёт на {{ pages }} экрана(ов)
              <span class="a-seg pg"><button v-for="p in pages" :key="p" :class="{ on: pageNo === p - 1 }" @click="pageNo = p - 1">{{ p }}</button></span>
            </template>
          </span>
          <div class="screen"><MenuSlide :item="item" :active="false" :layout="layoutOf(item)" :day="key" :page="pageNo" /></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.menu-ed {
  width: min(1500px, 96vw);
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
  gap: 12px;
}
.form label {
  display: flex;
  flex-direction: column;
}
.form .a-input {
  width: 100%;
}
.row2 {
  display: flex;
  gap: 14px;
  align-items: flex-end;
}
.row2 > * {
  flex: 1;
}
.row2 .two {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
}
.days button.filled::after {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 5px;
  border-radius: 50%;
  background: #3d7be0;
  vertical-align: middle;
}
.meal {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border-radius: 10px;
  background: #252830;
}
.mrow {
  display: flex;
  gap: 6px;
}
.mrow .a-input {
  flex: 1;
}
.mrow .time {
  flex: 0 0 120px;
}
.lines {
  resize: vertical;
  font-family: inherit;
}
.paste,
.copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.copy {
  padding: 10px;
  border-radius: 10px;
  background: #252830;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
}
.chips .a-check {
  flex-direction: row;
}
.prow,
.acts {
  display: flex;
  gap: 8px;
}
.preview {
  flex: 1;
  min-width: 0;
}
.pg {
  margin-left: 8px;
}
.screen {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  overflow: hidden;
  background: #000;
}
</style>
