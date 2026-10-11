<script setup>
// Окно «Настройки экрана»: общий шаблон слайдов, гашение по расписанию, бегущая строка. Правки сохраняются сами.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { playlist, LAYOUT_TITLES } from '../playlist.js'
import { DAY_SHORT, isBlanked, tickerTexts } from '../rules.js'

const props = defineProps({ tab: { type: String, default: 'layout' }, now: Date })
const emit = defineEmits(['close'])

const TABS = { layout: 'Шаблон слайдов', blank: 'Гашение экрана', ticker: 'Бегущая строка' }
const tab = ref(props.tab)

// ---------- гашение экрана ----------
const blankNow = computed(() => isBlanked(playlist.blank, props.now))
function addBlank() {
  playlist.blank.periods.push({ timeFrom: '19:00', timeTo: '07:00', days: [] })
  playlist.blank.on = true
}
function toggleBlankDay(p, d) {
  const i = p.days.indexOf(d)
  if (i >= 0) p.days.splice(i, 1)
  else p.days.push(d)
  p.days.sort()
  if (p.days.length === 7) p.days = []
}

// ---------- бегущая строка ----------
const tickerNow = computed(() => tickerTexts(playlist.ticker, props.now).length > 0)
const tickerExpired = (t) => !tickerTexts({ on: true, items: [t] }, props.now).length
function addTicker() {
  playlist.ticker.items.push({ text: '', until: '' })
  playlist.ticker.on = true
}

const onKey = (e) => e.key === 'Escape' && emit('close')
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="a-modal-back" @mousedown.self="emit('close')">
    <div class="a-modal scr-set">
      <div class="head">
        <h2>Настройки экрана</h2>
        <span class="a-hint">Сохраняются сами и сразу видны на экранах</span>
        <button class="a-btn primary" @click="emit('close')">Готово</button>
      </div>

      <div class="tabs">
        <button v-for="(t, k) in TABS" :key="k" :class="{ on: tab === k }" @click="tab = k">
          {{ t }}
          <i v-if="k === 'blank'" class="dot" :class="{ on: playlist.blank.on }"></i>
          <i v-if="k === 'ticker'" class="dot" :class="{ on: playlist.ticker.on }"></i>
        </button>
      </div>

      <!-- шаблон -->
      <div v-if="tab === 'layout'" class="body">
        <div class="lb-opts">
          <button v-for="(t, k) in LAYOUT_TITLES" :key="k" class="lb-opt" :class="{ on: playlist.layout === k }" @click="playlist.layout = k">
            <span class="scheme" :class="k"><i></i><b></b></span>
            {{ t }}
          </button>
        </div>
        <p class="a-hint">
          Для фото, видео, новостей и колод:
          {{ playlist.layout === 'panel' ? 'справа — день, часы, звонок и изменения в расписании' : 'слайд занимает весь экран' }}.
          У отдельного слайда шаблон можно поменять в его настройках (⚙). Табло расписания всегда во весь экран.
        </p>
      </div>

      <!-- гашение -->
      <div v-else-if="tab === 'blank'" class="body">
        <label class="on-row">
          <span class="a-switch"><input v-model="playlist.blank.on" type="checkbox" /><span></span></span>
          Гасить экран по расписанию
        </label>
        <p class="a-hint">
          В указанные часы экран становится чёрным и ничего не проигрывает — например, ночью и в выходные.
          Монитор и компьютер при этом не выключаются.
        </p>
        <template v-if="playlist.blank.on">
          <div v-for="(p, pi) in playlist.blank.periods" :key="pi" class="line">
            с <input v-model="p.timeFrom" type="time" class="a-input" />
            до <input v-model="p.timeTo" type="time" class="a-input" />
            <span class="a-chips">
              <button v-for="(d, di) in DAY_SHORT" :key="d" :class="{ on: p.days.includes(di + 1) }" @click="toggleBlankDay(p, di + 1)">
                {{ d }}
              </button>
            </span>
            <button class="a-link x" title="Убрать период" @click="playlist.blank.periods.splice(pi, 1)">✕</button>
          </div>
          <div><button class="a-link" @click="addBlank">＋ период</button></div>
          <p class="a-hint" :class="{ bad: blankNow }">
            {{ blankNow ? 'Сейчас экран погашен' : 'Сейчас экран работает' }} (по часам этого компьютера).
            Дни не выбраны — каждый день; пустое время — весь день.
          </p>
        </template>
        <div v-else><button class="a-link" @click="addBlank">Настроить</button></div>
      </div>

      <!-- бегущая строка -->
      <div v-else class="body">
        <label class="on-row">
          <span class="a-switch"><input v-model="playlist.ticker.on" type="checkbox" /><span></span></span>
          Показывать бегущую строку
        </label>
        <p class="a-hint">Срочное объявление внизу экрана поверх любых слайдов, например «Сегодня сокращённые уроки».</p>
        <template v-if="playlist.ticker.on">
          <div v-for="(t, ti) in playlist.ticker.items" :key="ti" class="line">
            <input v-model="t.text" class="a-input tk-text" type="text" maxlength="200" placeholder="Текст объявления" />
            до <input v-model="t.until" type="date" class="a-input" />
            <span v-if="t.until" class="tk-state" :class="{ off: tickerExpired(t) }">{{ tickerExpired(t) ? 'уже не показывается' : 'показывается' }}</span>
            <button class="a-link x" title="Убрать объявление" @click="playlist.ticker.items.splice(ti, 1)">✕</button>
          </div>
          <div class="line">
            <button v-if="playlist.ticker.items.length < 10" class="a-link" @click="addTicker">＋ объявление</button>
            <span class="spacer"></span>
            Скорость
            <span class="a-seg">
              <button :class="{ on: playlist.ticker.speed === 'slow' }" @click="playlist.ticker.speed = 'slow'">медленно</button>
              <button :class="{ on: playlist.ticker.speed === 'normal' }" @click="playlist.ticker.speed = 'normal'">обычно</button>
            </span>
          </div>
          <p class="a-hint">
            {{ tickerNow ? 'Сейчас строка на экране' : 'Сейчас строки нет: нет действующих объявлений' }}.
            <template v-if="playlist.ticker.items.some((t) => !t.until)">Объявление без даты висит, пока его не уберут.</template>
          </p>
        </template>
        <div v-else><button class="a-link" @click="addTicker">Настроить</button></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scr-set {
  width: min(760px, 94vw);
  min-height: min(460px, 90vh);
}
.head {
  display: flex;
  align-items: center;
  gap: 14px;
}
.head .a-hint {
  margin-right: auto;
}
.tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 10px;
  background: #15171b;
}
.tabs button {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  border-radius: 8px;
  padding: 8px 10px;
  background: transparent;
  color: #a4a9b3;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
.tabs button:hover {
  color: #fff;
}
.tabs button.on {
  background: #3b404a;
  color: #fff;
}
/* точка «включено» у вкладки */
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4a505c;
}
.dot.on {
  background: #3fae5a;
}
.body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.body p {
  margin: 0;
}
.a-hint.bad {
  color: #c9a7ff;
}
.on-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 800;
  font-size: 15px;
  cursor: pointer;
}
.line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #26292f;
  color: #c9ccd3;
  font-weight: 600;
}
.line .a-input {
  padding: 4px 8px;
  color-scheme: dark;
}
.tk-text {
  flex: 1;
  min-width: 200px;
}
.tk-state {
  color: #7ad08a;
  font-size: 13px;
}
.tk-state.off {
  color: #e0a35a;
}
.x {
  margin-left: auto;
}
.spacer {
  flex: 1;
}
.lb-opts {
  display: flex;
  gap: 12px;
}
.lb-opt {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  border: 2px solid #31353d;
  border-radius: 12px;
  padding: 18px 12px 14px;
  background: #15171b;
  color: #a4a9b3;
  font: inherit;
  font-weight: 800;
  font-size: 15px;
  cursor: pointer;
}
.lb-opt:hover {
  color: #fff;
}
.lb-opt.on {
  border-color: #3d7be0;
  background: #2a3550;
  color: #fff;
}
/* схема шаблона: i — медиа, b — панель */
.scheme {
  display: flex;
  gap: 4px;
  width: 160px;
  height: 90px;
  padding: 5px;
  border-radius: 8px;
  background: #0c0d10;
}
.scheme i {
  flex: 1;
  border-radius: 4px;
  background: #6d8fc9;
}
.scheme b {
  display: none;
  flex: 0 0 36px;
  border-radius: 4px;
  background: #d9c08a;
}
.scheme.panel b {
  display: block;
}
</style>
