<script>
import { ref as moduleRef } from 'vue'
const bgProbe = moduleRef('')
const probe = new Image()
probe.onload = () => (bgProbe.value = `url("${probe.src}")`)
probe.src = '/background.jpg'
</script>

<script setup>
// Табло расписания 1920×1080. В редакторе (/admin) — editable, вкладки переключает учитель.
// На экране (/) им управляет плейлист: tabs — какие вкладки показать по очереди, seconds — сколько секунд каждую,
// run — номер показа (сменился → начать с первой вкладки), playing — идёт ли отсчёт; после последней вкладки — 'done'.
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  state,
  GRADES,
  getLessons,
  setLessonField,
  getChanges,
  setChangeField,
  maxLessonOfDay,
  changesActive,
  hasChangeRows,
  clearChanges,
  ymd,
} from '../store.js'
import { ui, clearSelection } from '../ui.js'
import { THEMES, themeBackground } from '../themes.js'
import { bellsForDay, bellStatus } from '../bells.js'
import { vFit } from '../fit.js'
import EditColumn from './EditColumn.vue'
import CalendarPanel from './CalendarPanel.vue'
// настройки нужны только в редакторе — грузим отдельным файлом, экрану он не нужен
const SettingsModal = defineAsyncComponent(() => import('./SettingsModal.vue'))

const props = defineProps({
  editable: { type: Boolean, default: false },
  tabs: { type: Array, default: null },
  seconds: { type: Number, default: 15 },
  run: { type: Number, default: 0 },
  playing: { type: Boolean, default: true },
})
const emit = defineEmits(['done', 'tab'])

// ---------- масштабирование «табло» 1920×1080 под размер своего блока ----------
const W = 1920
const H = 1080
const scale = ref(1)
const root = ref(null)
function fit() {
  const el = root.value
  if (el) scale.value = Math.min(el.clientWidth / W, el.clientHeight / H)
}

// ---------- фон: если положить public/background.jpg, он подхватится (проверяем один раз на всю страницу) ----------
const bgImage = bgProbe

// ---------- время и выбранный день ----------
const now = ref(new Date())
const picked = ref(null) // null — показываем сегодня
const viewDate = computed(() => picked.value || now.value)
const viewingToday = computed(() => !picked.value)
// день расписания 1..6. В воскресенье — понедельник. На экране (не в редакторе), если сегодня уроков нет
// ни у одного класса (например, суббота при пятидневке) или уроки уже закончились (после последнего звонка), —
// ближайший следующий день, где уроки есть.
const afterLessons = computed(() => !props.editable && viewingToday.value && maxLessonOfDay(viewDate.value.getDay()) > 0 && bell.value.kind === 'after')
const dayKey = computed(() => {
  const d = viewDate.value.getDay()
  if (!props.editable && viewingToday.value && (maxLessonOfDay(d) === 0 || afterLessons.value)) {
    for (let k = 1; k <= 6; k++) {
      const n = ((d + k - 1) % 7) + 1 // следующие дни по кругу: 1..7, где 7 — воскресенье
      if (n !== 7 && maxLessonOfDay(n) > 0) return n
    }
  }
  return d === 0 ? 1 : d
})
// показан не сегодняшний день недели (воскресенье или день без уроков) — подписываем
const DAY_NAMES = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
const DAY_ACC = ['', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу']
const shiftNote = computed(() => {
  const d = viewDate.value.getDay()
  if (dayKey.value === d) return ''
  if (afterLessons.value) return `Уроки закончились — расписание на ${DAY_ACC[dayKey.value]}`
  const why = d === 0 ? DAY_NAMES[0] : `${DAY_NAMES[d]}: уроков нет`
  return `${why} — показано расписание на ${DAY_ACC[dayKey.value]}`
})
let lastInteraction = Date.now()

function pickDate(d) {
  const t = new Date()
  picked.value = d.toDateString() === t.toDateString() ? null : d
  lastInteraction = Date.now()
  clearSelection()
}

// ---------- звонки ----------
const todayDow = computed(() => now.value.getDay())
const bell = computed(() => {
  const dow = todayDow.value
  if (dow === 0) return { kind: 'none' }
  return bellStatus(bellsForDay(state.settings.bells, dow), now.value, maxLessonOfDay(dow))
})
// индекс строки текущего/следующего урока (урок N → строка N-1)
// подсветка — только когда показан именно сегодняшний день
const showingToday = computed(() => viewingToday.value && !shiftNote.value)
const nowIdx = computed(() => (showingToday.value && bell.value.kind === 'lesson' ? bell.value.bell.n - 1 : -1))
const nextIdx = computed(() =>
  showingToday.value && (bell.value.kind === 'break' || bell.value.kind === 'before') && bell.value.left <= 15
    ? bell.value.bell.n - 1
    : -1,
)

// ---------- вкладки и показ по плейлисту ----------
const TABS = [...GRADES, 'changes']
const tabIdx = ref(0)
const tab = computed(() => TABS[tabIdx.value])
const isChanges = computed(() => tab.value === 'changes')
const grade = computed(() => (isChanges.value ? '' : tab.value))
const letters = computed(() => (isChanges.value ? [] : state.settings.letters[grade.value] || []))
const theme = computed(() => THEMES[tab.value] || THEMES[5])
const elapsed = ref(0)
const playTabs = computed(() => (props.tabs?.length ? props.tabs : GRADES))
const pos = ref(0) // позиция в playTabs
let doneSent = false
const progress = computed(() => (props.editable ? 0 : Math.min(1, elapsed.value / (props.seconds * 1000))))

function showPos(p) {
  pos.value = p
  const i = TABS.indexOf(playTabs.value[p])
  if (i >= 0) tabIdx.value = i
  elapsed.value = 0
}
// плееру — для «сейчас на экране» в редакторе
watch(tab, (t) => emit('tab', t), { immediate: true })

// новый показ слайда — с первой вкладки
watch(
  () => props.run,
  () => {
    doneSent = false
    if (!props.editable) showPos(0)
  },
  { immediate: true },
)

function goTab(i) {
  if (ui.editing) commit()
  clearSelection()
  tabIdx.value = (i + TABS.length) % TABS.length
  elapsed.value = 0
  lastInteraction = Date.now()
}

let lastTick = performance.now()
function tick() {
  const t = performance.now()
  const dt = t - lastTick
  lastTick = t
  if (props.editable || !props.playing || doneSent) return
  elapsed.value += dt
  if (elapsed.value < props.seconds * 1000) return
  if (pos.value + 1 < playTabs.value.length) showPos(pos.value + 1)
  else {
    // последняя вкладка показана — плейлист переходит к следующему слайду
    elapsed.value = props.seconds * 1000
    doneSent = true
    emit('done')
  }
}

// ---------- колонки текущей вкладки ----------
const LESSON_FIELDS = [
  { k: 's', cls: 'subj', ph: 'Предмет', max: 40, grow: true },
  { k: 'r', cls: 'room', ph: 'каб.', max: 12 },
]
const CHANGE_FIELDS = [
  { k: 'c', cls: 'cls', ph: 'Класс', max: 8 },
  { k: 't', cls: 'free', ph: 'Текст изменения', max: 160, grow: true, wrap: true },
  { k: 'r', cls: 'room', ph: 'каб.', max: 12 },
]

const columns = computed(() => {
  if (isChanges.value) {
    const n = state.settings.changesCols
    // на экране устаревшие замены не показываем (в редакторе они видны с плашкой)
    const hide = !props.editable && !changesActive(now.value)
    return Array.from({ length: n }, (_, i) => ({
      key: 'ch' + i,
      label: '',
      rows: hide ? Array.from({ length: state.settings.lessonsCount }, () => ({ c: '', t: '', r: '' })) : getChanges('ch' + i),
      fields: CHANGE_FIELDS,
    }))
  }
  return letters.value.map((l) => ({
    key: l,
    label: grade.value + l,
    rows: getLessons(grade.value, dayKey.value, l),
    fields: LESSON_FIELDS,
  }))
})

function setValue(key, idx, field, value) {
  if (isChanges.value) setChangeField(key, idx, field, value)
  else setLessonField(grade.value, dayKey.value, key, idx, field, value)
}

// ---------- редактирование ----------
function commit() {
  if (!ui.sel || !ui.editing) return
  const { letter, idx, field } = ui.sel
  setValue(letter, idx, field, ui.draft.trim())
  ui.editing = false
  lastInteraction = Date.now()
}

function cancelEdit() {
  ui.editing = false
}

function startEdit(initial) {
  const col = columns.value.find((c) => c.key === ui.sel.letter)
  const row = col?.rows[ui.sel.idx] || {}
  ui.draft = initial ?? (row[ui.sel.field] || '')
  ui.editing = true
}

function move(dx, dy) {
  const s = ui.sel
  const cols = columns.value
  let ci = cols.findIndex((c) => c.key === s.letter)
  if (ci < 0) return
  const n = cols[ci].rows.length
  const idx = (s.idx + dy + n) % n
  let fields = cols[ci].fields.map((f) => f.k)
  let fi = fields.indexOf(s.field) + dx
  if (fi >= fields.length || fi < 0) {
    ci = (ci + dx + cols.length) % cols.length
    fields = cols[ci].fields.map((f) => f.k)
    fi = dx > 0 ? 0 : fields.length - 1
  }
  ui.sel = { letter: cols[ci].key, idx, field: fields[fi] }
}

function onKey(e) {
  lastInteraction = Date.now()
  if (ui.settingsOpen) {
    if (e.key === 'Escape') ui.settingsOpen = false
    return
  }

  if (ui.editing) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      commit()
      move(e.shiftKey ? -1 : 1, 0)
    } else if (e.target?.tagName !== 'INPUT') {
      // поле ввода ещё не получило фокус — не теряем первые набранные буквы
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        ui.draft += e.key
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        ui.draft = ui.draft.slice(0, -1)
      }
    }
    return
  }

  if (ui.sel) {
    const { letter, idx, field } = ui.sel
    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        setValue(letter, idx, field, '')
        return
      case 'Enter':
      case 'F2':
        e.preventDefault()
        startEdit()
        return
      case 'Escape':
        clearSelection()
        return
      case 'ArrowUp':
        e.preventDefault()
        return move(0, -1)
      case 'ArrowDown':
        e.preventDefault()
        return move(0, 1)
      case 'ArrowLeft':
        e.preventDefault()
        return move(-1, 0)
      case 'ArrowRight':
      case 'Tab':
        e.preventDefault()
        return move(e.shiftKey ? -1 : 1, 0)
    }
    // начали печатать — сразу редактируем, заменяя содержимое
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      startEdit(e.key)
    }
    return
  }

  if (e.key === 'ArrowRight') goTab(tabIdx.value + 1)
  if (e.key === 'ArrowLeft') goTab(tabIdx.value - 1)
}

function onStageDown() {
  if (ui.editing) commit()
  clearSelection()
}

// ---------- размеры ячеек в зависимости от числа колонок ----------
const sizes = computed(() => {
  const cols = Math.max(1, columns.value.length)
  const n = state.settings.lessonsCount
  const areaW = 1414
  const colW = (areaW - (cols - 1) * 14) / cols
  const cellH = Math.min(60, Math.max(36, (isChanges.value ? (props.editable ? 670 : 740) : 610) / (n + 0.24 * (n - 1))))
  return {
    '--cell-h': cellH + 'px',
    '--cell-font': Math.round(Math.min(isChanges.value ? 22 : 21, Math.max(13, colW * 0.075), cellH * 0.36)) + 'px',
    '--label-font': Math.round(Math.min(130, colW * 0.48)) + 'px',
  }
})

const stageVars = computed(() => ({
  transform: `translate(-50%, -50%) scale(${scale.value})`,
  '--accent': theme.value.accent,
  '--shadow-text': theme.value.shadow,
  '--tab-text': theme.value.tabText,
}))

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const dateParts = computed(() => (state.settings.changesDate || '').split('-').map(Number))
const headerTitle = computed(() => {
  if (!isChanges.value) return `${grade.value} классы`
  const [, m, d] = dateParts.value
  return m ? `Изменения на ${d} ${MONTHS_GEN[m - 1]}` : 'Изменения'
})

// дата изменений в редакторе: кнопки «сегодня» / «завтра», плашка для прошедшего дня
function setChangesDate(offset) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  state.settings.changesDate = ymd(d)
}
const staleChanges = computed(() => props.editable && isChanges.value && !changesActive(now.value) && hasChangeRows())
const staleText = computed(() => {
  const [, m, d] = dateParts.value
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`
})

// ---------- жизненный цикл ----------
let clockTimer, tickTimer, resizeObs
onMounted(() => {
  fit()
  resizeObs = new ResizeObserver(fit)
  resizeObs.observe(root.value)
  if (props.editable) window.addEventListener('keydown', onKey)
  clockTimer = setInterval(() => {
    now.value = new Date()
    // через 5 минут без действий табло возвращается к сегодняшнему дню
    if (picked.value && Date.now() - lastInteraction > 5 * 60 * 1000 && !ui.sel) picked.value = null
  }, 1000)
  tickTimer = setInterval(tick, 100)
})
onBeforeUnmount(() => {
  resizeObs?.disconnect()
  window.removeEventListener('keydown', onKey)
  clearInterval(clockTimer)
  clearInterval(tickTimer)
  if (ui.editing) commit()
  clearSelection()
})
</script>

<template>
  <div ref="root" class="viewport" :style="{ background: theme.base }">
    <div class="stage" :style="stageVars" @mousedown="onStageDown">
      <svg width="0" height="0" style="position: absolute">
        <filter id="outline" x="-5%" y="-5%" width="110%" height="110%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="2.5" result="d" />
          <feComposite in="d" in2="SourceAlpha" operator="out" result="o" />
          <feFlood :flood-color="theme.outline" :flood-opacity="theme.outlineOpacity" />
          <feComposite in2="o" operator="in" />
        </filter>
      </svg>
      <!-- фоны всех тем лежат стопкой и плавно сменяют друг друга -->
      <div
        v-for="(t, key) in THEMES"
        :key="key"
        class="bg"
        :class="[{ on: theme === t }, t.overlay]"
        :style="{ background: themeBackground(t) }"
      ></div>
      <div v-if="bgImage" class="bg photo on" :style="{ backgroundImage: bgImage }"></div>

      <div class="frame">
        <!-- ШАПКА -->
        <header class="header">
          <div class="title">
            <div class="t1">Расписание</div>
            <div class="t2">уроков</div>
          </div>

          <nav class="tabs" @mousedown.stop>
            <button
              v-for="(t, i) in TABS"
              :key="t"
              class="tab"
              :class="{ active: i === tabIdx, wide: t === 'changes' }"
              :title="t === 'changes' ? 'Изменения в расписании' : t + '-е классы'"
              @click="goTab(i)"
            >
              <span class="fill" :style="i === tabIdx ? { transform: `scaleX(${progress})` } : null"></span>
              <span class="lbl">{{ t === 'changes' ? 'Изм.' : t }}</span>
            </button>
          </nav>

          <Transition name="fade" mode="out-in">
            <div :key="headerTitle" v-fit="isChanges ? 26 : 40" class="grade-title">{{ headerTitle }}</div>
          </Transition>
        </header>

        <!-- ОСНОВНАЯ ЧАСТЬ -->
        <main class="body">
          <section class="schedule" :style="sizes">
            <!-- после уроков — крупная плашка: календарь справа ещё показывает сегодняшний день, не перепутать -->
            <div v-if="shiftNote && !isChanges && afterLessons" class="after-note">
              Уроки закончились — расписание на <b>{{ DAY_ACC[dayKey] }}</b>
            </div>
            <div v-else-if="shiftNote && !isChanges" class="note">{{ shiftNote }}</div>
            <div v-if="editable && isChanges" class="date-bar" @mousedown.stop>
              <label>
                Изменения на:
                <input v-model="state.settings.changesDate" type="date" class="date-input" />
              </label>
              <button @click="setChangesDate(0)">сегодня</button>
              <button @click="setChangesDate(1)">завтра</button>
              <button v-if="state.settings.changesDate" @click="state.settings.changesDate = ''">без даты</button>
              <span v-if="staleChanges" class="stale">
                Эти изменения на {{ staleText }} — день прошёл, на экране они не показываются.
                <button @click="clearChanges()">Очистить</button>
              </span>
            </div>
            <Transition name="slide" mode="out-in">
              <div :key="tab + '-' + dayKey" class="columns">
                <EditColumn
                  v-for="c in columns"
                  :key="c.key"
                  :col-key="c.key"
                  :label="c.label"
                  :rows="c.rows"
                  :fields="c.fields"
                  :now-idx="isChanges ? -1 : nowIdx"
                  :next-idx="isChanges ? -1 : nextIdx"
                  @commit="commit"
                />
                <div v-if="!isChanges && !letters.length" class="empty-grade">
                  Для {{ grade }}-х классов не указаны буквы.<br />Добавьте их в настройках ⚙
                </div>
              </div>
            </Transition>
          </section>

          <CalendarPanel
            :today="now"
            :view-date="viewDate"
            :bell="bell"
            :interactive="editable"
            @mousedown.stop
            @pick="pickDate"
            @today="picked = null"
            @settings="ui.settingsOpen = true"
          />
        </main>
      </div>

      <SettingsModal v-if="editable && ui.settingsOpen" @mousedown.stop @close="ui.settingsOpen = false" />
    </div>
  </div>
</template>

<style scoped>
.viewport {
  position: absolute;
  inset: 0;
  overflow: hidden;
  transition: background 0.9s;
}
.stage {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1920px;
  height: 1080px;
  transform-origin: center center;
  overflow: hidden;
  user-select: none;
}

.bg {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 0.9s ease;
}
.bg.on {
  opacity: 1;
}
.bg.photo {
  inset: -40px;
  background-size: cover;
  background-position: center;
  filter: blur(10px);
  opacity: 0.35;
  mix-blend-mode: soft-light;
}
/* киберпанк: неоновая сетка */
.bg.cyber::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(0deg, rgba(0, 229, 255, 0.13) 0 2px, transparent 2px 64px),
    repeating-linear-gradient(90deg, rgba(255, 40, 120, 0.11) 0 2px, transparent 2px 64px);
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 55%, #000 100%);
  mask-image: linear-gradient(180deg, transparent 0%, #000 55%, #000 100%);
}
/* магия: мерцающие звёзды */
.bg.stars::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(2px 2px at 30px 40px, rgba(255, 255, 255, 0.95), transparent),
    radial-gradient(1.5px 1.5px at 120px 90px, rgba(255, 220, 255, 0.85), transparent),
    radial-gradient(2.5px 2.5px at 200px 160px, rgba(255, 255, 255, 0.9), transparent),
    radial-gradient(1.5px 1.5px at 260px 30px, rgba(230, 200, 255, 0.8), transparent),
    radial-gradient(2px 2px at 80px 220px, rgba(255, 255, 255, 0.75), transparent);
  background-size: 300px 260px;
  animation: twinkle 4s ease-in-out infinite;
}
@keyframes twinkle {
  50% {
    opacity: 0.35;
  }
}

.frame {
  position: absolute;
  inset: 30px;
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 22px;
  border-radius: 64px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.25);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.3),
    0 20px 60px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(3px);
}

/* ---------- шапка ---------- */
.header {
  flex: 0 0 150px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  padding: 0 44px 0 44px;
  border-radius: 46px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1));
  border: 1px solid var(--glass-border);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    0 10px 30px rgba(0, 0, 0, 0.16);
  text-shadow: var(--shadow-text);
}
.title {
  flex: 0 0 auto;
  text-transform: uppercase;
  line-height: 1;
}
.t1 {
  font-weight: 900;
  font-size: 56px;
  letter-spacing: 0.01em;
}
.t2 {
  margin-top: 6px;
  font-weight: 800;
  font-size: 30px;
  opacity: 0.9;
}

.tabs {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 10px;
  padding: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
  position: relative;
}
.tab {
  position: relative;
  overflow: hidden;
  width: 68px;
  height: 62px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: var(--text);
  font-weight: 900;
  font-size: 28px;
  cursor: pointer;
  text-shadow: var(--shadow-text);
  transition: background 0.2s, transform 0.2s;
}
.tab:hover {
  background: rgba(255, 255, 255, 0.26);
}
.tab.active {
  background: rgba(255, 250, 240, 0.35);
  transform: scale(1.06);
}
.tab .fill {
  position: absolute;
  inset: 0;
  background: rgba(255, 250, 240, 0.55);
  transform-origin: left center;
  transform: scaleX(0);
}
.tab .lbl {
  position: relative;
}
.tab.wide {
  width: 96px;
  font-size: 22px;
}
.tab.active .lbl {
  color: var(--tab-text);
  text-shadow: none;
}

.grade-title {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  text-align: right;
  font-weight: 900;
  font-size: 84px;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
  color: #fffaf0;
  text-shadow: var(--shadow-text);
}

/* ---------- основная часть ---------- */
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 22px;
}
.schedule {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.columns {
  flex: 1;
  display: flex;
  gap: 14px;
  min-height: 0;
}
.note {
  position: absolute;
  top: -18px;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 3;
  padding: 4px 18px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
  font-weight: 700;
  font-size: 16px;
  white-space: nowrap;
}
.after-note {
  flex: 0 0 auto;
  margin-bottom: 14px;
  padding: 12px 28px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid var(--glass-border);
  text-align: center;
  font-weight: 800;
  font-size: 38px;
  line-height: 1.2;
  text-transform: uppercase;
  white-space: nowrap;
  text-shadow: var(--shadow-text);
}
.after-note b {
  font-weight: 900;
  color: var(--accent);
}
.empty-grade {
  flex: 1;
  display: grid;
  place-items: center;
  text-align: center;
  border-radius: 46px;
  background: rgba(255, 255, 255, 0.1);
  font-weight: 800;
  font-size: 30px;
  line-height: 1.5;
  text-shadow: var(--shadow-text);
}

.date-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  font-weight: 800;
  font-size: 18px;
  white-space: nowrap;
  text-shadow: var(--shadow-text);
}
.date-bar button,
.date-input {
  padding: 6px 14px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  color: inherit;
  font: inherit;
  font-size: 16px;
  cursor: pointer;
  color-scheme: dark;
}
.date-bar .stale {
  margin-left: auto;
  padding: 6px 14px;
  white-space: normal;
  border-radius: 999px;
  background: #f2c744;
  color: #3a2c00;
  font-size: 15px;
  text-shadow: none;
}
.date-bar .stale button {
  margin-left: 8px;
  background: rgba(0, 0, 0, 0.18);
}

/* ---------- анимации ---------- */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.35s, transform 0.35s;
}
.fade-enter-from {
  opacity: 0;
  transform: translateY(-14px);
}
.fade-leave-to {
  opacity: 0;
  transform: translateY(14px);
}
.slide-enter-active,
.slide-leave-active {
  transition: opacity 0.4s, transform 0.4s;
}
.slide-enter-from {
  opacity: 0;
  transform: translateX(40px);
}
.slide-leave-to {
  opacity: 0;
  transform: translateX(-40px);
}
</style>
