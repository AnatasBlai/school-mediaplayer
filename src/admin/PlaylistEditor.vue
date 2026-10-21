<script setup>
// Плейлист (/admin#playlist): что и в каком порядке показывает экран. Правки сохраняются сами.
// Слева (30 %) — добавление слайдов, настройки экрана, «Сейчас на экране»; справа (70 %) — очередь слайдов.
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { state, GRADES, isBreak, afterLessons } from '../store.js'
import { menuDay, menuPageCount } from '../menu.js'
import {
  playlist,
  playlistLoaded,
  media,
  mediaById,
  makeSlide,
  cloneSlide,
  slideFromTemplate,
  startPlaylist,
  slideTitle,
  SLIDE_TITLES,
  LAYOUT_TITLES,
  hasLayout,
  layoutOf,
  winnerScreensOf,
} from '../playlist.js'
import { thumbUrl, fmtDuration } from './mediaApi.js'
import { DAY_SHORT, hasRules, ruleState, countdownState, rulesText, isBlanked, tickerTexts } from '../rules.js'
import { plural } from '../bells.js'
import { onScreenIds } from './screens.js'
import NowOnScreen from './NowOnScreen.vue'
import NewsEditor from './NewsEditor.vue'
import WinnersEditor from './WinnersEditor.vue'
import CountdownEditor from './CountdownEditor.vue'
import MenuEditor from './MenuEditor.vue'
import BirthdaysEditor from './BirthdaysEditor.vue'
import BirthdaysModal from './BirthdaysModal.vue'
import TodayEditor from './TodayEditor.vue'
import ClubsEditor from './ClubsEditor.vue'
import { clubScreens, clubsPlayable, weekCols } from '../clubs.js'
import { holidaysFor } from '../holidays.js'
import { todayBirthdays } from '../birthdaysStore.js'
import { useWeather } from '../weatherStore.js'
import { weatherLine } from '../weather.js'
import { birthdayScreens } from '../birthdays.js'
import AddSlideMenu from './AddSlideMenu.vue'
import ScreenSettings from './ScreenSettings.vue'
import SlideSettings from './SlideSettings.vue'
import ShowCalendar from './ShowCalendar.vue'
import { deckById, avgCardSeconds, startDecks } from '../decks.js'

startPlaylist()
startDecks()

// время для проверки правил — по часам этого компьютера, раз в 15 с
const now = ref(new Date())
let clock
onMounted(() => (clock = setInterval(() => (now.value = new Date()), 15_000)))
onBeforeUnmount(() => clearInterval(clock))

const items = computed(() => playlist.items)

// ---------- описание слайда ----------
function fileOf(it) {
  return it.media ? mediaById(it.media) : null
}
/** Сколько секунд идёт слайд (для итога); видео — по длине файла. */
function secondsOf(it) {
  if (it.type === 'schedule') {
    const gs = (it.grades?.length ? it.grades : GRADES).filter((g) => (state.settings.letters[g] || []).length)
    return gs.length * it.duration
  }
  if (it.type === 'video') return Math.round(fileOf(it)?.duration || 0)
  if (it.type === 'deck') return deckSeconds(it)
  if (it.type === 'winners') return winnerScreensOf(it).length * it.duration
  if (it.type === 'menu') return menuPageCount(menuDay(it, now.value, afterLessons(now.value))?.meals) * it.duration
  if (it.type === 'birthdays') return birthdayScreens(todayBirthdays(it.full)).length * it.duration
  if (it.type === 'clubs') return clubScreens(it, now.value, weekCols(layoutOf(it) === 'panel')).length * it.duration
  return it.duration
}
/** Сколько в среднем идёт одна карточка колоды. */
const deckSeconds = (it) => avgCardSeconds(deckById(it.deck))
const ruleOk = (it) => ruleState(it.when, now.value, isBreak).ok
// в круг сейчас входят включённые слайды, у которых правила подходят под текущий момент
const total = computed(() => items.value.filter((it) => it.on && ruleOk(it) && !cdOver(it)).reduce((s, it) => s + secondsOf(it), 0))
const enabledCount = computed(() => items.value.filter((it) => it.on).length)
const nowCount = computed(() => items.value.filter((it) => it.on && ruleOk(it) && !cdOver(it)).length)

function fmtTotal(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m ? `${m} мин ${s} с` : `${s} с`
}

/** Короткая сводка настроек слайда для строки: «10 с · заполнить · с панелью справа». */
function summaryOf(it) {
  const p = []
  const f = fileOf(it)
  if (it.type === 'video') p.push('до конца' + (f?.duration ? ` (${fmtDuration(f.duration)})` : ''))
  else if (it.type === 'deck') p.push(`≈ ${deckSeconds(it)} с карточка`)
  else if (it.type === 'winners') p.push(`${winnerScreensOf(it).length} экр. × ${it.duration} с`)
  else if (it.type === 'birthdays') p.push(`${birthdayScreens(todayBirthdays(it.full)).length} экр. × ${it.duration} с`)
  else if (it.type === 'clubs') p.push(`${clubScreens(it, now.value, weekCols(layoutOf(it) === 'panel')).length} экр. × ${it.duration} с`)
  else if (it.type === 'menu') p.push(`${menuPageCount(menuDay(it, now.value, afterLessons(now.value))?.meals)} экр. × ${it.duration} с`)
  else p.push(it.type === 'schedule' ? `${it.duration} с на параллель` : `${it.duration} с`)
  if (it.type === 'changes' && it.skipEmpty) p.push('пропускается, если изменений нет')
  if (it.type === 'image' || it.type === 'video') p.push(it.fit === 'contain' ? 'целиком' : 'заполнить')
  if (it.type === 'video') p.push(it.sound ? 'со звуком' : 'без звука')
  if (it.type === 'deck') p.push(it.mode === 'daily' ? 'одна в день' : 'по очереди')
  if (hasLayout(it)) p.push(LAYOUT_TITLES[layoutOf(it)].toLowerCase())
  return p.join(' · ')
}
/** Для каких дней задано меню: «Пн–Пт», «Пн, Ср». */
function menuDays(it) {
  const on = DAY_SHORT.slice(0, 6).filter((_, i) => [...(it.days[i + 1] || []), ...(it.days[i + 8] || [])].some((m) => m.lines.trim()))
  return on.length ? 'меню: ' + on.join(', ') : 'меню пока не заполнено'
}
/** Сколько именинников сегодня. */
function birthdaysToday(it) {
  const n = todayBirthdays(it.full).length
  return n ? `сегодня ${n} ${plural(n, 'именинник', 'именинника', 'именинников')}` : 'сегодня именинников нет — слайд пропускается'
}
/** Что сегодня на слайде «Сегодня». */
function todayInfo(it) {
  const h = holidaysFor(it, now.value)
  return h.length ? 'сегодня: ' + h.map((x) => x.title).join('; ') : 'сегодня дат нет — слайд пропускается'
}
/** Что сейчас на слайде «Кружки и секции». */
function clubsInfo(it) {
  if (!it.clubs.length) return 'кружков пока нет'
  const mode = it.mode === 'week' ? 'вся неделя' : 'сегодня'
  return `${mode}: ${it.clubs.length} ${plural(it.clubs.length, 'кружок', 'кружка', 'кружков')}` + (clubsPlayable(it, now.value) ? '' : ' — сейчас слайд пропускается')
}
/** Есть ли сейчас погода для слайда. */
function weatherInfo() {
  return wx.value ? 'сейчас ' + weatherLine(wx.value) : 'нет свежих данных о погоде — слайд пропускается'
}
/** Текст новости / подпись отсчёта — хвостом сводки. */
const snippetOf = (it) =>
  it.type === 'news' ? it.text : it.type === 'countdown' ? it.note : it.type === 'menu' ? menuDays(it) : it.type === 'birthdays' ? birthdaysToday(it) : it.type === 'today' ? todayInfo(it) : it.type === 'clubs' ? clubsInfo(it) : it.type === 'weather' ? weatherInfo() : it.type === 'winners' ? it.groups.map((g) => g.name.trim()).filter(Boolean).join(', ') : ''

// ---------- настройки экрана (окно с вкладками) ----------
const calOpen = ref(false) // календарь показов
const screenTab = ref('') // ''— окно закрыто; layout | blank | ticker
const blankNow = computed(() => isBlanked(playlist.blank, now.value))
const tickerNow = computed(() => tickerTexts(playlist.ticker, now.value).length > 0)
const blankText = computed(() => (playlist.blank.on ? (blankNow.value ? 'вкл · сейчас погашен' : 'вкл · сейчас работает') : 'выключено'))
const tickerText = computed(() => {
  if (!playlist.ticker.on) return 'выключена'
  const n = playlist.ticker.items.length
  return `${n} ${plural(n, 'объявление', 'объявления', 'объявлений')} · ${tickerNow.value ? 'идёт' : 'не идёт'}`
})

// ---------- настройки слайда (окно ⚙) ----------
// храним id, а не сам объект: после загрузки с сервера объекты слайдов новые
const setId = ref('')
const setItem = computed(() => items.value.find((x) => x.id === setId.value) || null)
// «Сейчас на экране»: клик по блоку открывает экран; нажатия на кнопки и ссылки внутри — не считаются
function openScreen(e) {
  if (e.target.closest('button, a')) return
  window.open('/', '_blank')
}
function settingsEdit() {
  const it = setItem.value
  setId.value = ''
  if (it?.type === 'news') newsEdit.value = it
  if (it?.type === 'winners') winEdit.value = it
  if (it?.type === 'countdown') cdEdit.value = it
  if (it?.type === 'menu') menuEdit.value = it
  if (it?.type === 'birthdays') bdEdit.value = it
  if (it?.type === 'today') todayEdit.value = it
  if (it?.type === 'clubs') clubsEdit.value = it
}

function remove(i) {
  playlist.items.splice(i, 1)
}
// копия сразу под исходной строкой; новость, победители и отсчёт открываются на правку
function copySlide(i) {
  const copy = cloneSlide(playlist.items[i])
  playlist.items.splice(i + 1, 0, copy)
  if (copy.type === 'news') newsEdit.value = playlist.items[i + 1]
  if (copy.type === 'winners') winEdit.value = playlist.items[i + 1]
  if (copy.type === 'countdown') cdEdit.value = playlist.items[i + 1]
  if (copy.type === 'menu') menuEdit.value = playlist.items[i + 1]
  if (copy.type === 'birthdays') bdEdit.value = playlist.items[i + 1]
  if (copy.type === 'today') todayEdit.value = playlist.items[i + 1]
  if (copy.type === 'clubs') clubsEdit.value = playlist.items[i + 1]
}
function settingsCopy() {
  const i = items.value.indexOf(setItem.value)
  setId.value = ''
  if (i >= 0) copySlide(i)
}
function settingsRemove() {
  const i = items.value.indexOf(setItem.value)
  setId.value = ''
  if (i >= 0) remove(i)
}
// срочный режим: на всех экранах только один слайд, пока не отключат
const urgentItem = computed(() => (playlist.urgent.on ? items.value.find((x) => x.id === playlist.urgent.id) : null))
function toggleUrgent(it) {
  if (urgentItem.value === it) return stopUrgent()
  if (!confirm(`Показывать на всех экранах только «${slideTitle(it)}», пока не отключите?`)) return
  playlist.urgent = { on: true, id: it.id }
}
function stopUrgent() {
  playlist.urgent = { on: false, id: '' }
}

// перетаскивание строк за «ручку»
const dragFrom = ref(-1)
const dragOver = ref(-1)
function onDragStart(i, e) {
  dragFrom.value = i
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(i))
}
function onDragOverRow(i) {
  if (dragFrom.value >= 0) dragOver.value = i
}
function onDropRow(i) {
  const from = dragFrom.value
  dragFrom.value = dragOver.value = -1
  if (from < 0 || from === i) return
  const [it] = playlist.items.splice(from, 1)
  playlist.items.splice(i, 0, it)
}
function onDragEnd() {
  dragFrom.value = dragOver.value = -1
}

// ---------- добавление (меню «＋ Добавить слайд») ----------
function onAdd(type, deck) {
  if (type === 'media') openPicker()
  else if (type === 'news') addNews()
  else if (type === 'winners') addWinners()
  else if (type === 'countdown') addCountdown()
  else if (type === 'menu') addMenu()
  else if (type === 'birthdays') {
    playlist.items.push(makeSlide('birthdays'))
    bdEdit.value = playlist.items[playlist.items.length - 1]
  }
  else if (type === 'today') {
    playlist.items.push(makeSlide('today'))
    todayEdit.value = playlist.items[playlist.items.length - 1]
  }
  else if (type === 'clubs') {
    playlist.items.push(makeSlide('clubs'))
    clubsEdit.value = playlist.items[playlist.items.length - 1]
  }
  else if (type === 'deck') playlist.items.push(makeSlide('deck', deck))
  else playlist.items.push(makeSlide(type))
}

// слайд по шаблону — в конец очереди, окно правки открывается сразу (как у копии)
function onTemplate(t) {
  const it = slideFromTemplate(t)
  playlist.items.push(it)
  const added = playlist.items[playlist.items.length - 1]
  if (it.type === 'news') newsEdit.value = added
  if (it.type === 'winners') winEdit.value = added
  if (it.type === 'countdown') cdEdit.value = added
  if (it.type === 'menu') menuEdit.value = added
  if (it.type === 'birthdays') bdEdit.value = added
  if (it.type === 'today') todayEdit.value = added
  if (it.type === 'clubs') clubsEdit.value = added
}
function renameTemplate(t) {
  const name = prompt('Новое название шаблона:', t.name)
  if (name && name.trim()) t.name = name.trim().slice(0, 40)
}
function removeTemplate(t) {
  if (!confirm(`Удалить шаблон «${t.name}»? Слайды, созданные по нему, останутся.`)) return
  const i = playlist.templates.indexOf(t)
  if (i >= 0) playlist.templates.splice(i, 1)
}

// новость правится в отдельном окне; пустую новость при закрытии убираем
const newsEdit = ref(null)
function addNews() {
  playlist.items.push(makeSlide('news'))
  newsEdit.value = playlist.items[playlist.items.length - 1]
}
function closeNews() {
  const it = newsEdit.value
  newsEdit.value = null
  if (it && !it.title && !it.text && !it.media) {
    const i = playlist.items.indexOf(it)
    if (i >= 0) playlist.items.splice(i, 1)
  }
}

// победители: окно правки, как у новости; пустой слайд при закрытии убираем
const winEdit = ref(null)
function addWinners() {
  playlist.items.push(makeSlide('winners'))
  winEdit.value = playlist.items[playlist.items.length - 1]
}
function closeWinners() {
  const it = winEdit.value
  winEdit.value = null
  if (it && !it.title && !it.media && !winnerScreensOf(it).length) {
    const i = playlist.items.indexOf(it)
    if (i >= 0) playlist.items.splice(i, 1)
  }
}

// обратный отсчёт: окно правки; отсчёт без даты при закрытии убираем (сервер его всё равно не сохранит)
const cdEdit = ref(null)
function addCountdown() {
  playlist.items.push(makeSlide('countdown'))
  cdEdit.value = playlist.items[playlist.items.length - 1]
}
function closeCountdown() {
  const it = cdEdit.value
  cdEdit.value = null
  if (it && !it.date) {
    const i = playlist.items.indexOf(it)
    if (i >= 0) playlist.items.splice(i, 1)
  }
}
// меню столовой: окно правки; меню без единого блюда при закрытии убираем
const menuEdit = ref(null)
// именинники: окно слайда и окно списка (список один на всё табло)
const bdEdit = ref(null)
const wx = useWeather()
const todayEdit = ref(null)
const clubsEdit = ref(null)
const bdListOpen = ref(false)
function addMenu() {
  playlist.items.push(makeSlide('menu'))
  menuEdit.value = playlist.items[playlist.items.length - 1]
}
function closeMenu() {
  const it = menuEdit.value
  menuEdit.value = null
  if (it && !Object.values(it.days).some((d) => d.some((m) => m.lines.trim()))) {
    const i = playlist.items.indexOf(it)
    if (i >= 0) playlist.items.splice(i, 1)
  }
}
const cdOver = (it) => it.type === 'countdown' && countdownState(it, now.value).over

const picker = reactive({ open: false, type: 'all', category: '', selected: [] })
const pickerItems = computed(() =>
  [...media.value]
    .sort((a, b) => b.addedAt - a.addedAt)
    .filter((m) => (picker.type === 'all' || m.type === picker.type) && (!picker.category || m.category === picker.category)),
)
const pickerCategories = computed(() => [...new Set(media.value.map((m) => m.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')))
const inPlaylist = (id) => playlist.items.some((it) => it.media === id)

function openPicker() {
  picker.open = true
  picker.selected = []
}
function togglePick(id) {
  const i = picker.selected.indexOf(id)
  if (i >= 0) picker.selected.splice(i, 1)
  else picker.selected.push(id)
}
function addPicked() {
  // в порядке выбора
  for (const id of picker.selected) {
    const m = mediaById(id)
    if (m) playlist.items.push(makeSlide(m.type, id))
  }
  picker.open = false
}

function onKey(e) {
  if (e.key === 'Escape') picker.open = false
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <section class="pl">
    <!-- слева: инструменты -->
    <aside class="side">
      <AddSlideMenu @add="onAdd" @template="onTemplate" @rename-template="renameTemplate" @remove-template="removeTemplate" />

      <div class="card">
        <div class="card-head">
          <b>Настройки экрана</b>
          <button class="a-btn small" @click="screenTab = 'layout'">⚙ Изменить</button>
        </div>
        <button class="set-line" @click="screenTab = 'layout'">
          <span>Шаблон слайдов</span>
          <b>{{ LAYOUT_TITLES[playlist.layout] }}</b>
        </button>
        <button class="set-line" @click="screenTab = 'blank'">
          <span>Гашение экрана</span>
          <b :class="{ on: playlist.blank.on, night: blankNow }">{{ blankText }}</b>
        </button>
        <button class="set-line" @click="screenTab = 'ticker'">
          <span>Бегущая строка</span>
          <b :class="{ on: playlist.ticker.on && tickerNow }">{{ tickerText }}</b>
        </button>
        <button class="a-btn cal-btn" data-ro-allow @click="calOpen = true">📅 Календарь показов</button>
        <button class="a-btn cal-btn" data-ro-allow @click="bdListOpen = true">🎂 Именинники</button>
      </div>

      <!-- клик по блоку открывает экран в новой вкладке (кнопки внутри — свои действия) -->
      <div class="card now-card" data-ro-allow title="Открыть экран в новой вкладке" @click="openScreen">
        <div class="card-head"><b>Сейчас на экране</b><span class="open-hint">Открыть экран ↗</span></div>
        <NowOnScreen />
      </div>
    </aside>

    <!-- справа: очередь слайдов -->
    <div class="queue">
      <div class="q-head">
        <div class="sum">
          Включено: {{ enabledCount }} из {{ items.length }} · сейчас по правилам идут {{ nowCount }} · круг ≈ {{ fmtTotal(total) }}
        </div>
        <span
          class="help"
          title="Экран показывает включённые слайды сверху вниз и начинает сначала. Слайд с правилами («Когда») идёт только в указанные даты, часы и дни. Порядок меняется перетаскиванием за ⋮⋮. Настройки слайда — кнопка ⚙. Изменения сразу уходят на экраны."
          >?</span
        >
      </div>

      <div v-if="urgentItem" class="urgent-bar">
        <span>⚠ Срочный режим: на всех экранах «{{ slideTitle(urgentItem) }}»</span>
        <button class="btn" @click="stopUrgent">Отключить</button>
      </div>

      <div v-if="playlistLoaded && !items.length" class="empty">
        Плейлист пуст — экран показывает расписание.<br />Добавьте слайды кнопкой «＋ Добавить слайд».
      </div>

      <ol class="list">
        <li
          v-for="(it, i) in items"
          :key="it.id"
          class="row"
          :class="{
            off: !it.on,
            waiting: it.on && !ruleOk(it),
            live: onScreenIds.has(it.id),
            urgent: urgentItem === it,
            over: dragOver === i && dragFrom !== i,
            dragging: dragFrom === i,
            missing: it.media && !fileOf(it),
          }"
          @dragover.prevent="onDragOverRow(i)"
          @drop.prevent="onDropRow(i)"
        >
          <span class="handle" draggable="true" title="Перетащите, чтобы изменить порядок" @dragstart="onDragStart(i, $event)" @dragend="onDragEnd">⋮⋮</span>
          <span class="num">{{ i + 1 }}</span>

          <div class="thumb" :class="it.type" title="Настройки слайда" @click="setId = it.id">
            <img v-if="fileOf(it) && thumbUrl(fileOf(it))" :src="thumbUrl(fileOf(it))" alt="" />
            <span v-else-if="it.type === 'schedule'">5–11</span>
            <span v-else-if="it.type === 'changes'">Изм.</span>
            <span v-else-if="it.type === 'news'">Новость</span>
            <span v-else-if="it.type === 'winners'">🏆</span>
            <span v-else-if="it.type === 'countdown'">⏳</span>
            <span v-else-if="it.type === 'menu'">🍽</span>
            <span v-else-if="it.type === 'birthdays'">🎂</span>
            <span v-else-if="it.type === 'today'">📅</span>
            <span v-else-if="it.type === 'clubs'">⚽</span>
            <span v-else-if="it.type === 'weather'">🌤</span>
            <span v-else-if="it.type === 'deck'">?!</span>
            <span v-else-if="!fileOf(it)">?</span>
            <span v-if="it.type === 'video'" class="badge">▶</span>
          </div>

          <div class="main">
            <div class="title" title="Настройки слайда" @click="setId = it.id">{{ slideTitle(it) }}</div>
            <div class="kind">
              {{ SLIDE_TITLES[it.type] }}
              <span v-if="onScreenIds.has(it.id)" class="tag live">▶ на экране</span>
              <span v-else-if="it.on && cdOver(it)" class="tag wait">событие прошло</span>
              <span v-else-if="it.on && !ruleOk(it)" class="tag wait">сейчас не идёт: {{ ruleState(it.when, now, isBreak).reason }}</span>
            </div>
            <div class="summary">
              <span>{{ summaryOf(it) }}</span>
              <span class="when" :class="{ set: hasRules(it.when) }"> · когда: {{ hasRules(it.when) ? rulesText(it.when) : 'всегда' }}</span>
              <span v-if="it.screens?.length" class="when set"> · только: {{ it.screens.join(', ') }}</span>
              <span v-if="snippetOf(it)" class="snip"> · {{ snippetOf(it) }}</span>
            </div>
          </div>

          <label class="a-switch" :title="it.on ? 'Выключить (слайд останется в списке)' : 'Включить'">
            <input v-model="it.on" type="checkbox" />
            <span></span>
          </label>

          <div class="acts">
            <button class="gear" title="Настройки слайда" @click="setId = it.id">⚙</button>
            <button class="urg" :class="{ on: urgentItem === it }" title="Показывать только этот слайд на всех экранах" @click="toggleUrgent(it)">⚠</button>
            <button class="del" title="Убрать из плейлиста (файл останется в медиатеке)" @click="remove(i)">✕</button>
          </div>
        </li>
      </ol>
    </div>

    <ScreenSettings v-if="screenTab" :tab="screenTab" :now="now" @close="screenTab = ''" />
    <ShowCalendar v-if="calOpen" :now="now" :locked="!!setItem" @close="calOpen = false" @open-slide="setId = $event" />
    <SlideSettings
      v-if="setItem"
      :item="setItem"
      :now="now"
      @close="setId = ''"
      @copy="settingsCopy"
      @remove="settingsRemove"
      @edit="settingsEdit"
    />
    <NewsEditor v-if="newsEdit" :item="newsEdit" @close="closeNews" />
    <WinnersEditor v-if="winEdit" :item="winEdit" @close="closeWinners" />
    <CountdownEditor v-if="cdEdit" :item="cdEdit" @close="closeCountdown" />
    <MenuEditor v-if="menuEdit" :item="menuEdit" @close="closeMenu" />
    <TodayEditor v-if="todayEdit" :item="todayEdit" @close="todayEdit = null" />
    <ClubsEditor v-if="clubsEdit" :item="clubsEdit" @close="clubsEdit = null" />
    <BirthdaysEditor v-if="bdEdit" :item="bdEdit" @close="bdEdit = null" />
    <BirthdaysModal v-if="bdListOpen" @close="bdListOpen = false" />

    <!-- выбор файлов из медиатеки -->
    <div v-if="picker.open" class="modal-back" @mousedown.self="picker.open = false">
      <div class="modal">
        <div class="modal-head">
          <h2>Добавить из медиатеки</h2>
          <span class="seg">
            <button :class="{ on: picker.type === 'all' }" @click="picker.type = 'all'">Все</button>
            <button :class="{ on: picker.type === 'image' }" @click="picker.type = 'image'">Фото</button>
            <button :class="{ on: picker.type === 'video' }" @click="picker.type = 'video'">Видео</button>
          </span>
          <select v-if="pickerCategories.length" v-model="picker.category">
            <option value="">Все категории</option>
            <option v-for="c in pickerCategories" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>

        <div v-if="!media.length" class="empty">
          В медиатеке пока нет файлов. <a href="#media" @click="picker.open = false">Загрузить</a>
        </div>
        <div class="pick-grid">
          <button
            v-for="m in pickerItems"
            :key="m.id"
            class="pick"
            :class="{ on: picker.selected.includes(m.id) }"
            @click="togglePick(m.id)"
          >
            <img v-if="thumbUrl(m)" :src="thumbUrl(m)" alt="" loading="lazy" />
            <span v-if="picker.selected.includes(m.id)" class="order">{{ picker.selected.indexOf(m.id) + 1 }}</span>
            <span v-if="m.type === 'video'" class="badge">▶ {{ fmtDuration(m.duration) }}</span>
            <span v-if="inPlaylist(m.id)" class="already">уже в плейлисте</span>
            <span class="pick-name">{{ m.name }}</span>
          </button>
        </div>

        <div class="modal-foot">
          <span class="muted">Выбрано: {{ picker.selected.length }}</span>
          <div class="spacer"></div>
          <button class="btn" @click="picker.open = false">Отмена</button>
          <button class="btn primary" :disabled="!picker.selected.length" @click="addPicked">Добавить в конец</button>
        </div>
      </div>
    </div>
  </section>
</template>
<style scoped>
/* две колонки: инструменты 30 % и очередь 70 % */
.pl {
  height: 100%;
  display: grid;
  grid-template-columns: minmax(300px, 3fr) 7fr;
  gap: 16px;
  overflow: hidden;
  font-size: 14px;
}
.side {
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 2px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: 12px;
  background: #22252b;
}
.now-card {
  cursor: pointer;
  border: 1px solid transparent;
}
.now-card:hover {
  border-color: #3d7be0;
}
.open-hint {
  color: #7fb0ff;
  font-size: 13px;
  font-weight: 700;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
  color: #e6e8ec;
  font-weight: 800;
  font-size: 15px;
}
/* строка сводки «Шаблон / Гашение / Бегущая строка» — открывает окно на своей вкладке */
.set-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  border: none;
  border-radius: 8px;
  padding: 8px 10px;
  background: #1d1f24;
  color: #a4a9b3;
  font: inherit;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}
.set-line:hover {
  background: #31353d;
  color: #fff;
}
.set-line b {
  color: #e6e8ec;
  font-weight: 800;
  text-align: right;
}
.set-line b.on {
  color: #7fd18b;
}
.set-line b.night {
  color: #c9a7ff;
}
.cal-btn {
  margin-top: 6px;
}
.queue {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.q-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 4px;
}
.sum {
  color: #c9ccd3;
  font-weight: 700;
}
.help {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #31353d;
  color: #a4a9b3;
  font-weight: 800;
  font-size: 13px;
  cursor: help;
}
.spacer {
  flex: 1;
}
.btn {
  border: none;
  border-radius: 8px;
  padding: 9px 16px;
  background: #3b404a;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.btn:hover {
  background: #4a505c;
}
.btn.primary {
  background: #3d7be0;
}
.btn.primary:hover {
  background: #4c89ec;
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.empty {
  margin: 30px auto;
  text-align: center;
  color: #a4a9b3;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.6;
}
.empty a {
  color: #7fb0ff;
}

.list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin: 0;
  padding: 0 4px 0 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row {
  display: grid;
  grid-template-columns: 18px 24px 112px minmax(0, 1fr) 44px auto;
  align-items: center;
  gap: 12px;
  padding: 8px 12px 8px 8px;
  border-radius: 12px;
  background: #26292f;
  border: 2px solid transparent;
}
.row.off {
  opacity: 0.5;
}
.row.waiting .thumb,
.row.waiting .title {
  opacity: 0.55;
}
.row.live {
  border-color: #2f7a43;
}
.row.urgent {
  border-color: #d9382a;
  background: #3a2326;
}
.row.over {
  border-color: #3d7be0;
}
.row.dragging {
  opacity: 0.35;
}
.row.missing .title {
  color: #ff8a7a;
}
.urgent-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  border-radius: 10px;
  background: #b3261e;
  color: #fff;
  font-weight: 800;
}
.urgent-bar .btn {
  margin-left: auto;
  background: rgba(0, 0, 0, 0.3);
}
.handle {
  cursor: grab;
  color: #7c818b;
  font-size: 18px;
  letter-spacing: -3px;
  user-select: none;
}
.num {
  color: #7c818b;
  font-weight: 800;
  text-align: right;
}
.thumb {
  position: relative;
  width: 112px;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: #000;
  color: #fff;
  font-weight: 900;
  font-size: 18px;
  cursor: pointer;
}
.thumb.schedule {
  background: linear-gradient(135deg, #f0a32a, #c45a10);
}
.thumb.changes {
  background: linear-gradient(135deg, #6b4a2b, #3f7a3a);
}
.thumb.news {
  background: linear-gradient(135deg, #2c74c0, #0c2c68);
  font-size: 15px;
}
.thumb.clubs {
  background: linear-gradient(135deg, #2c9aa0, #0c3c58);
  font-size: 22px;
}
.thumb.today {
  background: linear-gradient(135deg, #e0a030, #8a3a0c);
  font-size: 22px;
}
.thumb.weather {
  background: linear-gradient(135deg, #4aa8e8, #1c4a8a);
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
  font-size: 22px;
}
.thumb.winners {
  background: linear-gradient(135deg, #e0b030, #7a4a0c);
  font-size: 22px;
}
.thumb.deck {
  background: linear-gradient(135deg, #7a2fd0, #12052e);
  font-size: 22px;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.badge {
  position: absolute;
  right: 5px;
  bottom: 5px;
  padding: 1px 6px;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
.main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.title {
  align-self: flex-start;
  max-width: 100%;
  font-weight: 800;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.title:hover {
  color: #8db4ff;
}
.kind {
  color: #7c818b;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.tag {
  margin-left: 8px;
  padding: 1px 7px;
  border-radius: 5px;
  font-size: 11px;
  text-transform: none;
  letter-spacing: 0;
}
.tag.live {
  background: rgba(63, 174, 90, 0.85);
  color: #fff;
}
.tag.wait {
  background: rgba(240, 163, 42, 0.18);
  color: #f0b45a;
}
/* серая сводка настроек в одну строку */
.summary {
  color: #8b909a;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.summary .when.set {
  color: #f0b45a;
}

.acts {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}
.acts button {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 8px;
  background: #31353d;
  color: #c9ccd3;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
}
.acts button:hover {
  background: #3b404a;
  color: #fff;
}
.acts .gear {
  font-size: 17px;
}
.acts .gear:hover {
  background: #3d7be0;
}
.acts .urg.on {
  background: #d9382a;
  color: #fff;
}
.acts .del:hover {
  background: rgba(255, 90, 70, 0.25);
  color: #ff8a7a;
}
.seg {
  display: inline-flex;
  padding: 3px;
  border-radius: 9px;
  background: #15171b;
}
.seg button {
  border: none;
  border-radius: 7px;
  padding: 4px 10px;
  background: transparent;
  color: #a4a9b3;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.seg button.on {
  background: #3b404a;
  color: #fff;
}

/* узкое окно: колонки друг под другом, прокручивается вся страница */
@media (max-width: 1100px) {
  .pl {
    display: flex;
    flex-direction: column;
    overflow: auto;
  }
  .side,
  .queue {
    flex: none;
    overflow: visible;
  }
  .list {
    flex: none;
    overflow: visible;
  }
}

/* выбор файлов */
.modal-back {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.7);
}
.modal {
  width: min(1100px, 94vw);
  height: min(780px, 90vh);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  border-radius: 14px;
  background: #1d1f24;
  border: 1px solid #353943;
}
.modal-head {
  display: flex;
  align-items: center;
  gap: 14px;
}
.modal-head h2 {
  margin: 0 auto 0 0;
  font-size: 18px;
  font-weight: 800;
}
select {
  border: 1px solid #3b404a;
  border-radius: 8px;
  padding: 7px 10px;
  background: #15171b;
  color: #f2f2f2;
  font: inherit;
  font-weight: 600;
}
.pick-grid {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  align-content: start;
  gap: 10px;
}
.pick {
  position: relative;
  aspect-ratio: 16 / 9;
  padding: 0;
  border: 3px solid transparent;
  border-radius: 10px;
  overflow: hidden;
  background: #000;
  cursor: pointer;
}
.pick.on {
  border-color: #3d7be0;
}
.pick img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.pick-name {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 14px 8px 5px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pick .badge {
  top: 5px;
  bottom: auto;
}
.order {
  position: absolute;
  top: 6px;
  left: 6px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #3d7be0;
  color: #fff;
  font-weight: 800;
  font-size: 13px;
}
.already {
  position: absolute;
  top: 6px;
  left: 38px;
  padding: 1px 6px;
  border-radius: 5px;
  background: rgba(63, 174, 90, 0.85);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
.pick:not(.on) .already {
  left: 6px;
}
.modal-foot {
  display: flex;
  align-items: center;
  gap: 10px;
}
.muted {
  color: #8b909a;
  font-weight: 700;
}
</style>
