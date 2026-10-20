<script setup>
// Календарь показов (кнопка в «Плейлисте»): что и когда пойдёт на экранах в выбранную неделю. Только просмотр.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { playlist, slideTitle, SLIDE_TITLES } from '../playlist.js'
import { DAY_SHORT, dayShows, hasRules } from '../rules.js'

const props = defineProps({ now: Date, locked: Boolean }) // locked — поверх открыто окно настроек слайда
const emit = defineEmits(['close', 'open-slide'])

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const mondayOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() || 7) - 1))

const monday = ref(mondayOf(props.now || new Date()))
const shift = (weeks) => (monday.value = new Date(monday.value.getFullYear(), monday.value.getMonth(), monday.value.getDate() + weeks * 7))
const thisWeek = () => (monday.value = mondayOf(new Date()))

const days = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.value.getFullYear(), monday.value.getMonth(), monday.value.getDate() + i)
    return { d, iso: iso(d), name: DAY_SHORT[i], label: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`, today: iso(d) === iso(new Date()) }
  }),
)
const rangeText = computed(() => `${days.value[0].label}.${days.value[0].d.getFullYear()} – ${days.value[6].label}.${days.value[6].d.getFullYear()}`)

/** Ячейка слайда в день: { kind: '' | 'all' | 'part' | 'event', text } */
function cell(it, day) {
  if (it.type === 'countdown') {
    if (it.date && day.iso > it.date) return { kind: '' }
    const s = dayShows(it.when, day.d)
    if (!s.on) return { kind: '' }
    if (day.iso === it.date) return { kind: 'event', text: 'день события' }
    return fromShows(s)
  }
  return fromShows(dayShows(it.when, day.d))
}
function fromShows(s) {
  if (!s.on) return { kind: '' }
  if (s.all) return { kind: 'all', text: '' }
  return { kind: 'part', text: [s.timeText, s.breaks ? 'на переменах' : ''].filter(Boolean).join(' · ') }
}

const rows = computed(() => playlist.items.map((it) => ({ it, cells: days.value.map((day) => cell(it, day)) })))

// гашение: по дням — периоды этого дня
const blankCells = computed(() =>
  days.value.map((day) => {
    if (!playlist.blank.on) return { kind: '' }
    const parts = []
    for (const p of playlist.blank.periods || []) {
      if (!hasRules(p)) continue
      const s = dayShows(p, day.d)
      if (s.on) parts.push(s.timeText || 'весь день')
    }
    return parts.length ? { kind: 'blank', text: parts.join(', ') } : { kind: '' }
  }),
)
const urgentItem = computed(() => (playlist.urgent.on ? playlist.items.find((x) => x.id === playlist.urgent.id) : null))

const onKey = (e) => e.key === 'Escape' && !props.locked && emit('close')
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="a-modal-back" data-ro-allow @mousedown.self="emit('close')">
    <div class="a-modal cal">
      <div class="head">
        <h2>Календарь показов</h2>
        <div class="nav">
          <button class="a-btn small" data-ro-allow @click="shift(-1)">← Пред. неделя</button>
          <button class="a-btn small" data-ro-allow @click="thisWeek">Эта неделя</button>
          <button class="a-btn small" data-ro-allow @click="shift(1)">След. неделя →</button>
          <b class="range">{{ rangeText }}</b>
        </div>
        <button class="a-btn primary" data-ro-allow @click="emit('close')">Закрыть</button>
      </div>

      <div v-if="urgentItem" class="urgent">⚠ Срочный режим: показывается только «{{ slideTitle(urgentItem) }}» — остальное сейчас не идёт</div>

      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th class="name">Слайд</th>
              <th v-for="day in days" :key="day.iso" :class="{ today: day.today }">{{ day.name }}<small>{{ day.label }}</small></th>
            </tr>
          </thead>
          <tbody>
            <tr class="blank-row">
              <td class="name"><b>Гашение экрана</b><small>{{ playlist.blank.on ? 'экран чёрный' : 'выключено' }}</small></td>
              <td v-for="(c, i) in blankCells" :key="i" :class="{ today: days[i].today }">
                <div v-if="c.kind" class="c blank">{{ c.text }}</div>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td :colspan="8" class="none">В плейлисте нет слайдов</td>
            </tr>
            <tr v-for="r in rows" :key="r.it.id" :class="{ off: !r.it.on }">
              <td class="name">
                <a class="t" href="#" title="Настройки слайда" @click.prevent="emit('open-slide', r.it.id)">{{ slideTitle(r.it) }}</a>
                <small>
                  {{ SLIDE_TITLES[r.it.type] }}<template v-if="!r.it.on"> · выключен</template>
                  <template v-if="r.it.screens?.length"> · только: {{ r.it.screens.join(', ') }}</template>
                </small>
              </td>
              <td v-for="(c, i) in r.cells" :key="i" :class="{ today: days[i].today }">
                <div v-if="c.kind" class="c" :class="c.kind">{{ c.text }}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="a-hint">Только просмотр. Цветом отмечены дни, когда слайд идёт; время — когда именно. Название слайда открывает его настройки.</p>
    </div>
  </div>
</template>

<style scoped>
.cal {
  width: min(1200px, 96vw);
  height: min(760px, 92vh);
}
.head {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.head h2 {
  margin-right: auto;
}
.nav {
  display: flex;
  align-items: center;
  gap: 8px;
}
.range {
  margin-left: 6px;
  color: #c9ccd3;
}
.urgent {
  padding: 10px 14px;
  border-radius: 10px;
  background: #b3261e;
  color: #fff;
  font-weight: 800;
}
/* на узком окне прокручивается таблица, а не страница */
.scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border-radius: 10px;
  background: #22252b;
}
table {
  width: 100%;
  min-width: 860px;
  border-collapse: collapse;
}
th,
td {
  padding: 6px;
  border-bottom: 1px solid #2d3036;
  text-align: center;
  vertical-align: middle;
}
th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #2a2d34;
  color: #c9ccd3;
  font-weight: 800;
}
th small {
  display: block;
  color: #8b909a;
  font-weight: 600;
}
th.today,
td.today {
  box-shadow: inset 0 0 0 9999px rgba(61, 123, 224, 0.12);
}
th.today {
  color: #7fb0ff;
}
.name {
  width: 260px;
  min-width: 220px;
  text-align: left;
  position: sticky;
  left: 0;
  z-index: 2;
  background: #22252b;
}
th.name {
  z-index: 3;
  background: #2a2d34;
}
.name small {
  display: block;
  color: #8b909a;
  font-size: 12px;
  font-weight: 600;
}
.t {
  color: #e6e8ec;
  font-weight: 800;
  text-decoration: none;
}
.t:hover {
  color: #8db4ff;
}
tr.off .name {
  opacity: 0.5;
}
tr.off .c {
  background: #4a505c;
  color: #a4a9b3;
}
.c {
  min-height: 30px;
  display: grid;
  place-items: center;
  padding: 4px 6px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
}
.c.all {
  background: #3d7be0;
}
.c.part {
  background: #2f8f5b;
}
.c.event {
  background: #d9822a;
}
.c.blank {
  background: #6a4aa8;
}
.none {
  padding: 24px;
  color: #a4a9b3;
}
</style>
