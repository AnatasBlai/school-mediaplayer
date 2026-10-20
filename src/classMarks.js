// Какие классы упомянуты в строках изменений (без Vue). Класс пишут по-разному: «8А», «8 а», «8A» (латиницей),
// «8А, 8Б», «8АБ», «8» / «8 классы» (вся параллель).
import { parseClassName } from './scheduleImport.js'

/** Текст ячейки «Класс» → список «8А»; пусто, если не распознано. letters — settings.letters (для «8» = все буквы). */
export function parseClassList(text, letters = {}) {
  const out = []
  const parts = String(text || '')
    .split(/[,;/]|\s+и\s+|\s+(?=\d)/)
    .map((p) => p.trim())
    .filter(Boolean)
  for (let p of parts) {
    // «9-е классы», «9 класс», «9 кл.» → «9»
    p = p.replace(/\s*(?:[-–]\s*[еы]х?)?\s*(?:классы|класса|класс|кл\.?)$/i, '').trim()
    const m = /^(\d{1,2})\s*[-–]?\s*([A-Za-zА-Яа-яЁё]*)$/.exec(p)
    if (!m) continue
    const [, grade, rest] = m
    if (!rest) {
      for (const l of letters[grade] || []) out.push(grade + l)
      continue
    }
    for (const ch of rest) {
      const c = parseClassName(grade + ch)
      if (c) out.push(c.grade + c.letter)
    }
  }
  return out
}

/** Строки изменений (все колонки: { ch0: [{ c, t, r }], … }) → Set классов «8А», у которых есть изменения. */
export function changedClasses(changes, letters = {}) {
  const set = new Set()
  for (const col of Object.values(changes || {})) {
    for (const row of col || []) {
      if (!row?.c) continue
      for (const k of parseClassList(row.c, letters)) set.add(k)
    }
  }
  return set
}

/** Порядок строк по параллели и букве: нераспознанные — после, пустые — в самом конце; порядок равных сохраняется. */
export function sortChangeRows(rows, letters = {}) {
  const key = (row) => {
    const first = parseClassList(row?.c, letters)[0]
    if (!first) return row?.c || row?.t || row?.r ? [1, 0, ''] : [2, 0, '']
    return [0, parseInt(first, 10), first.replace(/^\d+/, '')]
  }
  return rows
    .map((row, i) => ({ row, i, k: key(row) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2].localeCompare(b.k[2], 'ru') || a.i - b.i)
    .map((x) => x.row)
}
