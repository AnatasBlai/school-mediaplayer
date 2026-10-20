<script setup>
// Окно «Что изменится, если вернуть снимок»: сравнение снимка с текущими данными и выбор, что вернуть.
// Сравнивает src/dataDiff.js; возвращает сервер (POST /api/backup/restore { name, files }).
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { diffSchedule, diffPlaylist, diffDecks, diffMedia } from '../dataDiff.js'

const props = defineProps({ name: String, title: String }) // title — «14.10.2026 18:00»
const emit = defineEmits(['close', 'restored'])

const loading = ref(true)
const error = ref('')
const sections = ref([]) // { file, title, inSnap, lines, on }
const busy = ref(false)

async function getJson(url) {
  const r = await fetch(url)
  if (r.status === 404) return null
  const d = await r.json().catch(() => null)
  if (!r.ok) throw new Error(d?.error || 'Ошибка ' + r.status)
  return d
}

async function load() {
  try {
    const snap = (f) => getJson(`/api/backup/snapshot/${encodeURIComponent(props.name)}/${f}`)
    const [sSched, sPlay, sDecks, sMedia, cSched, cPlay, cDecks, cMedia, mirror] = await Promise.all([
      snap('schedule.json'), snap('playlist.json'), snap('decks.json'), snap('media.json'),
      getJson('/api/data'), getJson('/api/playlist'), getJson('/api/decks'), getJson('/api/media'),
      getJson('/api/backup/mirror').catch(() => null),
    ])
    // названия для слайдов — из обеих медиатек и обоих наборов колод
    const dict = { media: {}, decks: {} }
    for (const m of [...(sMedia?.items || []), ...(cMedia?.items || [])]) dict.media[m.id] = m.name
    for (const d of [...(sDecks?.decks || []), ...(cDecks?.decks || [])]) dict.decks[d.id] = d.name
    const mk = (file, title, inSnap, lines) => ({ file, title, inSnap, lines: inSnap ? lines : [], on: inSnap && lines.length > 0 })
    sections.value = [
      mk('schedule.json', 'Расписание', !!sSched, sSched ? diffSchedule(cSched, sSched) : []),
      mk('playlist.json', 'Плейлист', !!sPlay, sPlay ? diffPlaylist(cPlay, sPlay, dict) : []),
      mk('decks.json', 'Колоды', !!sDecks, sDecks ? diffDecks(cDecks, sDecks) : []),
      mk('media.json', 'Медиатека', !!sMedia, sMedia ? diffMedia(cMedia, sMedia, mirror ? new Set(mirror.files) : null) : []),
    ]
  } catch (e) {
    error.value = e.message
  }
  loading.value = false
}

const chosen = computed(() => sections.value.filter((s) => s.on))

async function restore() {
  const list = chosen.value
  if (!list.length) return
  if (!confirm(`Вернуть из снимка от ${props.title}: ${list.map((s) => s.title.toLowerCase()).join(', ')}?\n\nТекущие данные перед этим сохранятся отдельным снимком «перед возвратом».`)) return
  busy.value = true
  error.value = ''
  try {
    const r = await fetch('/api/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: props.name, files: list.map((s) => s.file) }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || d.ok === false) throw new Error(d.error || 'Ошибка ' + r.status)
    emit('restored')
  } catch (e) {
    error.value = e.message
  }
  busy.value = false
}

const onKey = (e) => e.key === 'Escape' && emit('close')
onMounted(() => {
  load()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="a-modal-back" @mousedown.self="emit('close')">
    <div class="a-modal preview">
      <div class="head">
        <h2>Что изменится, если вернуть снимок от {{ title }}</h2>
        <button class="a-btn" @click="emit('close')">Закрыть</button>
      </div>
      <div v-if="loading" class="a-hint">Сравниваем…</div>
      <template v-else>
        <section v-for="s in sections" :key="s.file" class="box" :class="{ off: !s.inSnap || !s.lines.length }">
          <label class="a-check">
            <input v-model="s.on" type="checkbox" :disabled="!s.inSnap || !s.lines.length" />
            <b>{{ s.title }}</b>
          </label>
          <div v-if="!s.inSnap" class="a-hint">В этом снимке такого файла нет</div>
          <div v-else-if="!s.lines.length" class="a-hint">Совпадает с текущими данными</div>
          <ul v-else>
            <li v-for="(l, i) in s.lines" :key="i">{{ l }}</li>
          </ul>
        </section>
        <div v-if="error" class="err">{{ error }}</div>
        <div class="row">
          <button class="a-btn primary" :disabled="!chosen.length || busy" @click="restore">Вернуть отмеченное</button>
          <span class="a-hint">Всё остальное останется как сейчас</span>
        </div>
      </template>
      <div v-if="loading && error" class="err">{{ error }}</div>
    </div>
  </div>
</template>

<style scoped>
.preview {
  width: min(760px, 96vw);
  max-height: 90vh;
  overflow: auto;
}
.head {
  display: flex;
  align-items: center;
  gap: 14px;
}
.head h2 {
  margin-right: auto;
}
.box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #26292f;
}
.box.off {
  opacity: 0.7;
}
ul {
  margin: 0;
  padding-left: 20px;
  line-height: 1.5;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.err {
  padding: 8px 12px;
  border-radius: 8px;
  background: #3a2422;
  color: #ff9a8a;
  font-weight: 700;
}
</style>
