// Слайд «Меню столовой»: разбор блюд, неделя, какой день показать, раскладка по экранам. Чистые функции, без Vue.
// Данные слайда: days { '1'…'6' (Пн–Сб), при twoWeeks ещё '8'…'13' — вторая неделя } → [{ name, time, lines }].

export const DAY_NAMES = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'] // по getDay()
const DAY_ACC = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'] // «меню на …»
export const MENU_DAYS = ['1', '2', '3', '4', '5', '6']
export const MENU_DAYS_2 = ['8', '9', '10', '11', '12', '13']
export const MAX_MEALS = 4

const PRICE_RE = /(₽|руб|р\.?$)/i
const num = (s) => /^\d+([.,]\d+)?$/.test(s)

/** «Каша рисовая — 200 г — 35 ₽» → [{ name, size, price }]. Выход и цена необязательны; с «₽/руб» — цена, иначе выход. */
export function parseDishes(text) {
  const out = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split(/\s+[—–-]\s+|\t/).map((p) => p.trim()).filter(Boolean)
    const dish = { name: parts[0] || line, size: '', price: '' }
    const rest = parts.slice(1)
    if (rest.length >= 2) {
      dish.size = rest[0]
      dish.price = rest[1]
    } else if (rest.length === 1) {
      if (PRICE_RE.test(rest[0])) dish.price = rest[0]
      else dish.size = rest[0]
    }
    if (num(dish.price)) dish.price += ' ₽'
    out.push(dish)
  }
  return out
}

/** Номер недели учебного года (1 или 2): неделя, в которую попало 1 сентября, — первая. */
export function schoolWeek(date) {
  const y = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1
  const mon = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() || 7) - 1))
  const weeks = Math.round((mon(date) - mon(new Date(y, 8, 1))) / (7 * 86400000))
  return weeks % 2 === 0 ? 1 : 2
}

/** Ключ дня в it.days для даты: '1'…'6' или '8'…'13' на второй неделе. Воскресенье — null. */
export function dayKeyOf(it, date) {
  const dow = date.getDay()
  if (dow === 0) return null
  return it.twoWeeks && schoolWeek(date) === 2 ? String(7 + dow) : String(dow)
}

/** Приёмы пищи дня с разобранными блюдами; приёмы без блюд отбрасываются. */
export function mealsOf(it, key) {
  return (it.days?.[key] || [])
    .map((m) => ({ name: m.name || '', time: m.time || '', dishes: parseDishes(m.lines) }))
    .filter((m) => m.dishes.length)
}

/**
 * Какое меню показать в момент now. after — уроки закончились (тогда ищем меню на завтра и дальше,
 * пропуская воскресенье и дни без меню). Нет меню → null (слайд пропускается).
 * → { key, date, dow, tomorrow, later, meals }
 */
export function menuDay(it, now, after = false) {
  for (let k = after ? 1 : 0; k < 8; k++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k)
    const key = dayKeyOf(it, date)
    const meals = key ? mealsOf(it, key) : []
    if (meals.length) return { key, date, dow: date.getDay(), tomorrow: k === 1, later: k > 1, meals }
    if (!after) return null
  }
  return null
}

/** Заголовок: «Меню на сегодня · вторник»; на завтра «сегодня» меняется на «завтра»; позже — «Меню на понедельник». */
export function menuHeading(it, view) {
  const title = (it.title || 'Меню на сегодня').trim()
  const day = DAY_NAMES[view.dow]
  if (view.tomorrow) return title.replace(/сегодня/i, 'завтра') + ' · ' + day
  if (view.later) return 'Меню на ' + DAY_ACC[view.dow]
  return title + ' · ' + day
}

// ---------- раскладка по экранам ----------
// Сцена 1920×1080: заголовок и поля оставляют области под карточки; блюдо — одна строка (название ужимается v-fit).
const AREA_H = 790
const GAP = 24
const AREA_W = { full: 1860, panel: 1420 }
export const MENU_MAX_SIZE = 52
export const MENU_MIN_SIZE = 28

/** Сколько строк блюд помещается в карточку высотой ch при размере шрифта size. */
const capacity = (ch, size) => Math.floor((ch - Math.round(size * 1.9) - 56) / (size * 1.5))

/** Влезает ли страница (список приёмов) при размере size. Единственный приём может идти в 2 колонки. */
function pageFits(meals, size) {
  const m = meals.length
  const ch = m <= 2 ? AREA_H : (AREA_H - GAP) / 2
  return meals.every((x) => Math.ceil(x.dishes.length / (m === 1 ? 2 : 1)) <= capacity(ch, size))
}

/** Режем список приёмов на n экранов поровну по числу блюд (приём может перейти на следующий экран). */
function splitPages(meals, n) {
  const flat = meals.flatMap((m, mi) => m.dishes.map((d) => ({ mi, d })))
  const pages = []
  for (let p = 0; p < n; p++) {
    const part = flat.slice(Math.round((p * flat.length) / n), Math.round(((p + 1) * flat.length) / n))
    const page = []
    for (const { mi, d } of part) {
      const m = meals[mi]
      const last = page[page.length - 1]
      if (last && last.mi === mi) last.dishes.push(d)
      else page.push({ mi, name: m.name, time: m.time, dishes: [d] })
    }
    if (page.length) pages.push(page.slice(0, MAX_MEALS))
  }
  return pages
}

/** Влезают ли строки блюд по ширине при размере size (оценка: средняя буква ≈ 0,6 кегля). Не влезло — v-fit ужмёт названия. */
function widthFits(meals, size, panel) {
  const across = meals.length === 1 ? 1 : 2
  const inner = ((AREA_W[panel ? 'panel' : 'full'] - GAP * (across - 1)) / across) - 80
  return meals.every((m) => {
    const cols = dishCols(m, meals.length, size)
    const w = cols === 2 ? (inner - 48) / 2 : inner
    return m.dishes.every((d) => {
      const need = d.name.length * 0.6 * size + (d.size ? (d.size.length + 1) * 0.48 * size + 18 : 0) + (d.price ? 3.2 * size + 18 : 0)
      return need <= w
    })
  })
}

/**
 * Размер шрифта блюд и экраны: сначала всё на одном экране (52…28 px), не влезло — два, потом три.
 * Длинные названия дополнительно уменьшают шрифт (но не меньше 28 px — дальше их ужимает v-fit).
 * panel — шаблон «с панелью справа» (экран уже). → { size, pages: [[{ name, time, dishes }]] }
 */
export function fitMenu(meals, panel = false) {
  let pages = [meals]
  for (let n = 1; n <= 3; n++) {
    if (n > 1) pages = splitPages(meals, n)
    for (let size = MENU_MAX_SIZE; size >= MENU_MIN_SIZE; size -= 2) {
      if (!pages.every((p) => pageFits(p, size))) continue
      let s = size
      while (s > MENU_MIN_SIZE && !pages.every((p) => widthFits(p, s, panel))) s -= 2
      return { size: s, pages }
    }
  }
  return { size: MENU_MIN_SIZE, pages }
}

/** Сколько экранов займёт меню (для расчёта длительности слайда). */
export const menuPageCount = (meals) => (meals?.length ? fitMenu(meals).pages.length : 1)

/** Число колонок блюд внутри карточки: у единственного приёма с длинным списком — две. */
export function dishCols(meal, mealsOnPage, size) {
  if (mealsOnPage !== 1) return 1
  return meal.dishes.length > capacity(AREA_H, size) ? 2 : 1
}

/** Таблица из Excel (столбцы блюдо | выход | цена) → текст строк «блюдо — выход — цена». */
export function tableToLines(rows) {
  return rows
    .map((r) => {
      const [name, size, price] = [r[0] || '', r[1] || '', r[2] || '']
      if (!name) return ''
      return [name, size, num(price) ? price + ' ₽' : price].filter(Boolean).join(' — ')
    })
    .filter(Boolean)
    .join('\n')
}
