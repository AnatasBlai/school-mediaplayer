<script setup>
// Окно настроек одного слайда плейлиста (кнопка ⚙ в строке): время показа, вид, шаблон, «Когда». Правки сохраняются сами.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { visibleScreens } from './screens.js'
import { GRADES, isBreak } from '../store.js'
import { playlist, mediaById, slideTitle, SLIDE_TITLES, LAYOUT_TITLES, hasLayout } from '../playlist.js'
import { decks, deckById, avgCardSeconds } from '../decks.js'
import { DAY_SHORT, EMPTY_WHEN, hasRules, ruleState } from '../rules.js'
import { thumbUrl, fmtDuration } from './mediaApi.js'

const props = defineProps({ item: Object, now: Date }) // слайд из playlist.items — правим прямо его
const emit = defineEmits(['close', 'copy', 'remove', 'edit']) // edit — открыть окно новости / победителей / отсчёта

const it = computed(() => props.item)
const EDIT_TEXT = {
  news: 'Изменить новость: текст, фото, цвет',
  winners: 'Изменить победителей: места, призёры, фото, цвет',
  countdown: 'Изменить отсчёт: событие, дата, цвет',
  menu: 'Изменить меню: дни недели, блюда, цвет',
  today: 'Изменить слайд: группы дат, свои даты, цвет',
  birthdays: 'Изменить слайд: заголовок, вид имён, цвет; список именинников',
}
const file = computed(() => (it.value.media ? mediaById(it.value.media) : null))

function setDuration(v) {
  it.value.duration = Math.min(3600, Math.max(3, Math.round(Number(v)) || it.value.duration))
}

// параллели расписания: пустой список = все
const gradeOn = (g) => !it.value.grades?.length || it.value.grades.includes(g)
function toggleGrade(g) {
  const cur = it.value.grades?.length ? [...it.value.grades] : [...GRADES]
  const i = cur.indexOf(g)
  if (i >= 0) cur.splice(i, 1)
  else cur.push(g)
  const sorted = GRADES.filter((x) => cur.includes(x))
  if (!sorted.length) return // хотя бы одна параллель
  it.value.grades = sorted.length === GRADES.length ? [] : sorted
}

// шаблон: '' — как общий (поля layout нет), 'full' / 'panel' — свой
function setLayout(v) {
  if (v) it.value.layout = v
  else delete it.value.layout
}

// ---------- правила показа ----------
const when = computed(() => ({ ...EMPTY_WHEN, ...(it.value.when || {}) }))
function setWhen(k, v) {
  const w = { ...when.value, [k]: v }
  if (w.days.length === 7) w.days = []
  if (hasRules(w)) it.value.when = w
  else delete it.value.when
}
function toggleDay(d) {
  const days = when.value.days.slice()
  const i = days.indexOf(d)
  if (i >= 0) days.splice(i, 1)
  else days.push(d)
  setWhen('days', days.sort())
}
function clearWhen() {
  delete it.value.when
}
const rule = computed(() => ruleState(it.value.when, props.now, isBreak))

// ---------- где показывать ----------
// список имён: экраны из «Сейчас на экране» (и без связи) + имена из других слайдов + выбранные здесь
const chosen = computed(() => it.value.screens || [])
const onlySome = computed(() => chosen.value.length > 0 || pickMode.value)
const pickMode = ref(false) // «Только на выбранных» включено, но имя ещё не выбрано
const newName = ref('')
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()
const knownNames = computed(() => {
  const out = []
  const add = (n) => {
    n = String(n || '').trim()
    if (n && !out.some((x) => sameName(x, n))) out.push(n)
  }
  visibleScreens.value.forEach((s) => add(s.name))
  playlist.items.forEach((x) => (x.screens || []).forEach(add))
  chosen.value.forEach(add)
  return out
})
const screenOn = (n) => chosen.value.some((x) => sameName(x, n))
function toggleScreen(n) {
  const cur = [...chosen.value]
  const i = cur.findIndex((x) => sameName(x, n))
  if (i >= 0) cur.splice(i, 1)
  else if (cur.length < 10) cur.push(n)
  if (cur.length) it.value.screens = cur
  else delete it.value.screens
}
function addName() {
  const n = newName.value.trim().slice(0, 40)
  newName.value = ''
  if (n && !screenOn(n)) toggleScreen(n)
}
function setAllScreens() {
  pickMode.value = false
  delete it.value.screens
}

const onKey = (e) => e.key === 'Escape' && emit('close')
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="a-modal-back" @mousedown.self="emit('close')">
    <div class="a-modal sl-set">
      <div class="head">
        <div class="thumb" :class="it.type">
          <img v-if="file && thumbUrl(file)" :src="thumbUrl(file)" alt="" />
          <span v-else-if="it.type === 'schedule'">5–11</span>
          <span v-else-if="it.type === 'changes'">Изм.</span>
          <span v-else-if="it.type === 'news'">Нов.</span>
          <span v-else-if="it.type === 'winners'">🏆</span>
          <span v-else-if="it.type === 'countdown'">⏳</span>
          <span v-else-if="it.type === 'menu'">🍽</span>
          <span v-else-if="it.type === 'birthdays'">🎂</span>
          <span v-else-if="it.type === 'today'">📅</span>
          <span v-else-if="it.type === 'deck'">?!</span>
        </div>
        <div class="ttl">
          <h2>{{ slideTitle(it) }}</h2>
          <span class="kind">{{ SLIDE_TITLES[it.type] }}</span>
        </div>
        <button class="a-btn primary" @click="emit('close')">Готово</button>
      </div>

      <div class="body">
        <!-- новость, победители и отсчёт правятся в своём окне -->
        <div v-if="EDIT_TEXT[it.type]" class="sec">
          <button class="a-btn edit" @click="emit('edit')">✎ {{ EDIT_TEXT[it.type] }}</button>
        </div>

        <div class="sec">
          <span class="a-label">Время показа</span>
          <div v-if="it.type === 'video'" class="val">
            до конца видео <span class="a-hint">({{ fmtDuration(file?.duration) }})</span>
          </div>
          <div v-else-if="it.type === 'deck'" class="val">
            одна карточка ≈ {{ avgCardSeconds(deckById(it.deck)) }} с
            <span class="a-hint">— задаётся в колоде</span>
          </div>
          <div v-else class="val">
            <input type="number" class="a-input a-num" min="3" max="3600" :value="it.duration" @change="setDuration($event.target.value)" @keydown.enter="$event.target.blur()" />
            {{ it.type === 'schedule' ? 'сек. на каждую параллель' : it.type === 'winners' ? 'сек. на каждый экран класса' : it.type === 'menu' ? 'сек. на каждый экран меню' : it.type === 'birthdays' ? 'сек. на каждый экран имён' : 'сек.' }}
          </div>
        </div>

        <div v-if="it.type === 'schedule'" class="sec">
          <span class="a-label">Параллели</span>
          <div class="val">
            <span class="a-chips">
              <button v-for="g in GRADES" :key="g" :class="{ on: gradeOn(g)}" @click="toggleGrade(g)">{{ g }}</button>
            </span>
            <span class="a-hint">все отмечены — показываются все</span>
          </div>
        </div>

        <div v-if="it.type === 'changes'" class="sec">
          <label class="a-check"><input v-model="it.skipEmpty" type="checkbox" /> пропускать, если изменений нет</label>
        </div>

        <div v-if="it.type === 'deck'" class="sec">
          <span class="a-label">Колода</span>
          <div class="val">
            <select v-model="it.deck" class="a-select">
              <option v-if="!deckById(it.deck)" :value="it.deck">— колода удалена —</option>
              <option v-for="d in decks.list" :key="d.id" :value="d.id">{{ d.name }} ({{ d.cards.length }})</option>
            </select>
            <span class="a-seg">
              <button :class="{ on: it.mode !== 'daily' }" title="Каждый показ — следующая карточка" @click="it.mode = 'next'">По очереди</button>
              <button :class="{ on: it.mode === 'daily' }" title="Весь день одна карточка, завтра — следующая" @click="it.mode = 'daily'">Одна в день</button>
            </span>
            <a class="a-link" href="#decks" @click="emit('close')">карточки →</a>
          </div>
        </div>

        <div v-if="it.type === 'image' || it.type === 'video'" class="sec">
          <span class="a-label">Как вписать</span>
          <div class="val">
            <span class="a-seg">
              <button :class="{ on: it.fit !== 'contain' }" @click="it.fit = 'cover'">Заполнить</button>
              <button :class="{ on: it.fit === 'contain' }" @click="it.fit = 'contain'">Целиком</button>
            </span>
            <span class="a-hint">{{ it.fit === 'contain' ? 'видно целиком, по краям — размытый фон' : 'на всё место, края могут обрезаться' }}</span>
            <label v-if="it.type === 'video'" class="a-check sound"><input v-model="it.sound" type="checkbox" /> со звуком</label>
          </div>
        </div>

        <div v-if="hasLayout(it)" class="sec">
          <span class="a-label">Шаблон</span>
          <div class="val">
            <span class="a-seg">
              <button :class="{ on: !it.layout }" @click="setLayout('')">Как у всех ({{ LAYOUT_TITLES[playlist.layout].toLowerCase() }})</button>
              <button v-for="(t, k) in LAYOUT_TITLES" :key="k" :class="{ on: it.layout === k }" @click="setLayout(k)">{{ t }}</button>
            </span>
          </div>
        </div>

        <div class="sec">
          <span class="a-label">Где показывать</span>
          <div class="val">
            <span class="a-seg">
              <button :class="{ on: !onlySome }" @click="setAllScreens">На всех экранах</button>
              <button :class="{ on: onlySome }" @click="pickMode = true">Только на выбранных</button>
            </span>
          </div>
          <div v-if="onlySome" class="val scr-pick">
            <span v-if="knownNames.length" class="a-chips">
              <button v-for="n in knownNames" :key="n" :class="{ on: screenOn(n) }" @click="toggleScreen(n)">{{ n }}</button>
            </span>
            <span class="add">
              <input v-model="newName" class="a-input" maxlength="40" placeholder="Имя экрана" @keydown.enter="addName" />
              <button class="a-btn" :disabled="!newName.trim()" @click="addName">Добавить</button>
            </span>
            <span class="a-hint">имя — из адреса экрана (?name=…); экран без имени показывает только слайды «на всех экранах»</span>
          </div>
        </div>

        <div class="sec rules">
          <span class="a-label">Когда показывать</span>
          <div class="rule">
            <span class="rl">Даты</span>
            с <input type="date" class="a-input" :value="when.dateFrom" @change="setWhen('dateFrom', $event.target.value)" />
            по <input type="date" class="a-input" :value="when.dateTo" @change="setWhen('dateTo', $event.target.value)" />
            <span class="a-hint">включительно; пусто — без ограничения</span>
          </div>
          <div class="rule">
            <span class="rl">Время</span>
            с <input type="time" class="a-input" :value="when.timeFrom" @change="setWhen('timeFrom', $event.target.value)" />
            до <input type="time" class="a-input" :value="when.timeTo" @change="setWhen('timeTo', $event.target.value)" />
            <span class="a-hint">например, 7:30–8:30; 22:00–6:00 — через полночь</span>
          </div>
          <div class="rule">
            <span class="rl">Дни</span>
            <span class="a-chips">
              <button v-for="(d, di) in DAY_SHORT" :key="d" :class="{ on: when.days.includes(di + 1) }" @click="toggleDay(di + 1)">{{ d }}</button>
            </span>
            <button class="a-link" @click="setWhen('days', [1, 2, 3, 4, 5])">Пн–Пт</button>
            <span class="a-hint">ни один не выбран — каждый день</span>
          </div>
          <div class="rule">
            <span class="rl">Звонки</span>
            <label class="brk">
              <span class="a-switch"><input type="checkbox" :checked="when.breaks" @change="setWhen('breaks', $event.target.checked)" /><span></span></span>
              только во время перемены
            </label>
            <span class="a-hint">по звонкам из расписания и часам компьютера с экраном</span>
          </div>
          <div class="rule">
            <span class="rl"></span>
            <button class="a-link" :disabled="!hasRules(it.when)" @click="clearWhen">Сбросить — показывать всегда</button>
            <span v-if="hasRules(it.when)" class="a-hint" :class="rule.ok ? 'ok' : 'bad'">
              {{ rule.ok ? 'Сейчас подходит — слайд в показе' : 'Сейчас не идёт: ' + rule.reason }}
            </span>
          </div>
        </div>
      </div>

      <div class="foot">
        <button class="a-btn" @click="emit('copy')">⧉ Копировать слайд</button>
        <button class="a-btn danger" title="Файл останется в медиатеке" @click="emit('remove')">✕ Убрать из плейлиста</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sl-set {
  width: min(760px, 94vw);
}
.head {
  display: flex;
  align-items: center;
  gap: 14px;
}
.ttl {
  flex: 1;
  min-width: 0;
}
.ttl h2 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kind {
  color: #7c818b;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.thumb {
  flex: 0 0 auto;
  width: 96px;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: #000;
  color: #fff;
  font-weight: 900;
  font-size: 15px;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumb.schedule {
  background: linear-gradient(135deg, #f0a32a, #c45a10);
}
.thumb.changes {
  background: linear-gradient(135deg, #6b4a2b, #3f7a3a);
}
.thumb.news {
  background: linear-gradient(135deg, #2c74c0, #0c2c68);
}
.thumb.winners {
  background: linear-gradient(135deg, #e0b030, #7a4a0c);
}
.thumb.today {
  background: linear-gradient(135deg, #e0a030, #8a3a0c);
  font-size: 22px;
}
.thumb.birthdays {
  background: linear-gradient(135deg, #e04a8a, #6a0c3a);
  font-size: 22px;
}
.thumb.menu {
  background: linear-gradient(135deg, #3c9a4a, #0c4a2a);
  font-size: 22px;
}
.thumb.countdown {
  background: linear-gradient(135deg, #e0752a, #7a1f0c);
}
.thumb.deck {
  background: linear-gradient(135deg, #7a2fd0, #12052e);
}
.body {
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sec {
  padding: 12px 14px;
  border-radius: 10px;
  background: #26292f;
}
.val {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  color: #e6e8ec;
  font-weight: 700;
}
.edit {
  width: 100%;
  background: #2a3550;
  border: 1px solid #3d7be0;
}
.edit:hover {
  background: #33416a !important;
}
.sound {
  margin-left: auto;
}
.scr-pick {
  margin-top: 8px;
}
.add {
  display: flex;
  gap: 6px;
}
.add .a-input {
  padding: 5px 8px;
  width: 160px;
}
.rules {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rule {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: #c9ccd3;
  font-weight: 600;
}
.rule .a-input {
  padding: 5px 8px;
  color-scheme: dark;
}
.brk {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.rl {
  width: 56px;
  color: #7c818b;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}
.rule .a-hint {
  font-size: 12px;
}
.a-hint.ok {
  color: #7fd18b;
}
.a-hint.bad {
  color: #f0b45a;
}
.foot {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
