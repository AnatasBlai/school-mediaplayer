import { reactive } from 'vue'

// Состояние выделения/редактирования ячейки урока
export const ui = reactive({
  sel: null, // { letter: ключ колонки, idx, field }
  editing: false,
  draft: '',
  settingsOpen: false,
})

export function isSel(letter, idx, field) {
  const s = ui.sel
  return !!s && s.letter === letter && s.idx === idx && s.field === field
}

export function clearSelection() {
  ui.sel = null
  ui.editing = false
  ui.draft = ''
}
