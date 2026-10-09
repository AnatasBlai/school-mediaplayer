<script setup>
// Плейлист (/admin#playlist): что и в каком порядке показывает экран. Правки сохраняются сами.
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { state, GRADES } from '../store.js'
import { playlist, playlistLoaded, media, mediaById, makeSlide, startPlaylist, SLIDE_TITLES } from '../playlist.js'
import { thumbUrl, fmtDuration } from './mediaApi.js'

startPlaylist()

const items = computed(() => playlist.items)

// ---------- описание слайда ----------
function fileOf(it) {
  return it.media ? mediaById(it.media) : null
}
function titleOf(it) {
  if (it.type === 'schedule') {
    const gs = it.grades?.length ? it.grades : null
    return gs ? 'Расписание: ' + gs.join(', ') + ' кл.' : 'Расписание: все параллели'
  }
  if (it.type === 'changes') return 'Изменения в расписании'
  return fileOf(it)?.name || 'Файл удалён'
}
/** Сколько секунд идёт слайд (для итога); видео — по длине файла. */
function secondsOf(it) {
  if (it.type === 'schedule') {
    const gs = (it.grades?.length ? it.grades : GRADES).filter((g) => (state.settings.letters[g] || []).length)
    return gs.length * it.duration
  }
  if (it.type === 'video') return Math.round(fileOf(it)?.duration || 0)
  return it.duration
}
const total = computed(() => items.value.filter((it) => it.on).reduce((s, it) => s + secondsOf(it), 0))
const enabledCount = computed(() => items.value.filter((it) => it.on).length)

function fmtTotal(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m ? `${m} мин ${s} с` : `${s} с`
}

// ---------- правка ----------
function setDuration(it, v) {
  it.duration = Math.min(3600, Math.max(3, Math.round(Number(v)) || it.duration))
}
function toggleGrade(it, g) {
  // пустой список = все параллели
  const cur = it.grades?.length ? [...it.grades] : [...GRADES]
  const i = cur.indexOf(g)
  if (i >= 0) cur.splice(i, 1)
  else cur.push(g)
  const sorted = GRADES.filter((x) => cur.includes(x))
  if (!sorted.length) return // хотя бы одна параллель
  it.grades = sorted.length === GRADES.length ? [] : sorted
}
const gradeOn = (it, g) => !it.grades?.length || it.grades.includes(g)

function remove(i) {
  playlist.items.splice(i, 1)
}
function moveBy(i, d) {
  const j = i + d
  if (j < 0 || j >= playlist.items.length) return
  const [it] = playlist.items.splice(i, 1)
  playlist.items.splice(j, 0, it)
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

// ---------- добавление ----------
function addBoard(type) {
  playlist.items.push(makeSlide(type))
}

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
    <div class="toolbar">
      <button class="btn primary" @click="openPicker">＋ Фото или видео</button>
      <button class="btn" @click="addBoard('schedule')">＋ Расписание</button>
      <button class="btn" @click="addBoard('changes')">＋ Изменения</button>
      <div class="spacer"></div>
      <div class="sum">
        Включено слайдов: {{ enabledCount }} из {{ items.length }} · полный круг ≈ {{ fmtTotal(total) }}
      </div>
    </div>

    <p class="help">
      Экран показывает включённые слайды сверху вниз и начинает сначала. Порядок меняется перетаскиванием за ⋮⋮ или
      стрелками. Изменения сразу уходят на экраны.
    </p>

    <div v-if="playlistLoaded && !items.length" class="empty">
      Плейлист пуст — экран показывает расписание.<br />Добавьте слайды кнопками выше.
    </div>

    <ol class="list">
      <li
        v-for="(it, i) in items"
        :key="it.id"
        class="row"
        :class="{ off: !it.on, over: dragOver === i && dragFrom !== i, dragging: dragFrom === i, missing: it.media && !fileOf(it) }"
        @dragover.prevent="onDragOverRow(i)"
        @drop.prevent="onDropRow(i)"
      >
        <span class="handle" draggable="true" title="Перетащите, чтобы изменить порядок" @dragstart="onDragStart(i, $event)" @dragend="onDragEnd">⋮⋮</span>
        <span class="num">{{ i + 1 }}</span>

        <div class="thumb" :class="it.type">
          <img v-if="fileOf(it) && thumbUrl(fileOf(it))" :src="thumbUrl(fileOf(it))" alt="" />
          <span v-else-if="it.type === 'schedule'">5–11</span>
          <span v-else-if="it.type === 'changes'">Изм.</span>
          <span v-else-if="!fileOf(it)">?</span>
          <span v-if="it.type === 'video'" class="badge">▶</span>
        </div>

        <div class="main">
          <div class="title">{{ titleOf(it) }}</div>
          <div class="kind">{{ SLIDE_TITLES[it.type] }}</div>

          <!-- настройки по типу слайда -->
          <div class="opts">
            <template v-if="it.type === 'schedule'">
              <span class="grades">
                <button v-for="g in GRADES" :key="g" :class="{ on: gradeOn(it, g) }" @click="toggleGrade(it, g)">{{ g }}</button>
              </span>
            </template>
            <label v-if="it.type === 'changes'" class="check">
              <input v-model="it.skipEmpty" type="checkbox" /> пропускать, если изменений нет
            </label>
            <span v-if="it.type === 'image' || it.type === 'video'" class="seg">
              <button :class="{ on: it.fit !== 'contain' }" title="Растянуть на весь экран, края могут обрезаться" @click="it.fit = 'cover'">
                На весь экран
              </button>
              <button :class="{ on: it.fit === 'contain' }" title="Показать целиком, по краям — размытый фон" @click="it.fit = 'contain'">
                Целиком
              </button>
            </span>
            <label v-if="it.type === 'video'" class="check">
              <input v-model="it.sound" type="checkbox" /> со звуком
            </label>
          </div>
        </div>

        <div class="dur">
          <template v-if="it.type === 'video'">
            <span class="dur-video">до конца</span>
            <span class="dur-note">{{ fmtDuration(fileOf(it)?.duration) }}</span>
          </template>
          <template v-else>
            <input
              type="number"
              min="3"
              max="3600"
              :value="it.duration"
              @change="setDuration(it, $event.target.value)"
              @keydown.enter="$event.target.blur()"
            />
            <span class="dur-note">{{ it.type === 'schedule' ? 'сек. на параллель' : 'сек.' }}</span>
          </template>
        </div>

        <label class="switch" :title="it.on ? 'Выключить (слайд останется в списке)' : 'Включить'">
          <input v-model="it.on" type="checkbox" />
          <span></span>
        </label>

        <div class="acts">
          <button title="Выше" :disabled="i === 0" @click="moveBy(i, -1)">↑</button>
          <button title="Ниже" :disabled="i === items.length - 1" @click="moveBy(i, 1)">↓</button>
          <button class="del" title="Убрать из плейлиста (файл останется в медиатеке)" @click="remove(i)">✕</button>
        </div>
      </li>
    </ol>

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
.pl {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  font-size: 14px;
}
.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.spacer {
  flex: 1;
}
.sum {
  color: #c9ccd3;
  font-weight: 700;
}
.help {
  margin: 0;
  color: #8b909a;
  font-weight: 600;
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
  gap: 8px;
}
.row {
  display: grid;
  grid-template-columns: 22px 26px 128px minmax(0, 1fr) 150px 52px 110px;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #26292f;
  border: 2px solid transparent;
}
.row.off {
  opacity: 0.5;
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
  width: 128px;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: #000;
  color: #fff;
  font-weight: 900;
  font-size: 20px;
}
.thumb.schedule {
  background: linear-gradient(135deg, #f0a32a, #c45a10);
}
.thumb.changes {
  background: linear-gradient(135deg, #6b4a2b, #3f7a3a);
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
  font-weight: 800;
  font-size: 15px;
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
.opts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  margin-top: 4px;
}
.grades {
  display: flex;
  gap: 4px;
}
.grades button {
  min-width: 34px;
  border: 1px solid #3b404a;
  border-radius: 7px;
  padding: 3px 6px;
  background: transparent;
  color: #7c818b;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
.grades button.on {
  border-color: #3d7be0;
  background: rgba(61, 123, 224, 0.25);
  color: #fff;
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
.check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #c9ccd3;
  font-weight: 600;
  cursor: pointer;
}
.check input {
  accent-color: #3d7be0;
}
.dur {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dur input {
  width: 80px;
  border: 1px solid #3b404a;
  border-radius: 8px;
  padding: 6px 8px;
  background: #15171b;
  color: #f2f2f2;
  font: inherit;
  font-weight: 700;
}
.dur input:focus {
  outline: none;
  border-color: #3d7be0;
}
.dur-video {
  font-weight: 800;
}
.dur-note {
  color: #7c818b;
  font-size: 12px;
  font-weight: 600;
}

/* переключатель вкл/выкл */
.switch {
  position: relative;
  width: 44px;
  height: 24px;
  cursor: pointer;
}
.switch input {
  position: absolute;
  opacity: 0;
}
.switch span {
  position: absolute;
  inset: 0;
  border-radius: 12px;
  background: #4a505c;
  transition: background 0.2s;
}
.switch span::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;
}
.switch input:checked + span {
  background: #3fae5a;
}
.switch input:checked + span::after {
  transform: translateX(20px);
}
.switch input:focus-visible + span {
  outline: 2px solid #3d7be0;
}

.acts {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}
.acts button {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: #31353d;
  color: #c9ccd3;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
}
.acts button:hover:not(:disabled) {
  background: #3b404a;
  color: #fff;
}
.acts button:disabled {
  opacity: 0.3;
  cursor: default;
}
.acts .del:hover {
  background: rgba(255, 90, 70, 0.25);
  color: #ff8a7a;
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
