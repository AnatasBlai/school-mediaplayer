// Плейлист экрана и список медиафайлов: загрузка, сохранение (debounce 300 мс → PUT /api/playlist),
// обновление по SSE. Общий для экрана (движок показа) и редактора (раздел «Плейлист»).
import { reactive, ref, watch } from 'vue'
import { onServerEvent, saveStatus } from './store.js'

export const playlist = reactive({ updatedAt: 0, items: [] })
export const playlistLoaded = ref(false)
export const mediaLoaded = ref(false)
export const media = ref([]) // элементы медиатеки (data/media.json)
export const mediaById = (id) => media.value.find((m) => m.id === id)
export const mediaUrl = (item) => '/media/' + item.file
export const thumbUrl = (item) => (item.thumb ? '/media/' + item.thumb : item.type === 'image' ? mediaUrl(item) : '')

// ---------- слайды ----------

export const SLIDE_TITLES = { schedule: 'Расписание', changes: 'Изменения', image: 'Фото', video: 'Видео' }

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

export function makeSlide(type, mediaId) {
  if (type === 'schedule') return { id: newId(), type, on: true, duration: 15, grades: [] }
  if (type === 'changes') return { id: newId(), type, on: true, duration: 20, skipEmpty: true }
  if (type === 'image') return { id: newId(), type, on: true, media: mediaId, fit: 'cover', duration: 10 }
  return { id: newId(), type: 'video', on: true, media: mediaId, fit: 'cover', sound: false }
}

/** Название слайда для людей. */
export function slideTitle(it) {
  if (it.type === 'schedule') {
    return it.grades?.length ? 'Расписание: ' + it.grades.join(', ') + ' кл.' : 'Расписание: все параллели'
  }
  if (it.type === 'changes') return 'Изменения в расписании'
  return mediaById(it.media)?.name || 'Файл удалён'
}

/** Сколько раз файл стоит в плейлисте. */
export const usesOfMedia = (id) => playlist.items.filter((it) => it.media === id).length

// ---------- загрузка и сохранение ----------

let applying = false
let lastProbe = ''
const probeOf = () => JSON.stringify(playlist.items)

function apply(d) {
  applying = true
  playlist.updatedAt = Number(d.updatedAt) || 0
  playlist.items = Array.isArray(d.items) ? d.items : []
  lastProbe = probeOf()
  playlistLoaded.value = true
  Promise.resolve().then(() => (applying = false))
}

async function loadPlaylist(onlyNewer) {
  try {
    const r = await fetch('/api/playlist', { cache: 'no-store' })
    if (!r.ok) return
    const d = await r.json()
    if (!onlyNewer || (Number(d.updatedAt) || 0) > playlist.updatedAt) apply(d)
  } catch {
    /* нет связи — останемся с тем, что есть */
  }
}

export async function loadMedia() {
  try {
    const r = await fetch('/api/media', { cache: 'no-store' })
    if (r.ok) {
      media.value = (await r.json()).items || []
      mediaLoaded.value = true
    }
  } catch {
    /* ignore */
  }
}

async function push() {
  try {
    saveStatus.value = 'saving'
    const r = await fetch('/api/playlist', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(playlist),
    })
    saveStatus.value = r.ok ? 'saved' : 'offline'
  } catch {
    saveStatus.value = 'offline'
  }
}

let timer = null
watch(
  playlist,
  () => {
    if (applying || !playlistLoaded.value) return
    const probe = probeOf()
    if (probe === lastProbe) return
    lastProbe = probe
    playlist.updatedAt = Date.now()
    clearTimeout(timer)
    timer = setTimeout(push, 300)
  },
  { deep: true },
)

let started = false
/** Загружает плейлист и медиатеку и подписывается на их изменения. Повторный вызов ничего не делает. */
export function startPlaylist() {
  if (started) return
  started = true
  loadPlaylist(false)
  loadMedia()
  onServerEvent('playlist', (d) => {
    if ((Number(d.updatedAt) || 0) > playlist.updatedAt) loadPlaylist(true)
  })
  onServerEvent('media', loadMedia)
  // переподключились к серверу — могли пропустить изменения
  onServerEvent('hello', () => {
    loadPlaylist(true)
    loadMedia()
  })
}
