// Плейлист экрана и список медиафайлов: загрузка, сохранение (debounce 300 мс → PUT /api/playlist),
// обновление по SSE. Общий для экрана (движок показа) и редактора (раздел «Плейлист»).
import { reactive, ref, watch } from 'vue'
import { onServerEvent, saveStatus } from './store.js'
import { deckById } from './decks.js'
import { countdownState } from './rules.js'
import { plural } from './bells.js'

// ticker — бегущая строка: { on, speed: 'slow'|'normal', items: [{ text, until: 'ГГГГ-ММ-ДД'|'' }] }
// blank — гашение экрана по расписанию: { on, periods: [{ timeFrom, timeTo, days }] } (src/rules.js → isBlanked)
// urgent — срочный режим: { on, id } — экраны показывают только слайд с этим id (Player.vue)
export const playlist = reactive({ updatedAt: 0, layout: 'full', blank: { on: false, periods: [] }, urgent: { on: false, id: '' }, ticker: { on: false, speed: 'normal', items: [] }, items: [] })
export const playlistLoaded = ref(false)
export const mediaLoaded = ref(false)
export const media = ref([]) // элементы медиатеки (data/media.json)
export const mediaById = (id) => media.value.find((m) => m.id === id)
export const mediaUrl = (item) => '/media/' + item.file
export const thumbUrl = (item) => (item.thumb ? '/media/' + item.thumb : item.type === 'image' ? mediaUrl(item) : '')

// ---------- слайды ----------

export const SLIDE_TITLES = {
  schedule: 'Расписание',
  changes: 'Изменения',
  image: 'Фото',
  video: 'Видео',
  news: 'Новость',
  countdown: 'Отсчёт',
  deck: 'Колода',
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

// анимации новости: значение → [название, что делает]
export const NEWS_ANIMS = {
  none: ['Без анимации', 'Новость стоит неподвижно.'],
  zoom: ['Приближение', 'Фото медленно приближается за время показа.'],
  drift: ['Дрейф', 'Фото плавно плывёт вбок.'],
  parallax: ['Параллакс', 'Фото и панель с текстом чуть смещаются в разные стороны.'],
  rise: ['Появление текста', 'Панель с текстом в начале плавно поднимается и проявляется.'],
}

/** Глубокая копия слайда с новым id; копия всегда включена. */
export function cloneSlide(it) {
  return { ...JSON.parse(JSON.stringify(it)), id: newId(), on: true }
}

/** Новый слайд. Для 'image'/'video' второй аргумент — id файла, для 'deck' — id колоды. */
export function makeSlide(type, mediaId) {
  if (type === 'news') {
    return { id: newId(), type, on: true, label: 'Новости', title: '', text: '', date: '', fit: 'cover', theme: '6', anim: 'zoom', duration: 15 }
  }
  if (type === 'countdown') return { id: newId(), type, on: true, title: '', date: '', time: '', note: '', theme: '6', duration: 15 }
  if (type === 'deck') return { id: newId(), type, on: true, deck: mediaId, mode: 'next' }
  if (type === 'schedule') return { id: newId(), type, on: true, duration: 15, grades: [] }
  if (type === 'changes') return { id: newId(), type, on: true, duration: 20, skipEmpty: true }
  if (type === 'image') return { id: newId(), type, on: true, media: mediaId, fit: 'cover', duration: 10 }
  return { id: newId(), type: 'video', on: true, media: mediaId, fit: 'cover', sound: false }
}

// шаблон слайда: 'full' — весь экран, 'panel' — содержимое слева, справа панель с часами, звонками и изменениями
export const LAYOUT_TITLES = { full: 'Весь экран', panel: 'С панелью справа' }
/** Есть ли у слайда шаблон (фото, видео, новость, отсчёт, колода). Табло расписания всегда во весь экран. */
export const hasLayout = (it) => ['image', 'video', 'news', 'countdown', 'deck'].includes(it.type)
/** Шаблон, по которому слайд реально показывается: свой у слайда или общий. */
export const layoutOf = (it) => (hasLayout(it) ? it.layout || playlist.layout || 'full' : 'full')

/** Название слайда для людей. */
export function slideTitle(it) {
  if (it.type === 'schedule') {
    return it.grades?.length ? 'Расписание: ' + it.grades.join(', ') + ' кл.' : 'Расписание: все параллели'
  }
  if (it.type === 'changes') return 'Изменения в расписании'
  if (it.type === 'news') return it.title || it.text?.slice(0, 60) || 'Новость без заголовка'
  if (it.type === 'countdown') {
    const c = countdownState(it)
    const left = c.over || !it.date ? '' : c.today ? ': уже сегодня' : ': ' + c.days + ' ' + plural(c.days, 'день', 'дня', 'дней')
    return 'До ' + (it.title || '…') + left
  }
  if (it.type === 'deck') return deckById(it.deck)?.name || 'Колода удалена'
  return mediaById(it.media)?.name || 'Файл удалён'
}

/** Сколько раз файл стоит в плейлисте. */
export const usesOfMedia = (id) => playlist.items.filter((it) => it.media === id).length

// ---------- загрузка и сохранение ----------

let applying = false
let lastProbe = ''
const probeOf = () => JSON.stringify([playlist.layout, playlist.blank, playlist.urgent, playlist.ticker, playlist.items])

function apply(d) {
  applying = true
  playlist.updatedAt = Number(d.updatedAt) || 0
  playlist.layout = d.layout === 'panel' ? 'panel' : 'full'
  playlist.blank = { on: !!d.blank?.on, periods: Array.isArray(d.blank?.periods) ? d.blank.periods : [] }
  playlist.urgent = { on: !!d.urgent?.on, id: String(d.urgent?.id || '') }
  playlist.ticker = {
    on: !!d.ticker?.on,
    speed: d.ticker?.speed === 'slow' ? 'slow' : 'normal',
    items: Array.isArray(d.ticker?.items) ? d.ticker.items : [],
  }
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
    // слайд срочного режима убрали из списка — режим выключается (сервер делает то же)
    if (playlist.urgent.on && !playlist.items.some((it) => it.id === playlist.urgent.id)) playlist.urgent = { on: false, id: '' }
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
