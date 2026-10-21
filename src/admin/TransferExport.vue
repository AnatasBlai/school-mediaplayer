<script setup>
// Окно «Сохранить в файл»: плейлист (всегда), колоды, расписание, все файлы медиатеки → один zip.
// Сколько попадёт в файл, считает сервер (/api/transfer/estimate) по тем же правилам, что и выгрузка.
import { computed, onMounted, ref, watch } from 'vue'
import { can } from './auth.js'
import { playlist } from '../playlist.js'
import { plural } from '../bells.js'
import { fmtSize } from './mediaApi.js'
import { estimateTransfer, exportUrl } from './transferApi.js'

const emit = defineEmits(['close'])

const decks = ref(playlist.items.some((it) => it.type === 'deck') && can('decks'))
const schedule = ref(false)
const all = ref(false)
const est = ref(null)
const error = ref('')
const loading = ref(false)

const parts = computed(() => [...(decks.value ? ['decks'] : []), ...(schedule.value ? ['schedule'] : [])])
let seq = 0
async function recount() {
  const my = ++seq
  loading.value = true
  error.value = ''
  try {
    const d = await estimateTransfer(parts.value, all.value)
    if (my === seq) est.value = d
  } catch (e) {
    if (my === seq) {
      est.value = null
      error.value = e.message
    }
  }
  if (my === seq) loading.value = false
}
onMounted(recount)
watch([decks, schedule, all], recount)

const summary = computed(() => {
  const e = est.value
  if (!e) return ''
  const bits = [`${e.slides} ${plural(e.slides, 'слайд', 'слайда', 'слайдов')}`]
  if (decks.value) bits.push(`${e.decks} ${plural(e.decks, 'колода', 'колоды', 'колод')}`)
  if (schedule.value) bits.push('расписание')
  bits.push(`${e.files} ${plural(e.files, 'файл', 'файла', 'файлов')} (${fmtSize(e.bytes)})`)
  return 'В файл попадёт: ' + bits.join(', ')
})
const canDownload = computed(() => est.value && !est.value.tooBig && !error.value)
</script>

<template>
  <div class="a-modal-back" @mousedown.self="emit('close')">
    <div class="a-modal tr">
      <h2>Сохранить в файл</h2>
      <div class="small">Один файл с плейлистом и всеми нужными фото и видео. Его можно унести на флешке и загрузить на другом табло.</div>
      <label class="a-check"><input type="checkbox" checked disabled /> Плейлист: слайды, бегущая строка, гашение, свои шаблоны</label>
      <label class="a-check"><input v-model="decks" type="checkbox" :disabled="!can('decks')" /> Колоды<span v-if="!can('decks')" class="small"> — нет прав</span></label>
      <label class="a-check"><input v-model="schedule" type="checkbox" :disabled="!can('schedule')" /> Расписание, изменения и звонки<span v-if="!can('schedule')" class="small"> — нет прав</span></label>
      <label class="a-check"><input v-model="all" type="checkbox" /> Все файлы медиатеки, а не только те, что в слайдах</label>
      <div class="small">Именинники в файл не попадают никогда — это личные данные.</div>
      <div class="sum" :class="{ big: est?.tooBig }">
        <template v-if="error">{{ error }}</template>
        <template v-else-if="est?.tooBig">Больше 4 ГБ: такой файл не поместится на флешку FAT32. Уберите лишние видео или снимите «Все файлы медиатеки».</template>
        <template v-else-if="est">{{ summary }}</template>
        <template v-else>Считаю…</template>
      </div>
      <div class="row">
        <a v-if="canDownload && !loading" class="a-btn primary dl" :href="exportUrl(parts, all)" download>Скачать</a>
        <button v-else class="a-btn primary" disabled>Скачать</button>
        <button class="a-btn" @click="emit('close')">Закрыть</button>
      </div>
      <div class="small">Браузер сам покажет ход скачивания и спросит, куда сохранить файл.</div>
    </div>
  </div>
</template>

<style scoped>
.tr {
  width: 560px;
  max-width: 96vw;
  gap: 10px;
}
.small {
  color: #8b909a;
  font-size: 12px;
}
.sum {
  padding: 10px 12px;
  border-radius: 8px;
  background: #22252b;
  font-weight: 700;
}
.sum.big {
  background: rgba(229, 80, 63, 0.16);
  color: #ff8a7a;
}
.row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.dl {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}
</style>
