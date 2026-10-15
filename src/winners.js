// Слайд «Победители»: разбор списка призёров и раскладка групп-классов на экраны. Без Vue — чистые функции.
// Группа: { name: '8 классы', places: [[{ name, cls }], [...], [...]] /* 1, 2, 3 место */, others: 'текст' }.
// Призёры в others — по одному в строке: «8А Иванов Иван» (класс можно и в конце: «Иванов Иван 8 а»).

/** Призёров под пьедесталом — не больше; остальные уходят на экран «продолжение». */
export const UNDER_PODIUM = 5
/** Строк в одной колонке списка на экране без пьедестала (при самом мелком шрифте). */
export const LIST_ROWS = 11
/** Сколько человек можно поставить на одно место. */
export const PER_PLACE = 3

/** Класс к виду «8А»: без пробелов и дефиса, буква заглавная. */
export function normCls(s) {
  const t = String(s || '').replace(/[\s-]+/g, '').toUpperCase()
  return t.slice(0, 6)
}

/** Строка «8А Иванов Иван» → { cls: '8А', name: 'Иванов Иван' }; без класса — только имя. */
export function parseLine(line) {
  const s = String(line || '').replace(/[(),;]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) return null
  let m = s.match(/^(\d{1,2})\s*-?\s*([А-ЯЁа-яёA-Za-z])?(?=\s|$)\s*(.*)$/)
  if (m && m[3]) return { cls: normCls(m[1] + (m[2] || '')), name: m[3] }
  m = s.match(/^(.*?)\s+(\d{1,2})\s*-?\s*([А-ЯЁа-яёA-Za-z])?$/)
  if (m && m[1]) return { cls: normCls(m[2] + (m[3] || '')), name: m[1] }
  return { cls: '', name: s }
}

/** Все призёры группы из текста. */
export const parseOthers = (text) => String(text || '').split('\n').map(parseLine).filter(Boolean)

/** Места группы без пустых строк: [[...], [...], [...]]. */
export function podiumOf(g) {
  return [0, 1, 2].map((i) =>
    (g?.places?.[i] || [])
      .filter((p) => String(p?.name || '').trim())
      .map((p) => ({ name: String(p.name).trim(), cls: normCls(p.cls) })),
  )
}

/** Колонок в списке призёров: зависит от того, сколько места у панели (фото слева, панель справа). */
export const listCols = (panel, photo) => (panel && photo ? 1 : !panel && !photo ? 3 : 2)

/**
 * Экраны слайда по порядку: [{ group, name, part, podium | null, list }].
 * group — индекс группы, part — 0 у первого экрана группы, 1, 2… у продолжений.
 * С победителями под пьедесталом не больше UNDER_PODIUM призёров, остальные — на продолжения
 * поровну, не больше cols × LIST_ROWS человек на экран (30 при 22 местах → 15 + 15). Пустые группы пропускаются.
 */
export function winnerScreens(item, cols) {
  const cap = Math.max(1, cols) * LIST_ROWS
  const out = []
  ;(item?.groups || []).forEach((g, gi) => {
    const podium = podiumOf(g)
    const others = parseOthers(g.others)
    const win = podium.some((p) => p.length)
    if (!win && !others.length) return
    const name = String(g.name || '').trim()
    let rest = others
    let part = 0
    if (win) {
      out.push({ group: gi, name, part: part++, podium, list: others.slice(0, UNDER_PODIUM) })
      rest = others.slice(UNDER_PODIUM)
    }
    const per = rest.length ? Math.ceil(rest.length / Math.ceil(rest.length / cap)) : cap
    for (let i = 0; i < rest.length; i += per) out.push({ group: gi, name, part: part++, podium: null, list: rest.slice(i, i + per) })
  })
  return out
}

/** Пустая группа для редактора. */
export const makeGroup = () => ({ name: '', places: [0, 1, 2].map(() => [{ name: '', cls: '' }]), others: '' })
