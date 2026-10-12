// Разбор таблицы, вставленной из Excel (текст с табуляциями). Чистые функции, без Vue.

// латинские буквы, похожие на русские (в Excel «5A» часто набирают латиницей)
const LATIN = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х' }

/** Текст из буфера Excel → строки ячеек. Ячейки в кавычках (с переносами внутри) разбираются как в Excel. */
export function splitTable(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const src = String(text || '').replace(/\r\n?/g, '\n')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') (cell += '"'), i++
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === '\t') (row.push(cell), (cell = ''))
    else if (ch === '\n') (row.push(cell), rows.push(row), (row = []), (cell = ''))
    else cell += ch
  }
  row.push(cell)
  rows.push(row)
  return rows.map((r) => r.map((c) => c.replace(/\s+/g, ' ').trim()))
}

/** «5А», «5 а», «5-Б» → { grade: '5', letter: 'А' } или null. */
export function parseClassName(s) {
  const m = /^(\d{1,2})\s*[-–]?\s*([A-Za-zА-Яа-яЁё])$/.exec(String(s || '').trim())
  if (!m) return null
  const up = m[2].toUpperCase()
  return { grade: m[1], letter: LATIN[up] || up }
}

const ROOM_RE = /^(.+?)\s+(?:каб(?:инет)?\.?\s*)?(\d+(?:\s*[/,]\s*\d+)*|спортзал|с\/з)$/i

/** «Математика 28/34» → { s: 'Математика', r: '28/34' }. Без номера в конце кабинета нет. */
export function parseLesson(cell) {
  const t = String(cell || '').trim()
  if (!t) return { s: '', r: '' }
  const m = ROOM_RE.exec(t)
  if (!m) return { s: t, r: '' }
  return { s: m[1].trim(), r: m[2].replace(/\s+/g, '') }
}

/**
 * Разбор вставки. letters — settings.letters, maxLessons — settings.lessonsCount.
 * → { classes: [{ grade, letter, known, lessons: [{ s, r }] }], problems: [текст], overflow }
 * overflow — есть ли непустые уроки сверх maxLessons (применять нельзя).
 */
export function parseScheduleTable(text, letters = {}, maxLessons = 9) {
  const rows = splitTable(text)
  while (rows.length && rows[rows.length - 1].every((c) => !c)) rows.pop()
  const out = { classes: [], problems: [], overflow: false }
  while (rows.length && rows[0].every((c) => !c)) rows.shift()
  if (!rows.length) return out

  const head = rows.shift()
  const cols = [] // { idx, grade, letter }
  head.forEach((c, idx) => {
    if (!c) return
    const cls = parseClassName(c)
    if (cls) {
      if (cols.some((x) => x.grade === cls.grade && x.letter === cls.letter)) out.problems.push(`Класс ${c} повторяется — берётся первый столбец`)
      else cols.push({ idx, ...cls })
    } else if (idx > 0) out.problems.push(`Столбец «${c}» не похож на класс — пропущен`)
  })
  if (!cols.length) {
    out.problems.push('В первой строке не нашлось названий классов (например 5А, 5Б)')
    return out
  }

  for (const col of cols) {
    const lessons = rows.map((r) => parseLesson(r[col.idx]))
    while (lessons.length && !lessons[lessons.length - 1].s && !lessons[lessons.length - 1].r) lessons.pop()
    const overflow = lessons.length > maxLessons
    if (overflow) out.overflow = true
    out.classes.push({
      grade: col.grade,
      letter: col.letter,
      known: (letters[col.grade] || []).includes(col.letter),
      overflow,
      lessons,
    })
  }
  return out
}
