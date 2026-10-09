<script setup>
import { reactive, ref } from 'vue'
import { state, GRADES, clearChanges } from '../store.js'
import { parseBells } from '../bells.js'

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

const emit = defineEmits(['close'])

const form = reactive({
  lessonsCount: state.settings.lessonsCount,
  letters: Object.fromEntries(GRADES.map((g) => [g, (state.settings.letters[g] || []).join(' ')])),
  changesCols: state.settings.changesCols,
  bells: state.settings.bells.map((b) => ({ name: b.name, days: [...b.days], text: b.text })),
})
const confirmClear = ref(false)

function toggleDay(b, d) {
  const i = b.days.indexOf(d)
  if (i >= 0) b.days.splice(i, 1)
  else {
    // день может быть только в одной группе звонков
    for (const other of form.bells) {
      const j = other.days.indexOf(d)
      if (j >= 0) other.days.splice(j, 1)
    }
    b.days.push(d)
    b.days.sort()
  }
}

function doClear() {
  if (!confirmClear.value) {
    confirmClear.value = true
    setTimeout(() => (confirmClear.value = false), 4000)
    return
  }
  clearChanges()
  confirmClear.value = false
  message.value = 'Все изменения удалены'
}
const message = ref('')
const fileInput = ref(null)

function parseLetters(str) {
  return str
    .split(/[\s,;]+/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean)
}

function save() {
  state.settings.lessonsCount = Math.min(12, Math.max(1, Number(form.lessonsCount) || 8))
  const letters = {}
  for (const g of GRADES) letters[g] = parseLetters(form.letters[g])
  state.settings.letters = letters
  state.settings.changesCols = Math.min(3, Math.max(2, Number(form.changesCols) || 3))
  state.settings.bells = form.bells.map((b) => ({ name: b.name, days: [...b.days], text: b.text.trim() }))
  emit('close')
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `raspisanie-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function importJson(e) {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    const d = JSON.parse(await file.text())
    if (!d.schedule || !d.settings) throw new Error('нет полей schedule/settings')
    state.schedule = d.schedule
    state.settings = { ...state.settings, ...d.settings }
    message.value = 'Расписание загружено из файла'
    setTimeout(() => emit('close'), 800)
  } catch (err) {
    message.value = 'Не удалось прочитать файл: ' + err.message
  }
  e.target.value = ''
}
</script>

<template>
  <div class="backdrop" @mousedown.self="emit('close')">
    <div class="modal" @mousedown.stop>
      <h2>Настройки</h2>

      <p class="help">
        Порядок показа, время на параллель и вкладку «Изменения» теперь задаёт раздел
        <a href="#playlist" @click="emit('close')">Плейлист</a>.
      </p>

      <div class="row">
        <label for="lc">Уроков в колонке</label>
        <input id="lc" v-model.number="form.lessonsCount" type="number" min="1" max="12" class="num" />
      </div>

      <h3>Вкладка «Изменения»</h3>
      <div class="row">
        <span>Колонок на вкладке</span>
        <div class="seg">
          <button :class="{ on: form.changesCols === 2 }" @click="form.changesCols = 2">2</button>
          <button :class="{ on: form.changesCols === 3 }" @click="form.changesCols = 3">3</button>
        </div>
      </div>
      <div class="row buttons-left">
        <button class="btn danger" @click="doClear">
          {{ confirmClear ? 'Точно удалить? Нажмите ещё раз' : 'Очистить все изменения' }}
        </button>
      </div>

      <h3>Расписание звонков</h3>
      <p class="help">Каждая строка: номер урока и время, например <b>3 10:10-10:50</b>. Подсветка урока и обратный отсчёт берут время отсюда.</p>
      <div class="bells">
        <div v-for="(b, bi) in form.bells" :key="bi" class="bell-group">
          <div class="days">
            <button v-for="(dn, di) in DAY_NAMES" :key="dn" :class="{ on: b.days.includes(di + 1) }" @click="toggleDay(b, di + 1)">
              {{ dn }}
            </button>
          </div>
          <textarea v-model="b.text" rows="10" spellcheck="false"></textarea>
          <div class="count">Распознано уроков: {{ parseBells(b.text).length }}</div>
        </div>
      </div>

      <h3>Буквы классов (через пробел)</h3>
      <div class="letters">
        <label v-for="g in GRADES" :key="g">
          <span>{{ g }} кл.</span>
          <input v-model="form.letters[g]" type="text" placeholder="А Б В Г" />
        </label>
      </div>

      <h3>Резервная копия</h3>
      <div class="row buttons-left">
        <button class="btn ghost" @click="exportJson">Скачать JSON</button>
        <button class="btn ghost" @click="fileInput.click()">Загрузить JSON…</button>
        <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="importJson" />
      </div>
      <p v-if="message" class="msg">{{ message }}</p>

      <div class="actions">
        <button class="btn ghost" @click="emit('close')">Отмена</button>
        <button class="btn primary" @click="save">Сохранить</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  background: rgba(30, 12, 0, 0.45);
  backdrop-filter: blur(4px);
}
.modal {
  width: 860px;
  max-height: 1000px;
  overflow: auto;
  padding: 36px 42px;
  border-radius: 36px;
  background: rgba(30, 22, 18, 0.9);
  border: 1px solid var(--glass-border);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
  font-size: 20px;
}
h2 {
  margin: 0 0 24px;
  font-weight: 900;
  font-size: 38px;
  text-transform: uppercase;
}
h3 {
  margin: 28px 0 12px;
  font-weight: 800;
  font-size: 20px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.85;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin: 14px 0;
  font-weight: 600;
}
input[type='number'],
input[type='text'] {
  padding: 10px 14px;
  border-radius: 14px;
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.12);
  color: var(--text);
  font-size: 20px;
  font-weight: 700;
  outline: none;
}
input:focus {
  border-color: var(--accent);
}
.num {
  width: 100px;
  text-align: center;
}
.letters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 24px;
}
.letters label {
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 700;
}
.letters span {
  width: 70px;
  flex: 0 0 auto;
}
.letters input {
  flex: 1;
  min-width: 0;
}
.seg {
  display: flex;
  gap: 6px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
}
.seg button,
.days button {
  border: none;
  border-radius: 999px;
  padding: 8px 18px;
  background: transparent;
  color: var(--text);
  font-weight: 800;
  font-size: 18px;
  cursor: pointer;
}
.seg button.on,
.days button.on {
  background: var(--accent);
  color: #222;
}
.help a {
  color: var(--accent);
}
.help {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
  opacity: 0.8;
  line-height: 1.4;
}
.bells {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}
.bell-group {
  padding: 14px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
}
.days {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
}
.days button {
  padding: 6px 11px;
  font-size: 15px;
  background: rgba(255, 255, 255, 0.1);
}
textarea {
  width: 100%;
  padding: 10px 14px;
  border-radius: 14px;
  border: 1px solid var(--glass-border);
  background: rgba(0, 0, 0, 0.2);
  color: var(--text);
  font: 700 17px/1.5 Consolas, 'Courier New', monospace;
  outline: none;
  resize: vertical;
  user-select: text;
}
textarea:focus {
  border-color: var(--accent);
}
.count {
  margin-top: 6px;
  font-size: 14px;
  opacity: 0.7;
}
.btn.danger {
  background: rgba(200, 40, 30, 0.55);
  color: #fff;
}
.btn.danger:hover {
  background: rgba(220, 50, 40, 0.8);
}
.buttons-left {
  justify-content: flex-start;
}
.msg {
  color: var(--accent);
  font-weight: 700;
}
.actions {
  margin-top: 32px;
  display: flex;
  justify-content: flex-end;
  gap: 14px;
}
.btn {
  border: none;
  border-radius: 999px;
  padding: 14px 28px;
  font-size: 19px;
  font-weight: 800;
  cursor: pointer;
}
.btn.ghost {
  background: rgba(255, 255, 255, 0.16);
  color: var(--text);
}
.btn.ghost:hover {
  background: rgba(255, 255, 255, 0.28);
}
.btn.primary {
  background: var(--accent);
  color: #222;
}
</style>
