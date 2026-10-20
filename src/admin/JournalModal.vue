<script setup>
// Окно «Журнал правок»: кто, когда и что поменял; «Вернуть как было до этой правки». Данные — GET /api/journal (server/journal.js).
import { computed, onMounted, reactive, ref } from 'vue'
import { can } from './auth.js'

const emit = defineEmits(['close'])

const AREAS = [
  { id: 'schedule', title: 'Расписание' },
  { id: 'playlist', title: 'Плейлист' },
  { id: 'decks', title: 'Колоды' },
  { id: 'media', title: 'Медиатека' },
  { id: 'system', title: 'Пользователи и копии' },
]
const areaTitle = (id) => AREAS.find((a) => a.id === id)?.title || id
const REVERTABLE = ['schedule', 'playlist', 'decks'] // право на раздел = его id

const items = ref([])
const people = ref([])
const more = ref(false)
const loading = ref(false)
const error = ref('')
const f = reactive({ area: '', user: '', day: '' })
const opened = reactive({}) // id → показан полный список
const ask = ref(null) // { entry, later, busy, error } — окно подтверждения отката
const doneText = ref('')

const pad = (n) => String(n).padStart(2, '0')
const fmt = (t) => {
  const d = new Date(t)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const timeOf = (t) => fmt(t).slice(6)
/** «14.10 18:05» или «14.10 18:05–18:19», если правки шли дольше минуты */
const when = (e) => (timeOf(e.until) !== timeOf(e.at) && fmt(e.until).slice(0, 5) === fmt(e.at).slice(0, 5) ? `${fmt(e.at)}–${timeOf(e.until)}` : fmt(e.at))

function query(extra = {}) {
  const q = new URLSearchParams()
  for (const k of ['area', 'user', 'day']) if (f[k]) q.set(k, f[k])
  for (const [k, v] of Object.entries(extra)) q.set(k, v)
  return q.toString()
}

async function load(append = false) {
  loading.value = true
  error.value = ''
  try {
    const before = append && items.value.length ? items.value[items.value.length - 1].at : ''
    const r = await fetch('/api/journal?' + query(before ? { before } : {}), { cache: 'no-store' })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Ошибка сервера (${r.status})`)
    const d = await r.json()
    items.value = append ? [...items.value, ...d.items] : d.items
    more.value = d.more
    if (d.people?.length) people.value = d.people
  } catch (e) {
    error.value = e.message || String(e)
  } finally {
    loading.value = false
  }
}
onMounted(() => load())

const canRevert = (e) => REVERTABLE.includes(e.area) && !!e.version && can(e.area)
const brief = (e) => {
  const s = e.summary || []
  return s.slice(0, 2).join('; ') + (s.length > 2 ? ` … (ещё ${s.length - 2})` : '')
}
const detailed = (e) => (e.summary || []).length > 2

async function startRevert(e) {
  ask.value = { entry: e, later: [], busy: false, error: '' }
  try {
    const r = await fetch(`/api/journal?area=${e.area}&since=${e.at}&limit=100`, { cache: 'no-store' })
    const d = await r.json()
    ask.value.later = d.items || []
  } catch {
    /* список «что пропадёт» не загрузился — сам откат всё равно возможен */
  }
}

async function doRevert() {
  const a = ask.value
  a.busy = true
  a.error = ''
  try {
    const r = await fetch(`/api/journal/${a.entry.id}/revert`, { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || `Ошибка сервера (${r.status})`)
    doneText.value = `${areaTitle(a.entry.area)} вернулось к состоянию на ${fmt(a.entry.at)}`
    ask.value = null
    await load()
  } catch (e) {
    a.error = e.message || String(e)
    a.busy = false
  }
}

const laterText = computed(() => (ask.value?.later || []).map((e) => `${fmt(e.at)} · ${e.name} · ${e.summary?.[0] || ''}`))
</script>

<template>
  <div class="a-modal-back" @mousedown.self="emit('close')">
    <div class="a-modal jr">
      <h2>Журнал правок</h2>
      <div class="filters">
        <select v-model="f.area" class="a-select" @change="load()">
          <option value="">Все разделы</option>
          <option v-for="a in AREAS" :key="a.id" :value="a.id">{{ a.title }}</option>
        </select>
        <select v-model="f.user" class="a-select" @change="load()">
          <option value="">Все люди</option>
          <option v-for="p in people" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <input v-model="f.day" type="date" class="a-input" title="Только этот день" @change="load()" />
        <button v-if="f.day" class="a-btn small" @click="((f.day = ''), load())">Все дни</button>
      </div>
      <p v-if="doneText" class="ok">{{ doneText }}</p>
      <p v-if="error" class="err">{{ error }}</p>
      <ul class="list">
        <li v-for="e in items" :key="e.id" class="rec" :class="{ sys: e.area === 'system' }">
          <div class="head">
            <span class="at">{{ when(e) }}</span>
            <b class="who">{{ e.name }}</b>
            <span class="area">{{ areaTitle(e.area) }}</span>
          </div>
          <div class="txt">
            <template v-if="opened[e.id]">
              <div v-for="(s, i) in e.summary" :key="i">{{ s }}</div>
            </template>
            <template v-else>{{ brief(e) }}</template>
          </div>
          <div class="acts">
            <button v-if="detailed(e)" class="a-link" @click="opened[e.id] = !opened[e.id]">{{ opened[e.id] ? 'Свернуть' : 'Подробнее' }}</button>
            <button v-if="canRevert(e)" class="a-btn small" @click="startRevert(e)">Вернуть как было до этой правки</button>
            <span v-else-if="e.area === 'media'" class="a-hint">без отката{{ /Удалён файл/.test(e.summary?.[0] || '') ? ' — удалённый файл можно вернуть только из резервной копии' : '' }}</span>
          </div>
        </li>
      </ul>
      <p v-if="!items.length && !loading && !error" class="a-hint">Записей нет.</p>
      <div class="foot">
        <button v-if="more" class="a-btn" :disabled="loading" @click="load(true)">Показать ещё</button>
        <span class="sp"></span>
        <button class="a-btn primary" @click="emit('close')">Закрыть</button>
      </div>
    </div>

    <div v-if="ask" class="a-modal-back inner" @mousedown.self="!ask.busy && (ask = null)">
      <div class="a-modal ask">
        <h2>Вернуть как было?</h2>
        <p>
          {{ areaTitle(ask.entry.area) }} вернётся к состоянию на <b>{{ fmt(ask.entry.at) }}</b> (до правки «{{ ask.entry.summary?.[0] }}»).
        </p>
        <template v-if="laterText.length">
          <p class="warn">Правки, сделанные после, тоже пропадут:</p>
          <ul class="later">
            <li v-for="(t, i) in laterText.slice(0, 8)" :key="i">{{ t }}</li>
            <li v-if="laterText.length > 8">и ещё {{ laterText.length - 8 }}</li>
          </ul>
        </template>
        <p class="a-hint">Сам откат тоже запишется в журнал, его можно будет отменить.</p>
        <p v-if="ask.error" class="err">{{ ask.error }}</p>
        <div class="foot">
          <span class="sp"></span>
          <button class="a-btn" :disabled="ask.busy" @click="ask = null">Отмена</button>
          <button class="a-btn primary" :disabled="ask.busy" @click="doRevert">{{ ask.busy ? 'Возвращаю…' : 'Вернуть' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.jr {
  width: 860px;
  min-height: 0;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  min-height: 120px;
}
.rec {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #272a31;
}
.rec.sys {
  background: #22252b;
  color: #b9bcc4;
}
.head {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: baseline;
}
.at {
  color: #9aa0ab;
  font-variant-numeric: tabular-nums;
}
.area {
  padding: 1px 8px;
  border-radius: 8px;
  background: #3b404a;
  font-size: 12px;
}
.txt {
  overflow-wrap: anywhere;
}
.acts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: center;
}
.foot {
  display: flex;
  gap: 8px;
  align-items: center;
}
.sp {
  flex: 1;
}
.ok {
  margin: 0;
  color: #4cc26a;
  font-weight: 700;
}
.err {
  margin: 0;
  color: #ff8a7a;
  font-weight: 700;
}
.warn {
  margin: 0;
  color: #e8b630;
  font-weight: 700;
}
.inner {
  z-index: 110;
}
.ask {
  width: 560px;
}
.ask p {
  margin: 0;
}
.later {
  margin: 0;
  padding-left: 18px;
  color: #c9ccd3;
  overflow: auto;
  max-height: 30vh;
}
@media (max-width: 900px) {
  .jr {
    width: 96vw;
  }
}
</style>
