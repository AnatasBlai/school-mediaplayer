<script setup>
import { computed, ref, watch } from 'vue'
import BellWidget from './BellWidget.vue'
import { vFit } from '../fit.js'

const props = defineProps({
  today: Date, // текущая дата (обновляется каждую секунду)
  viewDate: Date, // день, расписание которого показано
  bell: Object, // состояние звонков на сегодня
  interactive: { type: Boolean, default: true }, // false на экране для зрителей: календарь только показывает
})
const emit = defineEmits(['pick', 'today', 'settings'])

const DAYS_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

// месяц, который сейчас показан в календаре
const month = ref(new Date(props.viewDate.getFullYear(), props.viewDate.getMonth(), 1))
watch(
  () => props.viewDate,
  (d) => (month.value = new Date(d.getFullYear(), d.getMonth(), 1)),
)

const dayName = computed(() => DAYS_FULL[props.viewDate.getDay()])
const dateText = computed(() => {
  const d = props.viewDate
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`
})
const clock = computed(() => props.today.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }))
const isToday = computed(() => sameDay(props.today, props.viewDate))

function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

const weeks = computed(() => {
  const first = month.value
  const start = mondayOf(first)
  const curWeek = mondayOf(props.today).getTime()
  const rows = []
  const cur = new Date(start)
  for (let w = 0; w < 6; w++) {
    const row = { current: cur.getTime() === curWeek, days: [] }
    for (let i = 0; i < 7; i++) {
      const d = new Date(cur)
      row.days.push({
        date: d,
        num: d.getDate(),
        other: d.getMonth() !== first.getMonth(),
        today: sameDay(d, props.today),
        picked: sameDay(d, props.viewDate),
        weekend: i === 6,
      })
      cur.setDate(cur.getDate() + 1)
    }
    rows.push(row)
    if (cur.getMonth() !== first.getMonth() && w >= 4) break
  }
  return rows
})

function shift(n) {
  const m = month.value
  month.value = new Date(m.getFullYear(), m.getMonth() + n, 1)
}
</script>

<template>
  <aside class="panel" :class="{ static: !interactive }">
    <div v-fit="30" class="day-name">{{ dayName }}</div>
    <div class="date-line">
      <span>{{ dateText }}</span>
      <span class="clock">{{ clock }}</span>
    </div>

    <BellWidget :status="bell" />

    <div class="cal">
      <div class="cal-head">
        <button class="nav" @click="shift(-1)">‹</button>
        <div class="month">{{ MONTHS[month.getMonth()] }} {{ month.getFullYear() }}</div>
        <button class="nav" @click="shift(1)">›</button>
      </div>

      <div class="grid wk">
        <div v-for="(w, i) in WEEK" :key="w" class="wkday" :class="{ weekend: i === 6 }">{{ w }}</div>
      </div>

      <div class="rows">
      <div v-for="(row, r) in weeks" :key="r" class="grid row" :class="{ current: row.current }">
        <button
          v-for="d in row.days"
          :key="d.date.getTime()"
          class="day"
          :class="{ other: d.other, today: d.today, picked: d.picked && !d.today, weekend: d.weekend }"
          @click="emit('pick', d.date)"
        >
          {{ d.num }}
        </button>
      </div>
      </div>
    </div>

    <div class="bottom">
      <button v-if="!isToday" class="btn" @click="emit('today')">← Сегодня</button>
      <span v-else class="hint">Нажмите на день, чтобы открыть его расписание</span>
      <button class="btn icon" title="Настройки" @click="emit('settings')">⚙</button>
    </div>
  </aside>
</template>

<style scoped>
.panel {
  flex: 0 0 380px;
  display: flex;
  flex-direction: column;
  padding: 28px 24px 22px;
  border-radius: 40px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1));
  border: 1px solid var(--glass-border);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    0 10px 30px rgba(0, 0, 0, 0.16);
  backdrop-filter: blur(6px);
  text-shadow: var(--shadow-text);
}

.day-name {
  font-weight: 900;
  font-size: 46px;
  line-height: 1.05;
  white-space: nowrap;
  text-transform: uppercase;
  letter-spacing: 0.01em;
}
.date-line {
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-weight: 800;
  font-size: 23px;
}
.clock {
  font-size: 30px;
  color: var(--accent);
}

.cal {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
  margin-top: 18px;
  padding: 20px 14px 16px;
  border-radius: 32px;
  background: rgba(255, 255, 255, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
.cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.month {
  font-weight: 800;
  font-size: 24px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.nav {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  color: var(--text);
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
}
.nav:hover {
  background: rgba(255, 255, 255, 0.3);
}

.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.wkday {
  text-align: center;
  font-weight: 800;
  font-size: 16px;
  opacity: 0.75;
  padding-bottom: 8px;
  text-transform: uppercase;
}
.rows {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
}
.row {
  border-radius: 999px;
  padding: 3px 4px;
}
.row.current {
  background: rgba(255, 255, 255, 0.24);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
}
.weekend {
  color: #ffc3a0;
}

.day {
  height: 40px;
  border: none;
  border-radius: 22px;
  background: transparent;
  color: var(--text);
  font-weight: 800;
  font-size: 20px;
  text-shadow: var(--shadow-text);
  cursor: pointer;
  transition: background 0.12s;
}
.day.weekend {
  color: #ffc3a0;
}
.day:hover {
  background: rgba(255, 255, 255, 0.18);
}
.day.other {
  opacity: 0.38;
}
.day.today {
  background: var(--text);
  color: var(--tab-text);
  text-shadow: none;
  box-shadow: 0 4px 14px rgba(70, 30, 0, 0.35);
}
.day.picked {
  box-shadow: inset 0 0 0 3px var(--accent);
}

/* экран для зрителей: кнопки не нужны, место оставляем, чтобы раскладка не съехала */
.panel.static .nav,
.panel.static .bottom {
  visibility: hidden;
}
.panel.static .day {
  pointer-events: none;
}
.bottom {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.hint {
  font-size: 14px;
  font-weight: 600;
  opacity: 0.7;
  line-height: 1.3;
}
.btn {
  border: none;
  border-radius: 999px;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.2);
  color: var(--text);
  font-weight: 800;
  font-size: 17px;
  cursor: pointer;
  text-shadow: var(--shadow-text);
}
.btn:hover {
  background: rgba(255, 255, 255, 0.32);
}
.btn.icon {
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  padding: 0;
  font-size: 24px;
}
</style>
