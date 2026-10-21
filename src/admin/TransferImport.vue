<script setup>
// Окно «Загрузить из файла»: выбор zip → отправка на сервер → предпросмотр (ничего ещё не применено) → «Загрузить».
// Всё разбирает и применяет сервер (server/transfer.js); здесь только показ и выбор частей.
import { computed, onBeforeUnmount, ref } from 'vue'
import { can } from './auth.js'
import { plural } from '../bells.js'
import { fmtSize } from './mediaApi.js'
import { uploadTransfer, applyTransfer, transferProgress, cancelTransfer } from './transferApi.js'

const emit = defineEmits(['close'])

const step = ref('pick') // pick → sending → preview → applying → done
const error = ref('')
const progress = ref(0) // 0…1 — отправка файла
const copy = ref({ done: 0, total: 0 }) // копирование файлов на сервере
const info = ref(null) // ответ сервера: { token, name, manifest, preview }
const result = ref(null)
const input = ref(null)

const wantPlaylist = ref(true)
const mode = ref('replace')
const wantDecks = ref(true)
const wantSchedule = ref(false)

const pv = computed(() => info.value?.preview)
const pad = (n) => String(n).padStart(2, '0')
const when = (t) => {
  const d = new Date(t)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const from = computed(() => {
  const m = info.value?.manifest
  if (!m) return ''
  return `Сохранён ${m.createdAt ? when(m.createdAt) : '—'}${m.host ? ' на компьютере ' + m.host : ''}${m.app ? ', версия табло ' + m.app : ''}`
})
const files = computed(() => pv.value?.files)
const nothing = computed(() => !(wantPlaylist.value && can('playlist')) && !(wantDecks.value && pv.value?.decks && can('decks')) && !(wantSchedule.value && pv.value?.schedule && can('schedule')))
const canLoad = computed(() => step.value === 'preview' && !files.value?.noSpace && !nothing.value)

async function pick(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  error.value = ''
  progress.value = 0
  step.value = 'sending'
  try {
    info.value = await uploadTransfer(file, (p) => (progress.value = p))
    wantPlaylist.value = can('playlist')
    wantDecks.value = !!info.value.preview.decks && can('decks')
    wantSchedule.value = false
    step.value = 'preview'
  } catch (err) {
    error.value = err.message
    step.value = 'pick'
  }
}

let timer = 0
async function load() {
  error.value = ''
  step.value = 'applying'
  copy.value = { done: 0, total: files.value?.fresh || 0 }
  const token = info.value.token
  timer = setInterval(async () => {
    try {
      const p = (await transferProgress(token)).progress
      if (p) copy.value = { done: p.done, total: p.total }
    } catch {
      /* связь моргнула — следующий опрос */
    }
  }, 500)
  try {
    const r = await applyTransfer(token, { playlist: wantPlaylist.value && can('playlist'), playlistMode: mode.value, decks: wantDecks.value && !!pv.value.decks && can('decks'), schedule: wantSchedule.value && !!pv.value.schedule && can('schedule') })
    result.value = r.result
    info.value = null
    step.value = 'done'
  } catch (err) {
    error.value = err.message
    step.value = 'preview'
  }
  clearInterval(timer)
}

const doneText = computed(() => {
  const r = result.value
  if (!r) return ''
  const bits = []
  if (r.playlist) bits.push(r.playlist === 'add' ? 'новые слайды добавлены' : 'плейлист заменён')
  if (r.decks) bits.push('колоды загружены')
  if (r.schedule) bits.push('расписание заменено')
  bits.push(r.files ? `добавлено ${r.files} ${plural(r.files, 'файл', 'файла', 'файлов')}` : 'новых файлов не было')
  return 'Готово: ' + bits.join(', ')
})

function close() {
  if (step.value === 'applying') return
  if (info.value) cancelTransfer(info.value.token)
  emit('close')
}
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="a-modal-back" @mousedown.self="close">
    <div class="a-modal tr">
      <h2>Загрузить из файла</h2>

      <template v-if="step === 'pick'">
        <div class="small">Выберите файл, сохранённый кнопкой «Сохранить в файл» (tablo-….zip). Ничего не изменится, пока вы не нажмёте «Загрузить».</div>
        <div v-if="error" class="err">{{ error }}</div>
        <div class="row">
          <button class="a-btn primary" @click="input.click()">Выбрать файл…</button>
          <button class="a-btn" @click="close">Закрыть</button>
        </div>
        <input ref="input" type="file" accept=".zip" hidden @change="pick" />
      </template>

      <template v-else-if="step === 'sending'">
        <div>Отправляю файл на сервер и проверяю…</div>
        <div class="bar"><i :style="{ width: Math.round(progress * 100) + '%' }"></i></div>
        <div class="small">{{ Math.round(progress * 100) }}%</div>
      </template>

      <template v-else-if="step === 'preview' || step === 'applying'">
        <div class="from">{{ from }}</div>
        <div v-if="pv.skipped" class="warn">
          {{ pv.newer ? 'Файл из более новой версии табло: ' : '' }}{{ pv.skipped }} {{ plural(pv.skipped, 'слайд', 'слайда', 'слайдов') }} этой версией не {{ pv.skipped === 1 ? 'поддерживается' : 'поддерживаются' }} и будут пропущены.
        </div>
        <div v-if="pv.lost" class="warn">{{ pv.lost }} {{ plural(pv.lost, 'слайд', 'слайда', 'слайдов') }} без файла в архиве будут пропущены.</div>

        <div class="body">
          <section class="blk">
            <label class="a-check head"><input v-model="wantPlaylist" type="checkbox" :disabled="step === 'applying' || !can('playlist')" /> Плейлист ({{ pv.slides }} {{ plural(pv.slides, 'слайд', 'слайда', 'слайдов') }})<span v-if="!can('playlist')" class="small"> — нет прав</span></label>
            <template v-if="wantPlaylist && can('playlist')">
              <div class="seg">
                <button :class="{ on: mode === 'replace' }" :disabled="step === 'applying'" @click="mode = 'replace'">Заменить целиком</button>
                <button :class="{ on: mode === 'add' }" :disabled="step === 'applying'" @click="mode = 'add'">Добавить новые слайды</button>
              </div>
              <div v-if="pv.playlist.urgent && mode === 'replace'" class="bad">В файле включён срочный режим «{{ pv.playlist.urgent }}»</div>
              <ul class="lines"><li v-for="(l, i) in pv.playlist[mode]" :key="i">{{ l }}</li></ul>
            </template>
          </section>

          <section v-if="pv.decks" class="blk">
            <label class="a-check head"><input v-model="wantDecks" type="checkbox" :disabled="step === 'applying' || !can('decks')" /> Колоды ({{ pv.decks.count }})<span v-if="!can('decks')" class="small"> — нет прав</span></label>
            <ul v-if="wantDecks && can('decks')" class="lines"><li v-for="(l, i) in pv.decks.lines" :key="i">{{ l }}</li></ul>
            <div v-if="wantDecks && can('decks')" class="small">Школьные колоды, которых нет в файле, остаются.</div>
          </section>

          <section v-if="pv.schedule" class="blk">
            <label class="a-check head"><input v-model="wantSchedule" type="checkbox" :disabled="step === 'applying' || !can('schedule')" /> Расписание, изменения и звонки<span v-if="!can('schedule')" class="small"> — нет прав</span></label>
            <template v-if="wantSchedule && can('schedule')">
              <div class="bad">Расписание, изменения и звонки заменятся целиком.</div>
              <ul class="lines"><li v-for="(l, i) in pv.schedule.lines" :key="i">{{ l }}</li></ul>
            </template>
          </section>

          <section class="blk">
            <div class="head">Файлы</div>
            <div>
              Новых файлов: {{ files.fresh }}<template v-if="files.fresh"> ({{ fmtSize(files.freshBytes) }})</template>, уже есть в медиатеке: {{ files.have }}
            </div>
            <div v-if="files.noSpace" class="bad">Не хватает места на диске: свободно {{ fmtSize(files.free) }}, нужно {{ fmtSize(files.freshBytes) }} и ещё запас 500 МБ.</div>
          </section>
        </div>

        <template v-if="step === 'applying'">
          <div>Загружаю{{ copy.total ? ` файлы: ${copy.done} из ${copy.total}` : '…' }}</div>
          <div class="bar"><i :style="{ width: copy.total ? Math.round((copy.done / copy.total) * 100) + '%' : '100%' }" :class="{ busy: !copy.total }"></i></div>
        </template>
        <div v-if="error" class="err">{{ error }}</div>
        <div class="row">
          <button class="a-btn primary" :disabled="!canLoad" @click="load">Загрузить</button>
          <button class="a-btn" :disabled="step === 'applying'" @click="close">Отмена</button>
        </div>
      </template>

      <template v-else>
        <div class="ok">{{ doneText }}</div>
        <div class="small">Экраны обновятся сами. Если что-то пошло не так, загрузку можно отменить в «Журнале правок».</div>
        <div class="row"><button class="a-btn primary" @click="close">Закрыть</button></div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.tr {
  width: 680px;
  max-width: 96vw;
  gap: 10px;
}
.small {
  color: #8b909a;
  font-size: 12px;
}
.from {
  color: #c9ccd3;
  font-weight: 700;
}
.warn {
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(255, 194, 71, 0.16);
  border: 1px solid #ffc247;
  color: #ffd27a;
  font-weight: 700;
  font-size: 13px;
}
.bad {
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(229, 80, 63, 0.16);
  color: #ff8a7a;
  font-weight: 700;
  font-size: 13px;
}
.err {
  color: #ff8a7a;
  font-weight: 700;
}
.ok {
  color: #6fd08c;
  font-weight: 800;
  font-size: 16px;
}
.body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  max-height: 56vh;
}
.blk {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #22252b;
}
.head {
  font-weight: 800;
  color: #e6e8ec;
}
.lines {
  margin: 0;
  padding-left: 18px;
  color: #c9ccd3;
  font-size: 13px;
}
.seg {
  display: inline-flex;
  align-self: flex-start;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #3b404a;
}
.seg button {
  border: none;
  padding: 6px 12px;
  background: transparent;
  color: #a4a9b3;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.seg button.on {
  background: #3d7be0;
  color: #fff;
}
.seg button:disabled {
  cursor: default;
}
.bar {
  height: 10px;
  border-radius: 5px;
  background: #3b404a;
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: #3d7be0;
  transition: width 0.3s;
}
.bar i.busy {
  opacity: 0.5;
}
.row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
