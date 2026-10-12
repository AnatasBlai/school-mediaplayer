<script setup>
// Окно «Вставить из Excel»: таблица одного дня → расписание классов. Остальные классы и дни не меняются.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { state, GRADES } from '../store.js'
import { parseScheduleTable } from '../scheduleImport.js'

const emit = defineEmits(['close'])

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const DAY_NAMES = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу']
const day = ref(new Date().getDay() >= 1 && new Date().getDay() <= 6 ? new Date().getDay() : 1)
const text = ref('')
const done = ref(null) // { count, backup: [{ grade, letter, prev }], day } — для кнопки «Отменить»

const parsed = computed(() => parseScheduleTable(text.value, state.settings.letters, state.settings.lessonsCount))
const rowsCount = computed(() => Math.max(0, ...parsed.value.classes.map((c) => c.lessons.length)))
const badGrade = (c) => !GRADES.includes(c.grade)
const unknown = computed(() => parsed.value.classes.filter((c) => !c.known))
const canApply = computed(() => parsed.value.classes.length > 0 && !unknown.value.length && !parsed.value.overflow)

function addLetter(c) {
  const arr = (state.settings.letters[c.grade] ||= [])
  if (!arr.includes(c.letter)) arr.push(c.letter)
  arr.sort((a, b) => a.localeCompare(b, 'ru'))
}
const addAllLetters = () => unknown.value.filter((c) => !badGrade(c)).forEach(addLetter)

function apply() {
  if (!canApply.value) return
  const d = day.value
  const backup = []
  for (const c of parsed.value.classes) {
    const cur = state.schedule?.[c.grade]?.[d]?.[c.letter]
    backup.push({ grade: c.grade, letter: c.letter, prev: cur ? JSON.parse(JSON.stringify(cur)) : null })
    state.schedule[c.grade] ??= {}
    state.schedule[c.grade][d] ??= {}
    state.schedule[c.grade][d][c.letter] = c.lessons.map((l) => ({ ...l }))
  }
  done.value = { count: backup.length, backup, day: d }
  text.value = ''
}

function undo() {
  const { backup, day: d } = done.value
  for (const b of backup) {
    if (b.prev) state.schedule[b.grade][d][b.letter] = b.prev
    else delete state.schedule[b.grade]?.[d]?.[b.letter]
  }
  done.value = null
}

const onKey = (e) => e.key === 'Escape' && emit('close')
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="a-modal-back" @mousedown.self="emit('close')">
    <div class="a-modal imp">
      <div class="head">
        <h2>Вставить расписание из Excel</h2>
        <button class="a-btn primary" @click="emit('close')">Закрыть</button>
      </div>

      <div class="row">
        <span class="a-label nolabel">День недели</span>
        <div class="a-chips">
          <button v-for="(n, i) in DAYS" :key="n" :class="{ on: day === i + 1 }" @click="day = i + 1">{{ n }}</button>
        </div>
      </div>

      <div>
        <label class="a-label">Вставьте таблицу из Excel</label>
        <textarea v-model="text" class="a-textarea box" rows="6" placeholder="Выделите таблицу в Excel, нажмите Ctrl+C и вставьте сюда (Ctrl+V)"></textarea>
        <p class="a-hint">
          Первая строка — классы: <b>5А 5Б 6А</b>… Дальше по строке на урок (1-й, 2-й…). Столбец с номерами уроков можно не
          копировать. Кабинет пишите в конце: «Математика 14», «Английский 28/34», «Физкультура с/з». Пустая ячейка — урока нет.
        </p>
      </div>

      <div v-if="done" class="ok">
        Готово: расписание на {{ DAY_NAMES[done.day - 1] }} заменено для {{ done.count }} кл.
        <button class="a-link" @click="undo">Отменить</button>
      </div>

      <template v-if="text.trim()">
        <div v-for="p in parsed.problems" :key="p" class="a-warn">{{ p }}</div>
        <div v-if="parsed.overflow" class="bad">Уроков больше, чем строк в таблице расписания ({{ state.settings.lessonsCount }}). Увеличьте число уроков в настройках ⚙ или уберите лишние строки.</div>
        <div v-if="unknown.length" class="bad">
          Таких классов нет в настройках:
          <b v-for="c in unknown" :key="c.grade + c.letter" class="chip">
            {{ c.grade }}{{ c.letter }}
            <button v-if="!badGrade(c)" class="a-link" @click="addLetter(c)">Добавить букву</button>
            <span v-else>(параллели {{ c.grade }} нет)</span>
          </b>
          <button v-if="unknown.length > 1 && unknown.some((c) => !badGrade(c))" class="a-btn small" @click="addAllLetters">Добавить все</button>
        </div>

        <div v-if="parsed.classes.length" class="preview">
          <table>
            <thead>
              <tr>
                <th>№</th>
                <th v-for="c in parsed.classes" :key="c.grade + c.letter" :class="{ err: !c.known }">{{ c.grade }}{{ c.letter }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="i in Math.max(rowsCount, 1)" :key="i" :class="{ over: i > state.settings.lessonsCount }">
                <td class="n">{{ i }}</td>
                <td v-for="c in parsed.classes" :key="c.grade + c.letter">
                  <template v-if="c.lessons[i - 1]">
                    {{ c.lessons[i - 1].s }}<em v-if="c.lessons[i - 1].r"> {{ c.lessons[i - 1].r }}</em>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <div class="foot">
        <button class="a-btn primary" :disabled="!canApply" @click="apply">
          Заменить расписание на {{ DAY_NAMES[day - 1] }} для {{ parsed.classes.length }} кл.
        </button>
        <span class="a-hint">Остальные классы и дни не меняются.</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.imp {
  width: 960px;
  overflow-y: auto;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.nolabel {
  margin: 0;
}
.box {
  width: 100%;
  box-sizing: border-box;
  font-family: monospace;
  font-size: 13px;
  white-space: pre;
}
.a-hint {
  margin: 6px 0 0;
}
.ok {
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(63, 174, 90, 0.18);
  border: 1px solid #3fae5a;
  color: #8fe0a2;
  font-weight: 700;
}
.bad {
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(220, 70, 60, 0.18);
  border: 1px solid #dc463c;
  color: #ff9a8f;
  font-weight: 700;
}
.chip {
  display: inline-flex;
  gap: 8px;
  margin: 0 10px 0 6px;
}
.preview {
  overflow: auto;
  max-height: 300px;
  border: 1px solid #353943;
  border-radius: 8px;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-weight: 600;
}
th,
td {
  padding: 4px 8px;
  border: 1px solid #2c3037;
  text-align: left;
  vertical-align: top;
}
th {
  position: sticky;
  top: 0;
  background: #26292f;
}
th.err {
  background: #b3261e;
}
td.n {
  width: 28px;
  color: #8b909a;
}
tr.over td {
  background: rgba(220, 70, 60, 0.18);
}
em {
  margin-left: 6px;
  color: #7fb0ff;
  font-style: normal;
}
.foot {
  display: flex;
  align-items: center;
  gap: 14px;
}
.foot .a-hint {
  margin: 0;
}
</style>
