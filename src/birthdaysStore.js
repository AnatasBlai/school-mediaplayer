// Именинники на клиенте. Два независимых куска:
//   — полный список (окно «Именинники» в редакторе): GET/PUT /api/birthdays, debounce 300 мс, SSE; грузится только
//     при первом открытии окна (GET закрыт без входа — иначе при открытии редактора выскакивало бы окно входа);
//   — «сегодня» для слайда: GET /api/birthdays/today[?full=1] — при первом обращении, по SSE, при переподключении и в полночь.
import { reactive, ref, watch } from 'vue'
import { onServerEvent, saveStatus } from './store.js'
import { makeSaver } from './saver.js'

export const birthdays = reactive({ updatedAt: 0, items: [] })
export const birthdaysLoaded = ref(false)
export const birthdaysError = ref('')

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
export const makeBirthday = (name = '', cls = '', d = '') => ({ id: newId(), name, cls, d })

// ---------- полный список ----------
let applying = false
let lastProbe = ''
const probeOf = () => JSON.stringify(birthdays.items)
const normalize = (d) => ({ updatedAt: Number(d.updatedAt) || 0, items: Array.isArray(d.items) ? d.items : [] })

function applyDoc(n) {
  applying = true
  birthdays.updatedAt = n.updatedAt
  birthdays.items = n.items
  lastProbe = probeOf()
  birthdaysLoaded.value = true
  Promise.resolve().then(() => (applying = false))
}

const saver = makeSaver({
  url: '/api/birthdays',
  status: saveStatus,
  snapshot: () => ({ updatedAt: birthdays.updatedAt, items: JSON.parse(JSON.stringify(birthdays.items)) }),
  normalize,
  applyDoc,
})

async function loadList(onlyNewer) {
  try {
    const r = await fetch('/api/birthdays', { cache: 'no-store' })
    if (!r.ok) {
      if (!birthdaysLoaded.value) birthdaysError.value = r.status === 401 ? 'Список виден только после входа' : 'Не удалось загрузить список'
      return
    }
    birthdaysError.value = ''
    const d = await r.json()
    if (!onlyNewer || !birthdaysLoaded.value) {
      const n = normalize(d)
      applyDoc(n)
      saver.setBase(n)
    } else await saver.receive(d)
  } catch {
    /* нет связи — останемся с тем, что есть */
  }
}

watch(
  birthdays,
  () => {
    if (applying || !birthdaysLoaded.value) return
    const probe = probeOf()
    if (probe === lastProbe) return
    lastProbe = probe
    birthdays.updatedAt = Date.now()
    saver.schedule()
  },
  { deep: true },
)

let listStarted = false
/** Загружает полный список (редактор). Повторный вызов ничего не делает. */
export function startBirthdays() {
  if (listStarted) return
  listStarted = true
  loadList(false)
  onServerEvent('birthdays', (d) => {
    if ((Number(d.updatedAt) || 0) > saver.baseUpdated()) loadList(true)
  })
  onServerEvent('hello', () => loadList(true))
}

// ---------- сегодня (экран и превью) ----------
const today = reactive({}) // '0' | '1' (full) → [{ name, cls, weekend }]
const todayDone = reactive({}) // ключ → ответ сервера уже был (или не удалось)

async function loadToday(key) {
  try {
    const r = await fetch('/api/birthdays/today' + (key === '1' ? '?full=1' : ''), { cache: 'no-store' })
    if (r.ok) today[key] = (await r.json()).items || []
  } catch {
    /* нет связи — покажем то, что было */
  }
  todayDone[key] = true
}
const reloadToday = () => Object.keys(today).forEach(loadToday)

let todayStarted = false
let midnight = null
function planMidnight() {
  clearTimeout(midnight)
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5)
  midnight = setTimeout(() => {
    reloadToday()
    planMidnight()
  }, next - now)
}

/** Загрузился ли список «сегодня» (экран ждёт его на старте, иначе слайд в начале плейлиста пропустится). */
export const todayReady = (full = false) => (todayBirthdays(full), !!todayDone[full ? '1' : '0'])

/** Именинники сегодня для слайда: full — «Имя Фамилия». Первый вызов запускает загрузку (пока грузится — []). */
export function todayBirthdays(full = false) {
  const key = full ? '1' : '0'
  if (!todayStarted) {
    todayStarted = true
    onServerEvent('birthdays', reloadToday)
    onServerEvent('hello', reloadToday)
    planMidnight()
  }
  if (!(key in today)) {
    today[key] = []
    loadToday(key)
  }
  return today[key]
}
