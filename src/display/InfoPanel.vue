<script setup>
// Панель справа для шаблона «С панелью»: день недели, дата, часы, звонок и изменения в расписании.
// Рисуется на холсте 440×1080 и масштабируется по высоте своего блока (как табло 1920×1080).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { state, maxLessonOfDay } from '../store.js'
import { bellsForDay, bellStatus, plural } from '../bells.js'
import BellWidget from '../components/BellWidget.vue'

const W = 440
const H = 1080
const MAX_ROWS = 7 // больше строк изменений в панель не влезает — остальное на табло «Изменения»

const root = ref(null)
const scale = ref(1)
function fit() {
  if (root.value) scale.value = root.value.clientHeight / H
}

const now = ref(new Date())

const DAYS_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const dayName = computed(() => DAYS_FULL[now.value.getDay()])
const dateText = computed(() => `${now.value.getDate()} ${MONTHS_GEN[now.value.getMonth()]} ${now.value.getFullYear()}`)
const clock = computed(() => now.value.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }))

const bell = computed(() => {
  const dow = now.value.getDay()
  if (dow === 0) return { kind: 'none' }
  return bellStatus(bellsForDay(state.settings.bells, dow), now.value, maxLessonOfDay(dow))
})

// изменения из всех колонок табло подряд, без пустых строк
const changes = computed(() => {
  const rows = []
  for (let i = 0; i < state.settings.changesCols; i++) {
    for (const x of state.changes?.['ch' + i] || []) if (x && (x.c || x.t || x.r)) rows.push(x)
  }
  return rows
})
const shown = computed(() => (changes.value.length > MAX_ROWS ? changes.value.slice(0, MAX_ROWS - 1) : changes.value))
const more = computed(() => changes.value.length - shown.value.length)

let timer, obs
onMounted(() => {
  fit()
  obs = new ResizeObserver(fit)
  obs.observe(root.value)
  timer = setInterval(() => (now.value = new Date()), 1000)
})
onBeforeUnmount(() => {
  obs?.disconnect()
  clearInterval(timer)
})
</script>

<template>
  <aside ref="root" class="info-panel">
    <div class="canvas" :style="{ width: W + 'px', height: H + 'px', transform: `scale(${scale})` }">
      <div class="card">
        <div class="day-name">{{ dayName }}</div>
        <div class="date">{{ dateText }}</div>
        <div class="clock">{{ clock }}</div>

        <BellWidget :status="bell" />

        <div v-if="changes.length" class="changes">
          <div class="ch-head">
            <span>Изменения</span>
            <span class="ch-count">{{ changes.length }} {{ plural(changes.length, 'строка', 'строки', 'строк') }}</span>
          </div>
          <div v-for="(x, i) in shown" :key="i" class="ch-row">
            <span v-if="x.c" class="ch-cls">{{ x.c }}</span>
            <span class="ch-text">{{ x.t }}</span>
            <span v-if="x.r" class="ch-room">{{ x.r }}</span>
          </div>
          <div v-if="more" class="ch-more">и ещё {{ more }} — на табло «Изменения»</div>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.info-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: calc(100vh * 440 / 1080);
  overflow: hidden;
  --accent: #ffd27a;
  --shadow-text: 0 2px 6px rgba(0, 0, 0, 0.55);
  --tab-text: #5a3208;
}
.canvas {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
}
.card {
  position: absolute;
  inset: 30px;
  display: flex;
  flex-direction: column;
  padding: 30px 24px 26px;
  border-radius: 40px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1));
  border: 1px solid var(--glass-border);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    0 10px 30px rgba(0, 0, 0, 0.25);
  justify-content: center;
  color: var(--text);
  text-shadow: var(--shadow-text);
}

.day-name {
  font-weight: 900;
  font-size: 46px;
  line-height: 1.05;
  text-transform: uppercase;
}
.date {
  margin-top: 8px;
  font-weight: 800;
  font-size: 24px;
}
.clock {
  margin-top: 6px;
  font-weight: 900;
  font-size: 112px;
  line-height: 1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
}

.changes {
  flex: 0 1 auto;
  min-height: 0;
  margin-top: 22px;
  padding: 18px 16px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
  overflow: hidden;
}
.ch-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
  font-weight: 900;
  font-size: 24px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.ch-count {
  font-weight: 700;
  font-size: 15px;
  text-transform: none;
  opacity: 0.8;
}
.ch-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.16);
}
.ch-cls {
  flex: 0 0 auto;
  min-width: 52px;
  padding: 3px 8px;
  border-radius: 12px;
  background: var(--text);
  color: var(--tab-text);
  text-shadow: none;
  text-align: center;
  font-weight: 900;
  font-size: 19px;
}
.ch-text {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  font-size: 18px;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.ch-room {
  flex: 0 0 auto;
  font-weight: 800;
  font-size: 17px;
  color: var(--accent);
}
.ch-more {
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.16);
  font-weight: 700;
  font-size: 15px;
  opacity: 0.85;
}
</style>
