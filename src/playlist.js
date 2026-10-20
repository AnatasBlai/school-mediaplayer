// Плейлист экрана и список медиафайлов: загрузка, сохранение (debounce 300 мс → PUT /api/playlist),
// обновление по SSE. Общий для экрана (движок показа) и редактора (раздел «Плейлист»).
import { reactive, ref, watch } from 'vue'
import { onServerEvent, saveStatus } from './store.js'
import { deckById } from './decks.js'
import { countdownState } from './rules.js'
import { plural } from './bells.js'
import { winnerScreens, listCols, makeGroup } from './winners.js'
import { makeSaver } from './saver.js'

// ticker — бегущая строка: { on, speed: 'slow'|'normal', items: [{ text, until: 'ГГГГ-ММ-ДД'|'' }] }
// blank — гашение экрана по расписанию: { on, periods: [{ timeFrom, timeTo, days }] } (src/rules.js → isBlanked)
// urgent — срочный режим: { on, id } — экраны показывают только слайд с этим id (Player.vue)
export const playlist = reactive({ updatedAt: 0, layout: 'full', blank: { on: false, periods: [] }, urgent: { on: false, id: '' }, ticker: { on: false, speed: 'normal', items: [] }, templates: [], items: [] })
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
  menu: 'Меню столовой',
  deck: 'Колода',
  winners: 'Победители',
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

// ---------- шаблоны слайдов ----------
// Встроенные — в коде (слайд без id и on); свои хранятся в playlist.templates: [{ id, name, slide }].
export const BUILTIN_TEMPLATES = [
  { id: 'congrats', name: 'Поздравляем!', slide: { type: 'news', label: 'ПОЗДРАВЛЯЕМ', title: 'Имя Фамилия', text: '', theme: 'sunset', anim: 'zoom' } },
  { id: 'parents', name: 'Родительское собрание', slide: { type: 'news', label: 'ВНИМАНИЕ', title: 'Родительское собрание', text: 'Дата, время, кабинет …' } },
  { id: 'duty', name: 'Дежурный класс недели', slide: { type: 'news', label: 'ДЕЖУРСТВО', title: 'Дежурит 8А', when: { dateFrom: '', dateTo: '', timeFrom: '', timeTo: '', days: [1, 2, 3, 4, 5, 6] } } },
  { id: 'contest', name: 'Олимпиада / конкурс', slide: { type: 'news', label: 'КОНКУРС', title: 'Название конкурса', text: '' } },
  { id: 'holidays', name: 'До каникул', slide: { type: 'countdown', title: 'каникул' } },
  { id: 'olympiad', name: 'Победители олимпиады', slide: { type: 'winners', title: 'Олимпиада' } },
]

/** Новый слайд по шаблону: основа — makeSlide нужного типа, поверх поля шаблона; id новый, слайд включён. */
export function slideFromTemplate(t) {
  const base = makeSlide(t.slide.type, t.slide.media || t.slide.deck)
  return { ...base, ...JSON.parse(JSON.stringify(t.slide)), id: newId(), on: true }
}

/** Шаблон из слайда: без id, on и срочного режима; «Когда» остаётся. */
export function templateFromSlide(it, name) {
  const slide = JSON.parse(JSON.stringify(it))
  delete slide.id
  delete slide.on
  return { id: newId(), name: String(name).trim().slice(0, 40), slide }
}

/** Кнопка «Сохранить как шаблон» в окнах правки: спрашивает имя и добавляет шаблон в playlist.templates. */
export function saveAsTemplate(it) {
  if (it.type === 'countdown' && !it.date) return alert('Сначала укажите дату события — без неё шаблон не сохранится.')
  if (playlist.templates.length >= 50) return alert('Шаблонов уже 50 — удалите ненужные в меню «Из шаблона».')
  const name = prompt('Название шаблона:', (it.title || '').slice(0, 40))
  if (name && name.trim()) playlist.templates.push(templateFromSlide(it, name))
}

/** Новый слайд. Для 'image'/'video' второй аргумент — id файла, для 'deck' — id колоды. */
export function makeSlide(type, mediaId) {
  if (type === 'news') {
    return { id: newId(), type, on: true, label: 'Новости', title: '', text: '', date: '', fit: 'cover', theme: '6', anim: 'zoom', duration: 15 }
  }
  if (type === 'winners') {
    return { id: newId(), type, on: true, label: 'Поздравляем!', title: '', date: '', fit: 'cover', theme: '6', anim: 'zoom', duration: 8, groups: [makeGroup()] }
  }
  if (type === 'countdown') return { id: newId(), type, on: true, title: '', date: '', time: '', note: '', theme: '6', duration: 15 }
  if (type === 'menu') return { id: newId(), type, on: true, title: 'Меню на сегодня', theme: '7', duration: 15, twoWeeks: false, days: {} }
  if (type === 'deck') return { id: newId(), type, on: true, deck: mediaId, mode: 'next' }
  if (type === 'schedule') return { id: newId(), type, on: true, duration: 15, grades: [] }
  if (type === 'changes') return { id: newId(), type, on: true, duration: 20, skipEmpty: true }
  if (type === 'image') return { id: newId(), type, on: true, media: mediaId, fit: 'cover', duration: 10 }
  return { id: newId(), type: 'video', on: true, media: mediaId, fit: 'cover', sound: false }
}

// шаблон слайда: 'full' — весь экран, 'panel' — содержимое слева, справа панель с часами, звонками и изменениями
export const LAYOUT_TITLES = { full: 'Весь экран', panel: 'С панелью справа' }
/** Есть ли у слайда шаблон (фото, видео, новость, победители, отсчёт, колода). Табло расписания всегда во весь экран. */
export const hasLayout = (it) => ['image', 'video', 'news', 'winners', 'countdown', 'menu', 'deck'].includes(it.type)
/** Шаблон, по которому слайд реально показывается: свой у слайда или общий. */
export const layoutOf = (it) => (hasLayout(it) ? it.layout || playlist.layout || 'full' : 'full')

/** Название слайда для людей. */
export function slideTitle(it) {
  if (it.type === 'schedule') {
    return it.grades?.length ? 'Расписание: ' + it.grades.join(', ') + ' кл.' : 'Расписание: все параллели'
  }
  if (it.type === 'changes') return 'Изменения в расписании'
  if (it.type === 'news') return it.title || it.text?.slice(0, 60) || 'Новость без заголовка'
  if (it.type === 'winners') return it.title || 'Победители без заголовка'
  if (it.type === 'countdown') {
    const c = countdownState(it)
    const left = c.over || !it.date ? '' : c.today ? ': уже сегодня' : ': ' + c.days + ' ' + plural(c.days, 'день', 'дня', 'дней')
    return 'До ' + (it.title || '…') + left
  }
  if (it.type === 'menu') return 'Меню столовой'
  if (it.type === 'deck') return deckById(it.deck)?.name || 'Колода удалена'
  return mediaById(it.media)?.name || 'Файл удалён'
}

/** Экраны слайда «Победители» по его шаблону и фото (src/winners.js). */
export const winnerScreensOf = (it) => winnerScreens(it, listCols(layoutOf(it) === 'panel', mediaById(it.media)?.type === 'image'))

/** Сколько раз файл стоит в плейлисте. */
export const usesOfMedia = (id) => playlist.items.filter((it) => it.media === id).length

// ---------- загрузка и сохранение ----------

let applying = false
let lastProbe = ''
const probeOf = () => JSON.stringify([playlist.layout, playlist.blank, playlist.urgent, playlist.ticker, playlist.templates, playlist.items])

/** Документ сервера → вид, в котором плейлист хранится на клиенте (и сравнивается с базой). */
function normalize(d) {
  return {
    updatedAt: Number(d.updatedAt) || 0,
    layout: d.layout === 'panel' ? 'panel' : 'full',
    blank: { on: !!d.blank?.on, periods: Array.isArray(d.blank?.periods) ? d.blank.periods : [] },
    urgent: { on: !!d.urgent?.on, id: String(d.urgent?.id || '') },
    ticker: {
      on: !!d.ticker?.on,
      speed: d.ticker?.speed === 'slow' ? 'slow' : 'normal',
      items: Array.isArray(d.ticker?.items) ? d.ticker.items : [],
    },
    templates: Array.isArray(d.templates) ? d.templates : [],
    items: Array.isArray(d.items) ? d.items : [],
  }
}

function applyDoc(n) {
  applying = true
  playlist.updatedAt = n.updatedAt
  playlist.layout = n.layout
  playlist.blank = n.blank
  playlist.urgent = n.urgent
  playlist.ticker = n.ticker
  playlist.templates = n.templates
  playlist.items = n.items
  lastProbe = probeOf()
  playlistLoaded.value = true
  Promise.resolve().then(() => (applying = false))
}

const saver = makeSaver({
  url: '/api/playlist',
  status: saveStatus,
  snapshot: () => JSON.parse(JSON.stringify(playlist)),
  normalize,
  applyDoc,
  names: () => Object.fromEntries(playlist.items.map((it) => [it.id, slideTitle(it)])),
})

function apply(d) {
  const n = normalize(d)
  applyDoc(n)
  saver.setBase(n)
}

async function loadPlaylist(onlyNewer) {
  try {
    const r = await fetch('/api/playlist', { cache: 'no-store' })
    if (!r.ok) return
    const d = await r.json()
    if (!onlyNewer) apply(d)
    else await saver.receive(d)
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
    saver.schedule()
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
    if ((Number(d.updatedAt) || 0) > saver.baseUpdated()) loadPlaylist(true)
  })
  onServerEvent('media', loadMedia)
  // переподключились к серверу — могли пропустить изменения
  onServerEvent('hello', () => {
    loadPlaylist(true)
    loadMedia()
  })
}
