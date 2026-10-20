// Сравнение двух версий данных «по-человечески»: расписание, плейлист, колоды, медиатека.
// Без Vue и без импортов — годится и для окна возврата из копии, и для журнала правок.
// diffX(a, b) — что изменится, если данные a заменить данными b (a — текущие, b — из снимка).
// Результат — массив строк; пустой массив — разницы нет.

const DAYS = ['', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
const SLIDE_NAMES = { schedule: 'Расписание', changes: 'Изменения', image: 'Фото', video: 'Видео', news: 'Новость', countdown: 'Отсчёт', deck: 'Колода', winners: 'Победители' }

const same = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null)
const plural = (n, one, few, many) => {
  const m = Math.abs(n) % 100
  const k = m % 10
  return m > 10 && m < 20 ? many : k === 1 ? one : k >= 2 && k <= 4 ? few : many
}
const count = (n, one, few, many) => `${n} ${plural(n, one, few, many)}`

/** Не больше max строк, остальное — «и ещё N». */
export function limitLines(lines, max = 30) {
  if (lines.length <= max) return lines
  return [...lines.slice(0, max), `и ещё ${lines.length - max}`]
}

/** Короткий список названий: первые несколько и «и ещё N». */
function names(list, max = 5) {
  const head = list.slice(0, max).map((s) => `«${s}»`).join(', ')
  return list.length > max ? `${head} и ещё ${list.length - max}` : head
}

// ---------- расписание ----------

const lessonKey = (l) => `${l?.s || ''}|${l?.r || ''}`
const arr = (v) => (Array.isArray(v) ? v : [])

export function diffSchedule(a, b) {
  const out = []
  a = a || {}
  b = b || {}

  // буквы классов
  const la = a.settings?.letters || {}
  const lb = b.settings?.letters || {}
  for (const g of [...new Set([...Object.keys(la), ...Object.keys(lb)])].sort((x, y) => x - y)) {
    const add = arr(lb[g]).filter((l) => !arr(la[g]).includes(l))
    const del = arr(la[g]).filter((l) => !arr(lb[g]).includes(l))
    if (add.length) out.push(`Буквы классов: ${add.length > 1 ? 'добавлены' : 'добавлен'} ${add.map((l) => g + l).join(', ')}`)
    if (del.length) out.push(`Буквы классов: ${del.length > 1 ? 'убраны' : 'убран'} ${del.map((l) => g + l).join(', ')}`)
  }
  if ((a.settings?.lessonsCount ?? 0) !== (b.settings?.lessonsCount ?? 0)) {
    out.push(`Число уроков в таблице: ${a.settings?.lessonsCount ?? '—'} → ${b.settings?.lessonsCount ?? '—'}`)
  }
  if (!same(a.settings?.bells, b.settings?.bells)) out.push('Звонки: изменены')

  // уроки: класс × день
  const sa = a.schedule || {}
  const sb = b.schedule || {}
  for (const g of [...new Set([...Object.keys(sa), ...Object.keys(sb)])].sort((x, y) => x - y)) {
    const da = sa[g] || {}
    const db = sb[g] || {}
    for (const d of [...new Set([...Object.keys(da), ...Object.keys(db)])].sort()) {
      const ca = da[d] || {}
      const cb = db[d] || {}
      for (const letter of [...new Set([...Object.keys(ca), ...Object.keys(cb)])].sort()) {
        const xa = arr(ca[letter])
        const xb = arr(cb[letter])
        let n = 0
        for (let i = 0; i < Math.max(xa.length, xb.length); i++) if (lessonKey(xa[i]) !== lessonKey(xb[i])) n++
        if (n) out.push(`${g}${letter}, ${DAYS[d] || 'день ' + d}: ${count(n, 'урок', 'урока', 'уроков')}`)
      }
    }
  }

  // изменения в расписании
  const ra = a.changes || {}
  const rb = b.changes || {}
  let rows = 0
  for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
    const xa = arr(ra[k])
    const xb = arr(rb[k])
    for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
      const p = xa[i] || {}
      const q = xb[i] || {}
      if (`${p.c || ''}|${p.t || ''}|${p.r || ''}` !== `${q.c || ''}|${q.t || ''}|${q.r || ''}`) rows++
    }
  }
  if (rows) out.push(`Изменения: ${count(rows, 'строка', 'строки', 'строк')}`)
  if ((a.settings?.changesDate || '') !== (b.settings?.changesDate || '')) out.push('Изменения: другая дата')
  if (!same(a.settings?.changesCols, b.settings?.changesCols)) out.push('Изменения: другое число колонок')

  return limitLines(out)
}

// ---------- плейлист ----------

/** Название слайда для людей. dict — необязательно: { media: { id: имя }, decks: { id: имя } }.
 *  dict.journal = true в diffPlaylist — формулировки журнала («добавлены / удалены»), а не возврата из копии. */
export function slideName(it, dict = {}) {
  if (it.type === 'schedule') return it.grades?.length ? 'Расписание: ' + it.grades.join(', ') + ' кл.' : 'Расписание: все параллели'
  if (it.type === 'changes') return 'Изменения в расписании'
  if (it.type === 'news') return it.title || String(it.text || '').slice(0, 60) || 'Новость без заголовка'
  if (it.type === 'winners') return it.title || 'Победители без заголовка'
  if (it.type === 'countdown') return 'До ' + (it.title || '…')
  if (it.type === 'deck') return dict.decks?.[it.deck] || 'Колода'
  return dict.media?.[it.media] || SLIDE_NAMES[it.type] || 'Слайд'
}

export function diffPlaylist(a, b, dict = {}) {
  const out = []
  const ia = arr(a?.items)
  const ib = arr(b?.items)
  const ma = new Map(ia.map((x) => [x.id, x]))
  const mb = new Map(ib.map((x) => [x.id, x]))
  const back = ib.filter((x) => !ma.has(x.id))
  const gone = ia.filter((x) => !mb.has(x.id))
  const changed = ib.filter((x) => ma.has(x.id) && !same(x, ma.get(x.id)))
  if (back.length) out.push((dict.journal ? 'Добавлены слайды: ' : 'Будут возвращены слайды: ') + names(back.map((x) => slideName(x, dict))))
  if (gone.length) out.push((dict.journal ? 'Удалены слайды: ' : 'Пропадут слайды, добавленные позже: ') + names(gone.map((x) => slideName(x, dict))))
  if (changed.length) out.push('Изменены: ' + names(changed.map((x) => slideName(x, dict))))
  const common = (list, other) => list.filter((x) => other.has(x.id)).map((x) => x.id)
  if (!same(common(ia, mb), common(ib, ma))) out.push(dict.journal ? 'Порядок слайдов изменён' : 'Порядок слайдов изменится')
  const settings = []
  if ((a?.layout || 'full') !== (b?.layout || 'full')) settings.push('шаблон')
  if (!same(a?.blank, b?.blank)) settings.push('гашение экрана')
  if (!same(a?.ticker, b?.ticker)) settings.push('бегущая строка')
  if (!same(a?.urgent, b?.urgent)) settings.push('срочный режим')
  if (settings.length) out.push('Настройки экрана: ' + settings.join(', '))
  return limitLines(out)
}

// ---------- колоды ----------

export function diffDecks(a, b, opts = {}) {
  const out = []
  const da = new Map(arr(a?.decks).map((d) => [d.id, d]))
  const db = new Map(arr(b?.decks).map((d) => [d.id, d]))
  for (const [id, d] of db) if (!da.has(id)) out.push(`Колода «${d.name}»: ${opts.journal ? 'добавлена' : 'будет возвращена'}`)
  for (const [id, d] of da) if (!db.has(id)) out.push(`Колода «${d.name}»: ${opts.journal ? 'удалена' : 'пропадёт (добавлена позже)'}`)
  for (const [id, y] of db) {
    const x = da.get(id)
    if (!x) continue
    const parts = []
    const ca = new Map(arr(x.cards).map((c) => [c.id, c]))
    const cb = new Map(arr(y.cards).map((c) => [c.id, c]))
    let n = 0
    for (const [cid, c] of cb) if (!ca.has(cid) || !same(c, ca.get(cid))) n++
    for (const cid of ca.keys()) if (!cb.has(cid)) n++
    if (n) parts.push('изменено карточек: ' + n)
    else if (!same(arr(x.cards).map((c) => c.id), arr(y.cards).map((c) => c.id))) parts.push('другой порядок карточек')
    const meta = (d) => [d.name, d.theme, d.factTime, d.qTime, d.aTime]
    if (!same(meta(x), meta(y))) parts.push('настройки')
    if (parts.length) out.push(`Колода «${y.name}»: ${parts.join(', ')}`)
  }
  return limitLines(out)
}

// ---------- медиатека ----------

/** mirror — необязательно: множество имён файлов в зеркале media/ папки копий (чтобы сказать, вернутся ли файлы). */
export function diffMedia(a, b, mirror) {
  const out = []
  const ma = new Map(arr(a?.items).map((m) => [m.id, m]))
  const mb = new Map(arr(b?.items).map((m) => [m.id, m]))
  const later = [...ma.values()].filter((m) => !mb.has(m.id))
  const missing = [...mb.values()].filter((m) => !ma.has(m.id))
  if (later.length) {
    out.push(`В снимке нет ${count(later.length, 'файла', 'файлов', 'файлов')}, добавленных позже: ${names(later.map((m) => m.name))}. Сами файлы не удаляются — они останутся на диске, но пропадут из медиатеки`)
  }
  if (missing.length) {
    out.push('В снимке есть файлы, которых нет в медиатеке: ' + names(missing.map((m) => m.name)))
    if (mirror) {
      const lost = missing.filter((m) => !mirror.has(m.file))
      out.push(lost.length ? `В зеркале копий нет файлов: ${lost.length} из ${missing.length} — они не вернутся` : 'Все эти файлы есть в зеркале копий — вернутся')
    }
  }
  const renamed = [...mb.values()].filter((m) => ma.has(m.id) && (ma.get(m.id).name !== m.name || ma.get(m.id).category !== m.category))
  if (renamed.length) out.push('Изменятся названия или папки: ' + names(renamed.map((m) => m.name)))
  return limitLines(out)
}
