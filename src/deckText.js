// Карточки колод в виде текста: одна строка — одна карточка. Общий для редактора (вставка списком,
// «скопировать текстом») и сервера (стартовый набор). Чистые функции, без Vue.
//
// Колонки разделяются табуляцией (вставка из Excel) или «;».
//   Текст                                     → факт
//   Заголовок ; текст                         → факт с заголовком
//   ? Вопрос ; ответ ; ! пояснение            → открытый вопрос / загадка
//   ? Вопрос ; *верный ; неверный ; … ; ! пояснение → вопрос с вариантами (2–4, верный — со звёздочкой)

export const CARD_TYPES = { fact: 'Факт', choice: 'Вопрос с вариантами', open: 'Вопрос / загадка' }
export const LETTERS = ['А', 'Б', 'В', 'Г']

export const newCardId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

/** Разбирает одну строку. null — пустая строка. */
export function parseLine(line) {
  const sep = line.includes('\t') ? '\t' : ';'
  const parts = line.split(sep).map((s) => s.trim())
  while (parts.length && !parts[parts.length - 1]) parts.pop()
  if (!parts.length || !parts.join('')) return null

  if (parts[0].startsWith('?')) {
    const text = parts[0].slice(1).trim()
    let explain = ''
    const rest = []
    for (const p of parts.slice(1)) {
      if (p.startsWith('!')) explain = p.slice(1).trim()
      else if (p) rest.push(p)
    }
    const star = rest.findIndex((p) => p.startsWith('*'))
    if (star >= 0 && rest.length >= 2) {
      const options = rest.slice(0, 4).map((p) => p.replace(/^\*\s*/, ''))
      return { type: 'choice', text, options, correct: Math.min(star, options.length - 1), explain }
    }
    return { type: 'open', text, answer: rest[0] || '', explain: explain || rest[1] || '' }
  }
  if (parts.length >= 2) return { type: 'fact', title: parts[0], text: parts.slice(1).join('; ') }
  return { type: 'fact', title: '', text: parts[0] }
}

/** Разбирает текст целиком: карточки без id. */
export function parseCards(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(parseLine)
    .filter(Boolean)
}

/** Обратно в текст (через «; ») — чтобы скопировать колоду, поправить в таблице и вставить заново. */
export function cardsToText(cards) {
  const clean = (s) => String(s || '').replace(/[;\t\r\n]+/g, ',').trim()
  return cards
    .map((c) => {
      if (c.type === 'choice') {
        const opts = c.options.map((o, i) => (i === c.correct ? '*' : '') + clean(o))
        return ['? ' + clean(c.text), ...opts, ...(c.explain ? ['! ' + clean(c.explain)] : [])].join('; ')
      }
      if (c.type === 'open') return ['? ' + clean(c.text), clean(c.answer), ...(c.explain ? ['! ' + clean(c.explain)] : [])].join('; ')
      return c.title ? clean(c.title) + '; ' + clean(c.text) : clean(c.text)
    })
    .join('\n')
}
