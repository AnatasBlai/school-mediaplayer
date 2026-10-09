<script setup>
// Медиатека: загрузка фото и видео перетаскиванием, список файлов, названия, категории, удаление.
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onServerEvent } from '../store.js'
import {
  ACCEPT,
  prepareFile,
  uploadMedia,
  uploadThumb,
  listMedia,
  patchMedia,
  deleteMedia,
  mediaUrl,
  thumbUrl,
  fmtSize,
  fmtDuration,
} from './mediaApi.js'

const DEFAULT_CATEGORIES = ['Мероприятия', 'Образование']

const items = ref([])
const disk = ref(null)
const loadError = ref('')
const loaded = ref(false)

async function refresh() {
  try {
    const d = await listMedia()
    items.value = d.items
    disk.value = d.disk
    loadError.value = ''
  } catch (e) {
    loadError.value = e.message
  }
  loaded.value = true
}

// ---------- фильтры ----------
const filter = reactive({ type: 'all', category: '', q: '' })
const categories = computed(() => {
  const set = new Set(DEFAULT_CATEGORIES)
  for (const it of items.value) if (it.category) set.add(it.category)
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'))
})
const usedCategories = computed(() => categories.value.filter((c) => items.value.some((it) => it.category === c)))
const shown = computed(() => {
  const q = filter.q.trim().toLowerCase()
  return items.value.filter(
    (it) =>
      (filter.type === 'all' || it.type === filter.type) &&
      (!filter.category || it.category === filter.category) &&
      (!q || it.name.toLowerCase().includes(q)),
  )
})
const totalSize = computed(() => items.value.reduce((s, it) => s + it.size, 0))

// ---------- загрузка ----------
const uploadCategory = ref('')
const queue = reactive([]) // { key, name, status: wait|prep|up|done|error, progress, error }
let busy = false
let keySeq = 0

function addFiles(files) {
  for (const file of files) queue.push({ key: ++keySeq, file, name: file.name, status: 'wait', progress: 0, error: '' })
  processQueue()
}

async function processQueue() {
  if (busy) return
  busy = true
  for (let job = queue.find((j) => j.status === 'wait'); job; job = queue.find((j) => j.status === 'wait')) {
    try {
      job.status = 'prep'
      const prepared = await prepareFile(job.file)
      job.status = 'up'
      const item = await uploadMedia(prepared, uploadCategory.value.trim(), (p) => (job.progress = p))
      if (prepared.thumb) await uploadThumb(item.id, prepared.thumb).catch(() => {})
      job.status = 'done'
    } catch (e) {
      job.status = 'error'
      job.error = e.message
    }
    job.file = null // не держим файл в памяти
  }
  busy = false
  refresh()
}

const queueActive = computed(() => queue.some((j) => j.status !== 'done' && j.status !== 'error'))
function clearQueue() {
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].status === 'done' || queue[i].status === 'error') queue.splice(i, 1)
}
const jobText = (j) =>
  ({
    wait: 'В очереди',
    prep: 'Подготовка…',
    up: `Загрузка ${Math.round(j.progress * 100)}%`,
    done: 'Готово',
    error: j.error,
  })[j.status]

const fileInput = ref(null)
function onPick(e) {
  addFiles([...e.target.files])
  e.target.value = ''
}

// перетаскивание файлов в окно
const dragging = ref(false)
let dragDepth = 0
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files')
function onDragEnter(e) {
  if (!hasFiles(e)) return
  dragDepth++
  dragging.value = true
}
function onDragLeave() {
  if (--dragDepth <= 0) {
    dragDepth = 0
    dragging.value = false
  }
}
function onDrop(e) {
  dragDepth = 0
  dragging.value = false
  if (e.dataTransfer?.files?.length) addFiles([...e.dataTransfer.files])
}

// ---------- правка и удаление ----------
const errorMsg = ref('')
async function save(it, field, value) {
  value = value.trim()
  if (value === it[field] || (field === 'name' && !value)) return
  try {
    Object.assign(it, (await patchMedia(it.id, { [field]: value })).item)
  } catch (e) {
    errorMsg.value = e.message
  }
}

async function remove(it) {
  if (!confirm(`Удалить «${it.name}»? Файл будет удалён с сервера.`)) return
  try {
    await deleteMedia(it.id)
    items.value = items.value.filter((x) => x.id !== it.id)
    if (preview.value?.id === it.id) preview.value = null
  } catch (e) {
    errorMsg.value = e.message
  }
}

// ---------- просмотр ----------
const preview = ref(null)
function onKey(e) {
  if (e.key === 'Escape') preview.value = null
}

let off = []
onMounted(() => {
  refresh()
  off = [onServerEvent('media', refresh), onServerEvent('hello', refresh)]
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  off.forEach((f) => f())
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <section
    class="lib"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- панель инструментов -->
    <div class="toolbar">
      <button class="btn primary" @click="fileInput.click()">＋ Добавить файлы</button>
      <input ref="fileInput" type="file" multiple :accept="ACCEPT" hidden @change="onPick" />
      <label class="upcat">
        Категория для новых:
        <input v-model="uploadCategory" list="media-cats" placeholder="без категории" maxlength="40" />
      </label>

      <div class="spacer"></div>

      <div class="seg">
        <button :class="{ on: filter.type === 'all' }" @click="filter.type = 'all'">Все</button>
        <button :class="{ on: filter.type === 'image' }" @click="filter.type = 'image'">Фото</button>
        <button :class="{ on: filter.type === 'video' }" @click="filter.type = 'video'">Видео</button>
      </div>
      <input v-model="filter.q" class="search" type="search" placeholder="Поиск по названию" />
    </div>

    <div v-if="usedCategories.length" class="chips">
      <button class="chip" :class="{ on: !filter.category }" @click="filter.category = ''">Все категории</button>
      <button
        v-for="c in usedCategories"
        :key="c"
        class="chip"
        :class="{ on: filter.category === c }"
        @click="filter.category = filter.category === c ? '' : c"
      >
        {{ c }}
      </button>
    </div>

    <datalist id="media-cats">
      <option v-for="c in categories" :key="c" :value="c" />
    </datalist>

    <!-- очередь загрузки -->
    <div v-if="queue.length" class="queue">
      <div class="queue-head">
        <span>Загрузка файлов</span>
        <button v-if="!queueActive" class="link" @click="clearQueue">Скрыть</button>
      </div>
      <div v-for="j in queue" :key="j.key" class="job" :class="j.status">
        <span class="job-name">{{ j.name }}</span>
        <span class="job-status">{{ jobText(j) }}</span>
        <span v-if="j.status === 'up'" class="bar"><span :style="{ width: j.progress * 100 + '%' }"></span></span>
      </div>
    </div>

    <div v-if="errorMsg" class="alert" @click="errorMsg = ''">{{ errorMsg }} <span class="x">×</span></div>
    <div v-if="loadError" class="alert">Не удалось загрузить список: {{ loadError }}</div>

    <!-- сетка файлов -->
    <div v-if="loaded && !items.length" class="empty">
      Здесь пока пусто.<br />
      Перетащите фото и видео в это окно или нажмите «Добавить файлы».
      <small>Фото автоматически уменьшаются до размера экрана. Видео лучше загружать в MP4 (H.264).</small>
    </div>
    <div v-else-if="loaded && !shown.length" class="empty">Ничего не найдено</div>

    <div class="grid">
      <article v-for="it in shown" :key="it.id" class="card">
        <button class="thumb" :title="'Открыть ' + it.name" @click="preview = it">
          <img v-if="thumbUrl(it)" :src="thumbUrl(it)" alt="" loading="lazy" />
          <span v-else class="noimg">{{ it.type === 'video' ? '▶' : '' }}</span>
          <span v-if="it.type === 'video'" class="badge">▶ {{ fmtDuration(it.duration) }}</span>
        </button>
        <div class="info">
          <input
            class="name"
            :value="it.name"
            maxlength="120"
            title="Название — нажмите, чтобы изменить"
            @change="save(it, 'name', $event.target.value)"
            @keydown.enter="$event.target.blur()"
          />
          <input
            class="cat"
            :value="it.category"
            list="media-cats"
            placeholder="без категории"
            maxlength="40"
            @change="save(it, 'category', $event.target.value)"
            @keydown.enter="$event.target.blur()"
          />
          <div class="meta">
            <span>{{ it.w && it.h ? `${it.w}×${it.h}` : '' }}</span>
            <span>{{ fmtSize(it.size) }}</span>
            <button class="del" title="Удалить" @click="remove(it)">Удалить</button>
          </div>
        </div>
      </article>
    </div>

    <footer class="foot">
      Файлов: {{ items.length }} · {{ fmtSize(totalSize) }}
      <template v-if="disk"> · свободно на диске {{ fmtSize(disk.free) }}</template>
    </footer>

    <!-- перетаскивание -->
    <div v-if="dragging" class="drop">Отпустите файлы, чтобы загрузить их</div>

    <!-- просмотр -->
    <div v-if="preview" class="viewer" @click.self="preview = null">
      <img v-if="preview.type === 'image'" :src="mediaUrl(preview)" alt="" />
      <video v-else :src="mediaUrl(preview)" controls autoplay></video>
      <div class="viewer-cap">{{ preview.name }}</div>
      <button class="viewer-close" title="Закрыть (Esc)" @click="preview = null">×</button>
    </div>
  </section>
</template>

<style scoped>
.lib {
  position: relative;
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
  gap: 12px;
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
input {
  border: 1px solid #3b404a;
  border-radius: 8px;
  padding: 8px 10px;
  background: #15171b;
  color: #f2f2f2;
  font: inherit;
  font-weight: 600;
}
input:focus {
  outline: none;
  border-color: #3d7be0;
}
.upcat {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #a4a9b3;
  font-weight: 600;
}
.upcat input {
  width: 180px;
}
.search {
  width: 220px;
}
.seg {
  display: flex;
  padding: 3px;
  border-radius: 9px;
  background: #15171b;
}
.seg button {
  border: none;
  border-radius: 7px;
  padding: 6px 12px;
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
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  border: 1px solid #3b404a;
  border-radius: 999px;
  padding: 5px 12px;
  background: transparent;
  color: #c9ccd3;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.chip.on {
  border-color: #3d7be0;
  background: rgba(61, 123, 224, 0.2);
  color: #fff;
}

.queue {
  max-height: 180px;
  overflow: auto;
  border-radius: 10px;
  background: #26292f;
  padding: 8px 12px;
}
.queue-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  font-weight: 800;
}
.link {
  border: none;
  background: none;
  color: #7fb0ff;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.job {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 140px;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}
.job-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.job-status {
  color: #a4a9b3;
  font-weight: 600;
}
.job.done .job-status {
  color: #7fd18b;
}
.job.error {
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
}
.job.error .job-status {
  color: #ff8a7a;
}
.bar {
  height: 6px;
  border-radius: 3px;
  background: #15171b;
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: #3d7be0;
  transition: width 0.2s;
}
.alert {
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(255, 90, 70, 0.15);
  color: #ffb3a8;
  font-weight: 600;
  cursor: pointer;
}
.alert .x {
  float: right;
}

.empty {
  margin: 40px auto;
  text-align: center;
  color: #a4a9b3;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.6;
}
.empty small {
  display: block;
  margin-top: 8px;
  font-size: 13px;
  color: #7c818b;
}

.grid {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  align-content: start;
  gap: 14px;
  padding-right: 4px;
}
.card {
  border-radius: 12px;
  background: #26292f;
  overflow: hidden;
}
.thumb {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  padding: 0;
  border: none;
  background: #000;
  cursor: zoom-in;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.noimg {
  color: #666;
  font-size: 32px;
}
.badge {
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}
.info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
}
.info input {
  width: 100%;
  padding: 5px 8px;
  border-color: transparent;
  background: transparent;
}
.info input:hover {
  border-color: #3b404a;
}
.info input:focus {
  background: #15171b;
  border-color: #3d7be0;
}
.name {
  font-weight: 800 !important;
}
.cat {
  color: #a4a9b3 !important;
  font-size: 13px !important;
}
.meta {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px;
  color: #7c818b;
  font-size: 12px;
  font-weight: 600;
}
.del {
  margin-left: auto;
  border: none;
  background: none;
  color: #ff8a7a;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  opacity: 0.7;
}
.del:hover {
  opacity: 1;
}
.foot {
  color: #7c818b;
  font-size: 13px;
  font-weight: 600;
}

.drop {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  border: 3px dashed #3d7be0;
  border-radius: 14px;
  background: rgba(20, 30, 50, 0.85);
  color: #fff;
  font-size: 22px;
  font-weight: 800;
  pointer-events: none;
}

.viewer {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.88);
}
.viewer img,
.viewer video {
  max-width: 92vw;
  max-height: 84vh;
  border-radius: 8px;
  background: #000;
}
.viewer-cap {
  position: absolute;
  bottom: 24px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 16px;
  font-weight: 700;
}
.viewer-close {
  position: absolute;
  top: 16px;
  right: 20px;
  border: none;
  background: none;
  color: #fff;
  font-size: 40px;
  line-height: 1;
  cursor: pointer;
}
</style>
