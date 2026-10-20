// Трёхстороннее объединение правок (без Vue): base — версия, на которой человек начал править,
// mine — его текущие данные, theirs — то, что за это время сохранил кто-то другой.
// Правила: объекты — по ключам; массивы объектов с id (слайды, колоды, карточки) — по id;
// остальные массивы объектов (уроки, строки изменений) — по индексу; массивы чисел/строк и скаляры — целиком.
// Если оба поменяли одно место по-разному — побеждает своя правка (человек её сейчас видит), место попадает в conflicts.
// Удалил один, а другой изменил — остаётся изменённое: правка ценнее удаления.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))

/** Глубокое сравнение; порядок ключей объекта не важен. */
export function deepEqual(a, b) {
  if (a === b) return true
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]))
  if (isObj(a)) {
    if (!isObj(b)) return false
    const ka = Object.keys(a).filter((k) => a[k] !== undefined)
    const kb = Object.keys(b).filter((k) => b[k] !== undefined)
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]))
  }
  return false
}

const hasIds = (arr) => arr.length > 0 && arr.every((x) => isObj(x) && typeof x.id === 'string')
const isEmptyItem = (x) => isObj(x) && Object.values(x).every((v) => v === '' || v === undefined || v === null)

/**
 * Возвращает { merged, conflicts }; conflicts — пути (массивы ключей) мест, где правки столкнулись.
 * base/mine/theirs не меняются.
 */
export function merge3(base, mine, theirs) {
  const conflicts = []
  const merged = walk(base, mine, theirs, [], conflicts)
  return { merged: clone(merged), conflicts }
}

function walk(base, mine, theirs, path, conflicts) {
  if (deepEqual(mine, theirs)) return mine
  if (deepEqual(base, mine)) return theirs // свою часть не трогали
  if (deepEqual(base, theirs)) return mine // чужую часть не трогали
  // дальше изменили оба и по-разному
  if (mine === undefined) return theirs // я удалил, они изменили — остаётся изменённое
  if (theirs === undefined) return mine // они удалили, я изменил

  if (isObj(mine) && isObj(theirs)) {
    const b = isObj(base) ? base : {}
    const out = {}
    const keys = [...Object.keys(theirs), ...Object.keys(mine).filter((k) => !(k in theirs))]
    for (const k of keys) {
      const v = walk(b[k], mine[k], theirs[k], [...path, k], conflicts)
      if (v !== undefined) out[k] = v
    }
    return out
  }

  if (Array.isArray(mine) && Array.isArray(theirs)) {
    const b = Array.isArray(base) ? base : []
    if (hasIds(mine) && hasIds(theirs) && (!b.length || hasIds(b))) return mergeById(b, mine, theirs, path, conflicts)
    if ([...mine, ...theirs].every(isObj)) {
      const out = []
      const n = Math.max(mine.length, theirs.length)
      for (let i = 0; i < n; i++) {
        const v = walk(b[i], mine[i], theirs[i], [...path, i], conflicts)
        if (v !== undefined) out.push(v)
      }
      while (out.length && isEmptyItem(out[out.length - 1])) out.pop() // как в store.js: пустой хвост обрезается
      return out
    }
  }

  conflicts.push(path)
  return mine
}

function mergeById(base, mine, theirs, path, conflicts) {
  const byId = (arr) => new Map(arr.map((x) => [x.id, x]))
  const B = byId(base)
  const M = byId(mine)
  const T = byId(theirs)
  const result = new Map()
  for (const id of new Set([...M.keys(), ...T.keys()])) {
    const v = walk(B.get(id), M.get(id), T.get(id), [...path, id], conflicts)
    if (v !== undefined) result.set(id, v)
  }
  // порядок: если они порядок не меняли, а я менял — мой; иначе их. Недостающие вставляются после своего предшественника.
  const common = (arr) => arr.map((x) => x.id).filter((id) => B.has(id) && M.has(id) && T.has(id))
  const baseOrder = common(base)
  const theirsMoved = !deepEqual(common(theirs), baseOrder)
  const first = theirsMoved ? theirs : mine
  const second = theirsMoved ? mine : theirs
  const order = first.map((x) => x.id).filter((id) => result.has(id))
  for (let i = 0; i < second.length; i++) {
    const id = second[i].id
    if (!result.has(id) || order.includes(id)) continue
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const p = order.indexOf(second[j].id)
      if (p >= 0) {
        at = p + 1
        break
      }
    }
    order.splice(at, 0, id)
  }
  return order.map((id) => result.get(id))
}

const DAYS_NOM = ['', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

/** Место конфликта по-человечески: «8А, вторник, 3 урок». names — { id слайда/колоды: название } (необязательно). */
export function describePath(path, names = {}) {
  const [root, a, b, c, d] = path
  if (root === 'schedule' && a) {
    const parts = [`${a}${c || ''}`.trim()]
    if (b) parts.push(DAYS_NOM[b] || `день ${b}`)
    if (typeof d === 'number') parts.push(`${d + 1} урок`)
    return parts.join(', ')
  }
  if (root === 'changes') return 'Изменения в расписании'
  if (root === 'settings') return 'Настройки расписания'
  if (root === 'items') return a ? `слайд «${names[a] || a}»` : 'список слайдов'
  if (root === 'decks') return a ? `колода «${names[a] || a}»` : 'колоды'
  if (root === 'ticker') return 'бегущая строка'
  if (root === 'blank') return 'гашение экрана'
  if (root === 'urgent') return 'срочный режим'
  if (root === 'templates') return 'шаблоны слайдов'
  if (root === 'layout') return 'шаблон экрана'
  return 'общие настройки'
}

/** Уникальные описания конфликтов, не больше max (остальное — «и ещё N»). */
export function describeConflicts(conflicts, names, max = 3) {
  const list = [...new Set(conflicts.map((p) => describePath(p, names)))]
  return list.length > max ? list.slice(0, max).join('; ') + ` и ещё ${list.length - max}` : list.join('; ')
}

