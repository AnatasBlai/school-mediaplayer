// Состояние системы (GET /api/status): загрузка, проверки и общий уровень для точки в шапке редактора.
import { computed, reactive } from 'vue'
import { isOnline, screens, startScreens } from './screens.js'
import { fmtSize } from './mediaApi.js'

const GB = 1024 ** 3
const MB = 1024 ** 2
const PERIOD_TEXT = { day: 'раз в день', week: 'раз в неделю', month: 'раз в месяц' }

export const sys = reactive({ data: null, error: '', loading: false })

export async function loadStatus() {
  sys.loading = true
  try {
    const r = await fetch('/api/status', { cache: 'no-store' })
    if (!r.ok) throw new Error('Ошибка ' + r.status)
    const d = await r.json()
    d.skew = d.now - Date.now() // разница часов сервера и этого компьютера
    sys.data = d
    sys.error = ''
  } catch (e) {
    sys.error = e.message || 'Нет связи с сервером'
  } finally {
    sys.loading = false
  }
}

function uptime(ms) {
  const m = Math.floor(ms / 60000)
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  if (d) return `${d} дн ${h} ч`
  return h ? `${h} ч ${m % 60} мин` : `${m} мин`
}
const fmtDate = (t) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

/** Строки окна: { name, level: ok|warn|bad, value, hint?, action? }. */
export const rows = computed(() => {
  const d = sys.data
  if (!d) return []
  const out = []
  out.push({ name: 'Версия табло', level: 'ok', value: d.version || '—' })
  out.push({ name: 'Работает без перезапуска', level: 'ok', value: uptime(d.now - d.startedAt) })

  if (d.disk) {
    const r = { name: 'Место на диске', level: 'ok', value: `свободно ${fmtSize(d.disk.free)} из ${fmtSize(d.disk.total)}` }
    if (d.disk.free < 500 * MB) Object.assign(r, { level: 'bad', hint: 'Освободите место: удалите неиспользуемые видео в Медиатеке' })
    else if (d.disk.free < 2 * GB) Object.assign(r, { level: 'warn', hint: 'Места мало: удалите неиспользуемые видео в Медиатеке' })
    out.push(r)
  } else out.push({ name: 'Место на диске', level: 'warn', value: 'не удалось узнать' })

  out.push({
    name: 'Объём данных',
    level: 'ok',
    value: `данные: ${d.data.files} ф., ${fmtSize(d.data.bytes)}; фото и видео: ${d.media.files} ф., ${fmtSize(d.media.bytes)}`,
  })

  const b = d.backup
  const br = { name: 'Резервная копия', level: 'ok', value: '', action: 'backup' }
  if (!b.dir || b.period === 'off')
    Object.assign(br, { level: 'warn', value: 'Копии не делаются', hint: 'Включите копии: если сломается диск, расписание и фото пропадут' })
  else if (b.last && !b.last.ok)
    Object.assign(br, { level: 'bad', value: 'Последняя копия не удалась: ' + (b.last.error || 'ошибка'), hint: 'Проверьте папку копий и место на диске' })
  else if (!b.lastAt) Object.assign(br, { level: 'warn', value: 'Копий ещё не было (' + PERIOD_TEXT[b.period] + ')' })
  else {
    br.value = `последняя — ${fmtDate(b.lastAt)} (${PERIOD_TEXT[b.period]})`
    if (d.now - b.lastAt > 2 * b.periodMs) Object.assign(br, { level: 'warn', hint: 'Копия давно не делалась — проверьте папку копий' })
  }
  out.push(br)

  const items = screens.items
  const on = items.filter(isOnline).length
  out.push({
    name: 'Экраны',
    level: items.length && !on ? 'warn' : 'ok',
    value: items.length ? `на связи ${on} из ${items.length}` : 'ни один экран ещё не выходил на связь',
    hint: items.length && !on ? 'Проверьте, включены ли телевизоры и открыт ли сайт' : '',
  })

  const min = Math.round(Math.abs(d.skew) / 60000)
  const cr = { name: 'Часы', level: 'ok', value: 'часы сервера и этого компьютера совпадают' }
  if (Math.abs(d.skew) > 2 * 60000)
    Object.assign(cr, { level: 'warn', value: `Часы расходятся на ${min} мин`, hint: 'Звонки на экранах могут показываться неверно — поставьте точное время' })
  out.push(cr)

  out.push(
    d.auth.required
      ? { name: 'Пароль на редактор', level: 'ok', value: 'задан' }
      : { name: 'Пароль на редактор', level: 'warn', value: 'не задан', hint: 'Любой в школьной сети может менять расписание («🔒 Пароль» в шапке)' },
  )
  return out
})

/** Общий уровень для точки в шапке: bad — есть ошибки, warn — предупреждения, ok — всё хорошо, '' — ещё не знаем. */
export const level = computed(() => {
  if (sys.error && !sys.data) return 'bad'
  if (!sys.data) return ''
  return rows.value.some((r) => r.level === 'bad') ? 'bad' : rows.value.some((r) => r.level === 'warn') ? 'warn' : 'ok'
})

let started = false
export function startStatus() {
  if (started) return
  started = true
  startScreens() // «на связи» считается по списку экранов
  loadStatus()
  setInterval(loadStatus, 5 * 60_000)
}
