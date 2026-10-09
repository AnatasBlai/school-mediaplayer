<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  state,
  GRADES,
  getLessons,
  setLessonField,
  getChanges,
  setChangeField,
  hasChanges,
  maxLessonOfDay,
  loadData,
  pollRemote,
  saveStatus,
} from './store.js'
import { ui, clearSelection } from './ui.js'
import { THEMES, themeBackground } from './themes.js'
import { bellsForDay, bellStatus } from './bells.js'
import { vFit } from './fit.js'
import EditColumn from './components/EditColumn.vue'
import CalendarPanel from './components/CalendarPanel.vue'
import SettingsModal from './components/SettingsModal.vue'

// ---------- масштабирование «табло» 1920×1080 под любой экран ----------
const W = 1920
const H = 1080
const scale = ref(1)
function fit() {
  scale.value = Math.min(window.innerWidth / W, window.innerHeight / H)
}

// ---------- фон: если положить public/background.jpg, он подхватится ----------
const bgImage = ref('')
const probe = new Image()
probe.onload = () => (bgImage.value = `url("${probe.src}")`)
probe.src = '/background.jpg'

// ---------- время и выбранный день ----------
const now = ref(new Date())
const picked = ref(null) // null — показываем сегодня
const viewDate = computed(() => picked.value || now.value)
const dayKey = computed(() => {
  const d = viewDate.value.getDay()
  return d === 0 ? 1 : d // в воскресенье показываем понедельник
})
const isSunday = computed(() => viewDate.value.getDay() === 0)
const viewingToday = computed(() => !picked.value)
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
const nowIdx = computed(() => (viewingToday.value && bell.value.kind === 'lesson' ? bell.value.bell.n - 1 : -1))
const nextIdx = computed(() =>
  viewingToday.value && (bell.value.kind === 'break' || bell.value.kind === 'before') && bell.value.left <= 15
    ? bell.value.bell.n - 1
    : -1,
)

// ---------- вкладки и автолистание ----------
const TABS = [...GRADES, 'changes']
const tabIdx = ref(0)
const tab = computed(() => TABS[tabIdx.value])
const isChanges = computed(() => tab.value === 'changes')
const grade = computed(() => (isChanges.value ? '' : tab.value))
const letters = computed(() => (isChanges.value ? [] : state.settings.letters[grade.value] || []))
const theme = computed(() => THEMES[tab.value] || THEMES[5])
const tabSeconds = computed(() => (isChanges.value ? state.settings.changesInterval : state.settings.interval))
const elapsed = ref(0)
const paused = computed(() => !state.settings.autoplay || !!ui.sel || ui.settingsOpen)
const progress = computed(() => Math.min(1, elapsed.value / (tabSeconds.value * 1000)))

function inRotation(t) {
  if (t !== 'changes') return true
  if (!state.settings.changesInRotation) return false
  return !state.settings.changesHideEmpty || hasChanges()
}

function goTab(i) {
  if (ui.editing) commit()
  clearSelection()
  tabIdx.value = (i + TABS.length) % TABS.length
  elapsed.value = 0
  lastInteraction = Date.now()
}

function nextTab() {
  for (let k = 1; k <= TABS.length; k++) {
    const i = (tabIdx.value + k) % TABS.length
    if (inRotation(TABS[i])) {
      tabIdx.value = i
      break
    }
  }
  elapsed.value = 0
}

let lastTick = performance.now()
function tick() {
  const t = performance.now()
  const dt = t - lastTick
  lastTick = t
  if (!paused.value) {
    elapsed.value += dt
    if (elapsed.value >= tabSeconds.value * 1000) nextTab()
  }
}
watch(tabSeconds, () => (elapsed.value = 0))

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
    return Array.from({ length: n }, (_, i) => ({
      key: 'ch' + i,
      label: '',
      rows: getChanges('ch' + i),
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
  const cellH = Math.min(60, Math.max(36, (isChanges.value ? 740 : 610) / (n + 0.24 * (n - 1))))
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

const headerTitle = computed(() => (isChanges.value ? 'Изменения' : `${grade.value} классы`))

// ---------- жизненный цикл ----------
let clockTimer, tickTimer, pollTimer
onMounted(async () => {
  fit()
  window.addEventListener('resize', fit)
  window.addEventListener('keydown', onKey)
  await loadData()
  clockTimer = setInterval(() => {
    now.value = new Date()
    // через 5 минут без действий табло возвращается к сегодняшнему дню
    if (picked.value && Date.now() - lastInteraction > 5 * 60 * 1000 && !ui.sel) picked.value = null
  }, 1000)
  tickTimer = setInterval(tick, 100)
  pollTimer = setInterval(() => {
    if (!ui.sel && !ui.settingsOpen) pollRemote()
  }, 20000)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', fit)
  window.removeEventListener('keydown', onKey)
  clearInterval(clockTimer)
  clearInterval(tickTimer)
  clearInterval(pollTimer)
})

const statusText = computed(
  () => ({ saving: 'Сохранение…', saved: 'Сохранено', offline: 'Нет связи с сервером — правки только в этом браузере' })[saveStatus.value] || '',
)
</script>

<template>
  <div class="viewport" :style="{ background: theme.base }">
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
              :class="{ active: i === tabIdx, wide: t === 'changes', skipped: !inRotation(t) }"
              :title="t === 'changes' ? 'Изменения в расписании' : t + '-е классы'"
              @click="goTab(i)"
            >
              <span class="fill" :style="i === tabIdx ? { transform: `scaleX(${progress})` } : null"></span>
              <span class="lbl">{{ t === 'changes' ? 'Изм.' : t }}</span>
            </button>
          </nav>

          <Transition name="fade" mode="out-in">
            <div :key="tab" v-fit="40" class="grade-title">{{ headerTitle }}</div>
          </Transition>
        </header>

        <!-- ОСНОВНАЯ ЧАСТЬ -->
        <main class="body">
          <section class="schedule" :style="sizes">
            <div v-if="isSunday && !isChanges" class="note">Воскресенье — показано расписание на понедельник</div>
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
            @mousedown.stop
            @pick="pickDate"
            @today="picked = null"
            @settings="ui.settingsOpen = true"
          />
        </main>
      </div>

      <div v-if="statusText && (saveStatus === 'offline' || ui.sel)" class="status" :class="saveStatus">{{ statusText }}</div>

      <SettingsModal v-if="ui.settingsOpen" @mousedown.stop @close="ui.settingsOpen = false" />
    </div>
  </div>
</template>

<style scoped>
.viewport {
  position: fixed;
  inset: 0;
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
.tab.skipped:not(.active) {
  opacity: 0.55;
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

.status {
  position: absolute;
  left: 50%;
  bottom: 8px;
  transform: translateX(-50%);
  padding: 4px 16px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
  font-size: 14px;
  font-weight: 700;
}
.status.offline {
  background: rgba(150, 30, 10, 0.75);
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
