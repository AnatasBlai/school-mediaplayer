<script setup>
// Окно «Резервная копия» (открывается из медиатеки): папка, частота, ход копирования, снимки и возврат из них.
// Копирует сервер (server/backup.js); при смене папки, если в старой уже есть копии, предлагаем их перенести.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onServerEvent } from '../store.js'
import { fmtSize } from './mediaApi.js'

const emit = defineEmits(['close'])

const PERIODS = [
  { k: 'off', t: 'Выключено' },
  { k: 'day', t: 'Раз в день' },
  { k: 'week', t: 'Раз в неделю' },
  { k: 'month', t: 'Раз в месяц' },
]

const st = ref(null) // GET /api/backup
const drives = ref([])
const dir = ref('')
const period = ref('off')
const check = ref(null) // POST /api/backup/check для введённой папки
const error = ref('')
const saving = ref(false)
const askMove = ref(false) // показать вопрос «перенести копии?»

async function call(method, url, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || d.ok === false) throw new Error(d.error || 'Ошибка ' + r.status)
  return d
}

let first = true
async function load() {
  try {
    st.value = await call('GET', '/api/backup')
    // поля формы заполняем один раз, дальше их правит пользователь
    if (first) {
      dir.value = st.value.dir
      period.value = st.value.period
      first = false
    }
  } catch (e) {
    error.value = e.message
  }
}

const dirty = computed(() => st.value && (dir.value.trim() !== st.value.dir || period.value !== st.value.period))
const dirChanged = computed(() => st.value && dir.value.trim().toLowerCase() !== st.value.dir.toLowerCase())
const oldHasBackup = computed(() => {
  const i = st.value?.info
  return !!(i?.ok && (i.snapshots.length || i.media.files))
})

async function doCheck() {
  error.value = ''
  check.value = null
  if (!dir.value.trim()) return
  try {
    check.value = await call('POST', '/api/backup/check', { dir: dir.value })
  } catch (e) {
    error.value = e.message
  }
}

function pickDrive(d) {
  dir.value = d.path + 'Бэкап табло'
  doCheck()
}

async function save(move) {
  error.value = ''
  if (move === undefined && dirChanged.value && st.value.dir && oldHasBackup.value && dir.value.trim()) {
    askMove.value = true
    return
  }
  askMove.value = false
  saving.value = true
  try {
    await call('PUT', '/api/backup', { dir: dir.value.trim(), period: period.value, move: !!move })
    first = true
    await load()
    check.value = null
  } catch (e) {
    error.value = e.message
  }
  saving.value = false
}

async function runNow() {
  error.value = ''
  try {
    await call('POST', '/api/backup/run')
  } catch (e) {
    error.value = e.message
  }
}

const fmtStamp = (name) => {
  const m = name.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})/)
  return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}` : name
}
const fmtAt = (ms) => (ms ? new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

async function restore(s) {
  if (!confirm(`Вернуть расписание, плейлист, медиатеку и колоды на ${fmtStamp(s.name)}?\n\nТекущие данные перед этим тоже сохранятся отдельным снимком — к ним можно будет вернуться.`)) return
  error.value = ''
  try {
    await call('POST', '/api/backup/restore', { name: s.name })
  } catch (e) {
    error.value = e.message
  }
}

const JOBS = { backup: 'Идёт копирование', move: 'Переносим копии в новую папку', restore: 'Возвращаем данные из снимка' }
const jobText = computed(() => {
  const j = st.value?.job
  if (!j) return ''
  return JOBS[j.kind] + (j.total ? `: ${j.done} из ${j.total} файлов` : '…')
})

let off = []
const onKey = (e) => e.key === 'Escape' && emit('close')
onMounted(async () => {
  load()
  off = [onServerEvent('backup', load)]
  window.addEventListener('keydown', onKey)
  try {
    drives.value = (await call('GET', '/api/backup/drives')).items
  } catch {
    /* не Windows или нет связи */
  }
})
onBeforeUnmount(() => {
  off.forEach((f) => f())
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="a-modal-back" @mousedown.self="emit('close')">
    <div class="a-modal backup">
      <div class="head">
        <h2>Резервная копия</h2>
        <span class="a-hint">Копируются данные (расписание, плейлист, медиатека, колоды) и все фото и видео</span>
        <button class="a-btn" @click="emit('close')">Закрыть</button>
      </div>

      <div v-if="!st" class="a-hint">Загрузка…</div>
      <template v-else>
        <!-- настройки -->
        <section class="box">
          <span class="a-label">Папка для копий</span>
          <div class="row">
            <input v-model="dir" class="a-input path" placeholder="Например: D:\Бэкап табло" @change="doCheck" @keydown.enter="doCheck" />
            <button class="a-btn" :disabled="!dir.trim()" @click="doCheck">Проверить</button>
          </div>
          <div v-if="drives.length" class="drives">
            <span class="a-hint">Диски:</span>
            <button v-for="d in drives" :key="d.path" class="a-btn small" @click="pickDrive(d)">
              {{ d.path }} <span class="free">свободно {{ fmtSize(d.free || 0) }}</span>
            </button>
          </div>
          <div v-if="check" class="check" :class="{ bad: !check.ok }">
            <template v-if="!check.ok">{{ check.error }}</template>
            <template v-else>
              {{ check.exists ? 'Папка есть' : 'Папки пока нет — она будет создана' }}
              <template v-if="check.space"> · свободно {{ fmtSize(check.space.free) }}</template>
              <template v-if="check.hasBackup">
                · там уже есть копии: снимков {{ check.snapshots.length }}, файлов медиатеки {{ check.media.files }}
                ({{ fmtSize(check.media.bytes) }})
              </template>
            </template>
          </div>
          <p class="a-hint">
            Лучше другой диск или флешка, чем диск C: — если диск с табло сломается, копия уцелеет.
            Сетевые папки при автозапуске сервера могут быть недоступны.
          </p>

          <span class="a-label">Как часто</span>
          <div class="a-seg">
            <button v-for="p in PERIODS" :key="p.k" :class="{ on: period === p.k }" @click="period = p.k">{{ p.t }}</button>
          </div>

          <!-- перенос копий при смене папки -->
          <div v-if="askMove" class="ask">
            В старой папке <b>{{ st.dir }}</b> уже есть копии (снимков {{ st.info.snapshots.length }}, файлов медиатеки
            {{ st.info.media.files }}, {{ fmtSize(st.info.media.bytes) }}). Перенести их в новую папку?
            <div class="row">
              <button class="a-btn primary" @click="save(true)">Перенести</button>
              <button class="a-btn" @click="save(false)">Оставить в старой</button>
              <button class="a-btn" @click="askMove = false">Отмена</button>
            </div>
          </div>
          <div v-else class="row">
            <button class="a-btn primary" :disabled="!dirty || saving" @click="save()">Сохранить</button>
            <span v-if="dirty" class="a-hint">есть несохранённые изменения</span>
          </div>
        </section>

        <!-- состояние -->
        <section class="box">
          <div class="row">
            <div class="status">
              <div v-if="jobText" class="job">{{ jobText }}</div>
              <template v-else>
                <div v-if="st.last && !st.last.ok" class="bad">Последняя попытка {{ fmtAt(st.last.at) }} не удалась: {{ st.last.error }}</div>
                <div>
                  Последняя копия: <b>{{ fmtAt(st.lastAt) }}</b>
                  <template v-if="st.last?.ok"> · скопировано новых файлов: {{ st.last.copied }} ({{ fmtSize(st.last.bytes) }})</template>
                </div>
                <div v-if="st.period !== 'off' && st.dir">Следующая: {{ st.next <= Date.now() ? 'в ближайшие минуты' : fmtAt(st.next) }}</div>
                <div v-else class="a-hint">Автоматические копии выключены</div>
                <div v-if="st.lastError" class="bad">Не получилось: {{ st.lastError.error }}</div>
              </template>
            </div>
            <span class="spacer"></span>
            <button class="a-btn primary" :disabled="!st.dir || !!st.job || dirty" @click="runNow">Сделать копию сейчас</button>
          </div>
          <div v-if="st.info?.ok && st.info.exists" class="a-hint">
            В папке: снимков данных {{ st.info.snapshots.length }}, файлов медиатеки {{ st.info.media.files }} ({{ fmtSize(st.info.media.bytes) }})
            <template v-if="st.info.space"> · свободно на диске {{ fmtSize(st.info.space.free) }}</template>
          </div>
        </section>

        <!-- снимки -->
        <section v-if="st.info?.snapshots?.length" class="box snaps">
          <span class="a-label">Снимки данных (хранятся последние 30)</span>
          <div class="snap-list">
            <div v-for="s in st.info.snapshots" :key="s.name" class="snap">
              <span class="snap-date">{{ fmtStamp(s.name) }}</span>
              <span v-if="s.name.includes('before-restore')" class="a-hint">перед возвратом</span>
              <span class="spacer"></span>
              <button class="a-btn small" :disabled="!!st.job" @click="restore(s)">Вернуть</button>
            </div>
          </div>
        </section>

        <div v-if="error" class="err">{{ error }}</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.backup {
  width: min(860px, 96vw);
  overflow: auto;
}
.head {
  display: flex;
  align-items: center;
  gap: 14px;
}
.head h2 {
  white-space: nowrap;
}
.head .a-hint {
  margin-right: auto;
}
.box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-radius: 12px;
  background: #26292f;
}
.box > .a-label:not(:first-child) {
  margin-top: 6px;
}
.row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.path {
  flex: 1;
  min-width: 260px;
  font-size: 15px;
}
.drives {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.free {
  color: #a4a9b3;
  font-weight: 600;
}
.check {
  padding: 8px 10px;
  border-radius: 8px;
  background: #1f3325;
  color: #a9e3b4;
  font-weight: 600;
}
.check.bad,
.bad {
  color: #ff9a8a;
}
.check.bad {
  background: #3a2422;
}
.ask {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #3d7be0;
  background: #22283a;
  line-height: 1.45;
}
.status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  line-height: 1.4;
}
.job {
  color: #8db4ff;
  font-weight: 800;
}
.spacer {
  flex: 1;
}
.snap-list {
  max-height: 220px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.snap {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px;
  border-radius: 6px;
  background: #1d1f24;
}
.snap-date {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.err {
  padding: 8px 12px;
  border-radius: 8px;
  background: #3a2422;
  color: #ff9a8a;
  font-weight: 700;
}
</style>
