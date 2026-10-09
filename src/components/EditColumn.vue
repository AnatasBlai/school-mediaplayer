<script setup>
// Универсальная колонка с редактируемыми строками.
// Используется и для уроков класса (предмет + кабинет), и для вкладки «Изменения» (класс + текст + кабинет).
import { computed, nextTick, ref, watch } from 'vue'
import { ui, isSel } from '../ui.js'
import { vFit } from '../fit.js'

const props = defineProps({
  colKey: String, // ключ колонки: буква класса или ch0/ch1/ch2
  label: String, // крупная подпись внизу («5А»), может быть пустой
  rows: Array,
  // поля строки: { k, cls, ph, max, grow }
  fields: Array,
  nowIdx: { type: Number, default: -1 }, // текущий урок
  nextIdx: { type: Number, default: -1 }, // следующий урок (во время перемены)
})
const emit = defineEmits(['commit'])

const inputRef = ref(null)
const growIndex = computed(() => props.fields.findIndex((f) => f.grow))

function onCellClick(idx, field) {
  if (ui.readonly) return
  if (isSel(props.colKey, idx, field)) {
    if (!ui.editing) startEdit()
    return
  }
  if (ui.editing) emit('commit')
  ui.sel = { letter: props.colKey, idx, field }
  ui.editing = false
}

function startEdit() {
  const row = props.rows[ui.sel.idx]
  ui.draft = row[ui.sel.field] || ''
  ui.editing = true
}

const isEditing = (idx, k) => ui.editing && isSel(props.colKey, idx, k)
const rowEditing = (idx) => ui.editing && ui.sel?.letter === props.colKey && ui.sel?.idx === idx
const isEmpty = (row) => props.fields.every((f) => !row[f.k])
const editingGrow = (idx) => growIndex.value >= 0 && isEditing(idx, props.fields[growIndex.value].k)

watch(
  () => ui.editing && ui.sel?.letter === props.colKey && `${ui.sel.idx}-${ui.sel.field}`,
  async (v) => {
    if (!v) return
    await nextTick()
    const el = Array.isArray(inputRef.value) ? inputRef.value[0] : inputRef.value
    if (el) {
      el.focus()
      const n = el.value.length
      el.setSelectionRange(n, n)
    }
  },
)

function onBlur(e) {
  if (e.relatedTarget?.dataset?.confirm) return
  if (ui.editing) emit('commit')
}
</script>

<template>
  <div class="column" :class="{ 'no-label': !label }">
    <div class="cells">
      <div
        v-for="(row, idx) in rows"
        :key="idx"
        class="pill"
        :class="{
          empty: isEmpty(row),
          active: ui.sel?.letter === colKey && ui.sel?.idx === idx,
          now: idx === nowIdx && !isEmpty(row),
          next: idx === nextIdx && !isEmpty(row),
          'editing-grow': editingGrow(idx),
        }"
      >
        <div
          v-for="(f, fi) in fields"
          :key="f.k"
          class="field"
          :class="[
            f.cls,
            {
              selected: isSel(colKey, idx, f.k),
              editing: isEditing(idx, f.k),
              'after-grow': growIndex >= 0 && fi > growIndex,
            },
          ]"
          @mousedown.stop
          @click.stop="onCellClick(idx, f.k)"
        >
          <input
            v-if="isEditing(idx, f.k)"
            ref="inputRef"
            v-model="ui.draft"
            class="edit-input"
            :maxlength="f.max || 40"
            :placeholder="f.ph"
            @blur="onBlur"
          />
          <span v-else-if="f.wrap" class="text wrap" :title="row[f.k]">{{ row[f.k] }}</span>
          <span v-else v-fit class="text" :title="row[f.k]">{{ row[f.k] }}</span>
        </div>

        <button
          v-if="rowEditing(idx)"
          class="confirm"
          data-confirm="1"
          title="Сохранить (Enter)"
          @mousedown.stop.prevent
          @click.stop="emit('commit')"
        >
          ✓
        </button>
      </div>
    </div>

    <div v-if="label" class="big-label">{{ label }}</div>
  </div>
</template>

<style scoped>
.column {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 10px 0;
  border-radius: 40px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1));
  border: 1px solid var(--glass-border);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    0 10px 30px rgba(0, 0, 0, 0.16);
  backdrop-filter: blur(6px);
}
.column.no-label {
  padding-bottom: 16px;
}

.cells {
  display: flex;
  flex-direction: column;
  gap: calc(var(--cell-h) * 0.24);
}

.pill {
  position: relative;
  height: var(--cell-h);
  display: flex;
  align-items: center;
  border-radius: 999px;
  background: var(--pill);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
  font-weight: 800;
  font-size: var(--cell-font);
  letter-spacing: 0.02em;
  text-shadow: var(--shadow-text);
  transition:
    background 0.3s,
    box-shadow 0.3s,
    transform 0.3s;
}
.pill.empty {
  background: rgba(255, 255, 255, 0.13);
}
.pill.active {
  background: rgba(255, 255, 255, 0.3);
}

/* текущий урок */
.pill.now {
  background: rgba(255, 255, 255, 0.42);
  box-shadow:
    inset 0 0 0 3px var(--accent),
    0 0 22px var(--accent);
  transform: scale(1.035);
  z-index: 2;
}
.pill.now::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 50%;
  width: 7px;
  height: 7px;
  margin-top: -3.5px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
  animation: pulse 1.6s ease-in-out infinite;
}
/* следующий урок во время перемены */
.pill.next {
  box-shadow: inset 0 0 0 2px var(--accent);
  animation: breathe 2.4s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.25;
  }
}
@keyframes breathe {
  50% {
    box-shadow: inset 0 0 0 2px transparent;
  }
}

.field {
  height: 100%;
  display: flex;
  align-items: center;
  cursor: pointer;
  border-radius: 999px;
  min-width: 0;
  outline: 2px solid transparent;
  outline-offset: -3px;
  transition:
    outline-color 0.12s,
    background 0.12s;
}
.field:hover {
  background: rgba(255, 255, 255, 0.08);
}
.field.selected {
  outline-color: var(--accent);
  background: rgba(255, 255, 255, 0.16);
}
.field.editing {
  outline-color: #fff;
  background: rgba(0, 0, 0, 0.2);
}

/* предмет / текст изменения — растягивается */
.subj {
  flex: 1 1 auto;
  padding: 0 4px 0 14px;
  text-transform: uppercase;
}
/* свободный текст на вкладке «Изменения» — обычный регистр */
.free {
  flex: 1 1 auto;
  padding: 0 6px 0 10px;
  font-weight: 700;
  letter-spacing: 0.01em;
}
/* класс на вкладке «Изменения» */
.cls {
  flex: 0 0 auto;
  min-width: calc(var(--cell-font) * 3.4);
  padding: 0 6px 0 16px;
  text-transform: uppercase;
  font-weight: 900;
  color: var(--accent);
}
.room {
  flex: 0 0 auto;
  min-width: calc(var(--cell-font) * 2.4);
  justify-content: flex-end;
  padding: 0 13px 0 4px;
  text-transform: uppercase;
}

.pill.editing-grow .after-grow {
  display: none;
}
.pill.editing-grow .field.editing {
  margin-right: 44px;
}
.field.room.editing {
  padding-right: 46px;
}

.text {
  display: block;
  min-width: 0;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.text.wrap {
  white-space: normal;
  font-size: 0.86em;
  line-height: 1.12;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}
.pill:has(.text.wrap) {
  border-radius: 28px;
}

.edit-input {
  width: 100%;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: #fff;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  text-shadow: none;
}
.edit-input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}
.room .edit-input {
  width: calc(var(--cell-font) * 3.6);
  text-align: right;
}
.cls .edit-input {
  width: calc(var(--cell-font) * 3.2);
}

.confirm {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 5;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: none;
  background: var(--accent);
  color: #222;
  font-size: 18px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.big-label {
  margin-top: auto;
  padding-bottom: 18px;
  text-align: center;
  font-weight: 900;
  font-size: var(--label-font);
  line-height: 1;
  color: #000;
  filter: url(#outline);
  user-select: none;
  white-space: nowrap;
}
</style>
