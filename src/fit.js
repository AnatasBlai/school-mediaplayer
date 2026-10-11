// Директива v-fit: уменьшает шрифт, пока текст не поместится в ширину элемента.
// Использование: <span v-fit>…</span> или <div v-fit="40">…</div> (минимальный размер шрифта).
export function fitText(el, min = 10) {
  el.style.fontSize = ''
  if (!el.textContent || !el.isConnected) return
  const avail = el.clientWidth
  if (!avail) return
  let size = parseFloat(getComputedStyle(el).fontSize)
  // ширина с дробной частью: scrollWidth округляется и пропускает «почти влезло»
  const k = el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1
  const textWidth = () => {
    el.style.flex = 'none' // у flex-элемента с базой 0 width иначе не действует
    el.style.width = 'max-content'
    el.style.maxWidth = 'none'
    const w = el.getBoundingClientRect().width / (k || 1)
    el.style.flex = ''
    el.style.width = ''
    el.style.maxWidth = ''
    return w
  }
  let w = textWidth()
  if (w <= avail - 0.5) return
  // сразу прыгаем к нужному размеру, затем добиваем мелким шагом
  size = Math.max(min, Math.floor(size * ((avail - 1) / w) * 2) / 2)
  el.style.fontSize = size + 'px'
  let guard = 20
  while (textWidth() > avail - 0.5 && size > min && guard--) {
    size -= 0.5
    el.style.fontSize = size + 'px'
  }
}

export const vFit = {
  mounted(el, b) {
    const run = () => fitText(el, b.value || 10)
    requestAnimationFrame(run)
    document.fonts?.ready.then(run)
  },
  updated(el, b) {
    requestAnimationFrame(() => fitText(el, b.value || 10))
  },
}
