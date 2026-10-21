// Перенос плейлиста файлом, чистые функции без Vue (импортирует и сервер: server/transfer.js).
// Ссылки на файлы медиатеки, объединение «Добавить новые слайды», имя файла выгрузки.

export const MAX_TICKER = 10
export const TRANSFER_FORMAT = 'tablo-transfer'

const pad = (n) => String(n).padStart(2, '0')

/** tablo-2026-10-21_09-30.zip */
export function transferName(d = new Date()) {
  return `tablo-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}.zip`
}

/** Сравнение версий '0.13.2' → -1 | 0 | 1. */
export function cmpVersion(a, b) {
  const x = String(a || '').split('.').map((n) => parseInt(n) || 0)
  const y = String(b || '').split('.').map((n) => parseInt(n) || 0)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0)
    if (d) return d < 0 ? -1 : 1
  }
  return 0
}

/** Все карточки со ссылками на файлы: слайды и свои шаблоны плейлиста, карточки колод. */
function holders(data) {
  const out = []
  for (const it of Array.isArray(data?.items) ? data.items : []) out.push(it)
  for (const t of Array.isArray(data?.templates) ? data.templates : []) if (t?.slide) out.push(t.slide)
  for (const d of Array.isArray(data?.decks) ? data.decks : []) for (const c of Array.isArray(d?.cards) ? d.cards : []) out.push(c)
  return out
}

/** Множество id файлов медиатеки, на которые ссылаются слайды, шаблоны и карточки колод (любой из документов). */
export function mediaRefs(...docs) {
  const ids = new Set()
  for (const doc of docs) for (const h of holders(doc)) if (h && typeof h.media === 'string' && h.media) ids.add(h.media)
  return ids
}

/**
 * Переписывает ссылки `media` по таблице старый id → новый id (Map или объект). Нет id в таблице — ссылка остаётся;
 * значение null — ссылка убирается (файла нет). Возвращает копию, исходный документ не меняется.
 */
export function remapMedia(data, map) {
  const get = (id) => (map instanceof Map ? (map.has(id) ? [map.get(id)] : null) : Object.hasOwn(map, id) ? [map[id]] : null)
  const copy = JSON.parse(JSON.stringify(data))
  for (const h of holders(copy)) {
    if (!h || typeof h.media !== 'string') continue
    const r = get(h.media)
    if (!r) continue
    if (r[0]) h.media = r[0]
    else delete h.media
  }
  return copy
}

/**
 * «Добавить новые слайды»: слайды и свои шаблоны из файла — тот же id есть → заменяется на месте, нет → в конец;
 * новые объявления бегущей строки — в конец (до 10). Шаблон экрана, гашение и срочный режим остаются школьными.
 * cur и file уже очищены сервером. → { playlist, added, updated, tplAdded, tplUpdated, tickerAdded, tickerSkipped }
 */
export function mergePlaylistAdd(cur, file) {
  const items = cur.items.map((x) => x)
  let added = 0
  let updated = 0
  for (const it of file.items) {
    const i = items.findIndex((x) => x.id === it.id)
    if (i >= 0) (items[i] = it), updated++
    else items.push(it), added++
  }
  const templates = cur.templates.map((x) => x)
  let tplAdded = 0
  let tplUpdated = 0
  for (const t of file.templates) {
    const i = templates.findIndex((x) => x.id === t.id)
    if (i >= 0) (templates[i] = t), tplUpdated++
    else templates.push(t), tplAdded++
  }
  const tickerItems = cur.ticker.items.map((x) => x)
  let tickerAdded = 0
  let tickerSkipped = 0
  for (const t of file.ticker.items) {
    if (tickerItems.some((x) => x.text === t.text)) continue
    if (tickerItems.length >= MAX_TICKER) tickerSkipped++
    else tickerItems.push(t), tickerAdded++
  }
  return {
    playlist: { ...cur, items, templates: templates.slice(0, 50), ticker: { ...cur.ticker, items: tickerItems } },
    added,
    updated,
    tplAdded,
    tplUpdated,
    tickerAdded,
    tickerSkipped,
  }
}

/** Колоды по id: есть — заменить, нет — добавить; школьные колоды, которых нет в файле, остаются. */
export function mergeDecks(cur, file) {
  const decks = cur.map((x) => x)
  for (const d of file) {
    const i = decks.findIndex((x) => x.id === d.id)
    if (i >= 0) decks[i] = d
    else decks.push(d)
  }
  return decks
}
