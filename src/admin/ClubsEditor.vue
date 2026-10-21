<script setup>
// Окно правки слайда «Кружки и секции»: режим (сегодня / вся неделя), список кружков (название, руководитель, кабинет,
// для кого, дни и время), «Вставить из Excel» с предпросмотром, цвет и время. Справа живое превью. Правки сразу пишутся в слайд.
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { layoutOf, saveAsTemplate } from '../playlist.js'
import { MAX_CLUBS, parseClubTimes, timesToText, parseClubTable, normRoom, clubsToday } from '../clubs.js'
import { plural } from '../bells.js'
import ClubsSlide from '../display/ClubsSlide.vue'
import ThemeSwatches from './ThemeSwatches.vue'

const props = defineProps({ item: Object }) // слайд type: 'clubs' — правим прямо его
const emit = defineEmits(['close'])

const MODES = { today: 'Сегодня', week: 'Вся неделя' }
const full = computed(() => props.item.clubs.length >= MAX_CLUBS)
const todayCount = computed(() => clubsToday(props.item, new Date()).length)

// ---------- список ----------
const badTimes = reactive({}) // номер кружка → текст ошибки в поле «Дни и время»
const resetBad = () => Object.keys(badTimes).forEach((k) => delete badTimes[k])
function addClub() {
  if (full.value) return
  props.item.clubs.push({ name: 'Новый кружок', teacher: '', room: '', who: '', times: [{ day: 1, from: '15:00', to: '15:45' }] })
}
function remove(i) {
  const c = props.item.clubs[i]
  if (!confirm(`Удалить кружок «${c.name}»?`)) return
  props.item.clubs.splice(i, 1)
  resetBad()
}
function move(i, d) {
  const list = props.item.clubs
  const j = i + d
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  resetBad()
}
function setText(c, key, max, e) {
  const v = e.target.value.replace(/\s+/g, ' ').trim().slice(0, max)
  if (key === 'name' && !v) return (e.target.value = c.name) // название обязательно
  c[key] = v
  e.target.value = v
}
function setRoom(c, e) {
  c.room = normRoom(e.target.value)
  e.target.value = c.room
}
function setTimes(c, i, e) {
  const r = parseClubTimes(e.target.value)
  if (r.error) return (badTimes[i] = r.error)
  delete badTimes[i]
  c.times = r.times
  e.target.value = timesToText(r.times)
}

// ---------- из Excel ----------
const pasteOpen = ref(false)
const text = ref('')
const parsed = computed(() => (text.value.trim() ? parseClubTable(text.value, props.item.clubs) : []))
const good = computed(() => parsed.value.filter((r) => !r.error && !r.dup))
const bad = computed(() => parsed.value.filter((r) => r.error))
const dups = computed(() => parsed.value.filter((r) => r.dup))
const preview = computed(() => [...bad.value, ...dups.value, ...good.value])
const room = computed(() => MAX_CLUBS - props.item.clubs.length)
const done = ref(null) // { count, extra } — для «Отменить»
function addPasted() {
  const rows = good.value.slice(0, Math.max(0, room.value))
  const added = rows.map((r) => ({ name: r.name, teacher: r.teacher, room: r.room, who: r.who, times: r.times }))
  props.item.clubs.push(...added)
  done.value = { added, skipped: good.value.length - rows.length }
  text.value = ''
}
function undoPasted() {
  const set = new Set(done.value.added.map((a) => a.name + '|' + timesToText(a.times)))
  props.item.clubs = props.item.clubs.filter((c) => !set.has(c.name + '|' + timesToText(c.times)))
  done.value = null
  resetBad()
}

function setDuration(v) {
  props.item.duration = Math.min(3600, Math.max(3, Math.round(Number(v)) || props.item.duration))
}

const onKey = (ev) => ev.key === 'Escape' && emit('close')
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="a-modal-back" @mousedown.self="emit('close')">
    <div class="a-modal cl-ed">
      <div class="head">
        <h2>Кружки и секции</h2>
        <span class="a-hint">Сохраняется сам и сразу виден на экранах</span>
        <button class="a-btn" title="Запомнить этот слайд как заготовку" @click="saveAsTemplate(item)">Сохранить как шаблон</button>
        <button class="a-btn primary" @click="emit('close')">Готово</button>
      </div>

      <div class="cols">
        <div class="form">
          <div class="row2">
            <div>
              <span class="a-label">Что показывать</span>
              <span class="a-seg">
                <button v-for="(v, k) in MODES" :key="k" :class="{ on: item.mode === k }" @click="item.mode = k">{{ v }}</button>
              </span>
              <span class="a-hint">
                {{ item.mode === 'week' ? 'Все кружки с днями и временем' : 'Только занятия сегодняшнего дня; когда все закончились — слайд пропускается' }}
              </span>
            </div>
            <label>
              <span class="a-label">Заголовок</span>
              <input v-model="item.title" class="a-input" maxlength="60" placeholder="Кружки и секции" />
            </label>
          </div>

          <div class="list-head">
            <span class="a-label">
              Кружки ({{ item.clubs.length }} из {{ MAX_CLUBS }}<template v-if="item.mode === 'today'">, сегодня занятий: {{ todayCount }}</template>)
            </span>
            <button class="a-btn" :disabled="full" @click="addClub">＋ Кружок</button>
            <button class="a-btn" :class="{ on: pasteOpen }" @click="pasteOpen = !pasteOpen">Вставить из Excel</button>
          </div>

          <div v-if="pasteOpen" class="paste">
            <textarea
              v-model="text"
              class="a-textarea box"
              rows="4"
              placeholder="Выделите в Excel пять столбцов — Название, Руководитель, Кабинет, Для кого, Дни и время — нажмите Ctrl+C и вставьте сюда (Ctrl+V)"
            ></textarea>
            <p class="a-hint">
              Дни и время — например «Пн, Ср 15:00-15:45; Пт 14:00-14:45» (не больше 6 занятий; без конца — 45 минут).
              Строка заголовка пропускается. Повторы не добавляются.
            </p>
            <div v-if="done" class="ok">
              Добавлено: {{ done.added.length }}<template v-if="done.skipped"> (ещё {{ done.skipped }} не поместилось — не больше {{ MAX_CLUBS }})</template>
              <button class="a-link" @click="undoPasted">Отменить</button>
            </div>
            <div v-if="parsed.length" class="table pv">
              <table>
                <tbody>
                  <tr v-for="r in preview" :key="r.line" :class="{ err: r.error, dup: r.dup }">
                    <td class="n">{{ r.line }}</td>
                    <td>{{ r.name }}</td>
                    <td>{{ r.teacher }}</td>
                    <td>{{ r.room }}</td>
                    <td>{{ r.who }}</td>
                    <td>{{ r.times.length ? timesToText(r.times) : '' }}</td>
                    <td class="why">{{ r.error || (r.dup ? 'уже есть — пропускается' : '') }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="parsed.length" class="foot">
              <button class="a-btn primary" :disabled="!good.length || room <= 0" @click="addPasted">
                Добавить {{ Math.min(good.length, Math.max(room, 0)) }} {{ plural(Math.min(good.length, Math.max(room, 0)), 'кружок', 'кружка', 'кружков') }}
              </button>
              <span v-if="bad.length" class="a-hint">С ошибками: {{ bad.length }} — не добавятся, исправьте в Excel и вставьте снова.</span>
              <span v-if="dups.length" class="a-hint">Повторов: {{ dups.length }}.</span>
            </div>
          </div>

          <div class="clubs">
            <div v-for="(c, i) in item.clubs" :key="i" class="club">
              <div class="line">
                <input class="a-input nm" :value="c.name" maxlength="60" placeholder="Название" @change="setText(c, 'name', 60, $event)" />
                <button class="a-btn small" title="Выше" :disabled="i === 0" @click="move(i, -1)">↑</button>
                <button class="a-btn small" title="Ниже" :disabled="i === item.clubs.length - 1" @click="move(i, 1)">↓</button>
                <button class="a-btn small" title="Удалить кружок" @click="remove(i)">✕</button>
              </div>
              <div class="line">
                <input class="a-input" :value="c.teacher" maxlength="60" placeholder="Руководитель" @change="setText(c, 'teacher', 60, $event)" />
                <input class="a-input rm" :value="c.room" maxlength="20" placeholder="Кабинет" @change="setRoom(c, $event)" />
                <input class="a-input wh" :value="c.who" maxlength="40" placeholder="Для кого (5–7 классы)" @change="setText(c, 'who', 40, $event)" />
              </div>
              <input
                class="a-input"
                :class="{ err: badTimes[i] }"
                :value="timesToText(c.times)"
                placeholder="Пн, Ср 15:00-15:45; Пт 14:00-14:45"
                @change="setTimes(c, i, $event)"
              />
              <span v-if="badTimes[i]" class="a-hint warn">{{ badTimes[i] }} — прежнее время сохранено.</span>
            </div>
            <p v-if="!item.clubs.length" class="a-hint">Кружков пока нет — добавьте первый или вставьте таблицу из Excel.</p>
          </div>

          <div class="row2">
            <div>
              <span class="a-label">Цвет</span>
              <ThemeSwatches v-model="item.theme" />
            </div>
            <label>
              <span class="a-label">Секунд на каждом экране</span>
              <input type="number" class="a-input a-num" min="3" max="3600" :value="item.duration" @change="setDuration($event.target.value)" />
              <span class="a-hint">Не поместилось — экраны идут по очереди</span>
            </label>
          </div>
        </div>

        <div class="preview">
          <span class="a-label">Так будет на экране{{ item.mode === 'today' ? ' (по сегодняшнему дню и времени)' : '' }}</span>
          <div class="screen"><ClubsSlide :item="item" preview :layout="layoutOf(item)" /></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cl-ed {
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
  flex: 0 0 640px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.form label {
  display: flex;
  flex-direction: column;
}
.row2 {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.row2 > * {
  flex: 1;
}
.list-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.list-head .a-label {
  margin-right: auto;
}
.a-btn.on {
  background: #3d7be0;
}
.clubs {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.club {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid #353943;
}
.line {
  display: flex;
  gap: 6px;
}
.line .a-input {
  flex: 1;
  min-width: 0;
}
.line .rm {
  flex: 0 0 90px;
}
.line .wh {
  flex: 0 0 190px;
}
.err {
  border-color: #e05a5a;
}
.warn {
  color: #e8a050;
}
.paste {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #353943;
}
.box {
  width: 100%;
  box-sizing: border-box;
  font-family: monospace;
  font-size: 13px;
  white-space: pre;
}
.paste .a-hint {
  margin: 0;
}
.ok {
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(63, 174, 90, 0.18);
  border: 1px solid #3fae5a;
  color: #8fe0a2;
  font-weight: 700;
}
.foot {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.table {
  overflow: auto;
  border: 1px solid #353943;
  border-radius: 8px;
}
.pv {
  max-height: 240px;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-weight: 600;
}
td {
  padding: 4px 8px;
  border: 1px solid #2c3037;
  text-align: left;
}
td.n {
  width: 30px;
  color: #9aa1ad;
}
tr.err td {
  background: rgba(220, 70, 60, 0.16);
  color: #ff9a8f;
}
tr.dup td {
  color: #7d8491;
}
td.why {
  font-weight: 700;
}
.preview {
  flex: 1;
  min-width: 0;
  position: sticky;
  top: 0;
  align-self: flex-start;
}
.screen {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  overflow: hidden;
  background: #000;
}
</style>
