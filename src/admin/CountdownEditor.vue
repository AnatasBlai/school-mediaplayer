<script setup>
// Окно правки обратного отсчёта: форма слева, живое превью справа. Правки сразу пишутся в слайд плейлиста.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { layoutOf } from '../playlist.js'
import { countdownState } from '../rules.js'
import CountdownSlide from '../display/CountdownSlide.vue'
import ThemeSwatches from './ThemeSwatches.vue'

const props = defineProps({ item: Object }) // слайд type: 'countdown' — правим прямо его
const emit = defineEmits(['close'])

const TITLES = ['каникул', 'Последнего звонка', 'Нового года', 'ЕГЭ', 'ОГЭ', 'конца четверти']
function setDuration(v) {
  props.item.duration = Math.min(3600, Math.max(3, Math.round(Number(v)) || props.item.duration))
}

const titleEl = ref(null)
const onKey = (e) => e.key === 'Escape' && emit('close')
onMounted(() => {
  window.addEventListener('keydown', onKey)
  if (!props.item.title) titleEl.value?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="a-modal-back" @mousedown.self="emit('close')">
    <div class="a-modal cd-ed">
      <div class="head">
        <h2>Обратный отсчёт</h2>
        <span class="a-hint">Сохраняется сам и сразу виден на экранах</span>
        <button class="a-btn primary" @click="emit('close')">Готово</button>
      </div>

      <div class="cols">
        <div class="form">
          <label>
            <span class="a-label">До чего</span>
            <input ref="titleEl" v-model="item.title" class="a-input" list="cd-titles" maxlength="60" placeholder="каникул" />
            <datalist id="cd-titles">
              <option v-for="t in TITLES" :key="t" :value="t" />
            </datalist>
            <span class="a-hint">На экране: «До {{ item.title || '…' }}»</span>
          </label>

          <div class="row2">
            <label>
              <span class="a-label">Дата события</span>
              <input v-model="item.date" type="date" class="a-input" />
            </label>
            <label>
              <span class="a-label">Время (необязательно)</span>
              <span class="with-btn">
                <input v-model="item.time" type="time" class="a-input" />
                <button v-if="item.time" class="a-btn small" @click="item.time = ''">убрать</button>
              </span>
            </label>
          </div>
          <p v-if="!item.date" class="a-warn">⚠ Без даты слайд не сохранится — выберите дату</p>
          <p v-else-if="countdownState(item).over" class="a-warn">⚠ Событие уже прошло — слайд на экране не показывается</p>
          <span v-else class="a-hint">
            Без времени слайд идёт весь день события, потом сам перестаёт показываться. Со временем — до этой минуты.
          </span>

          <label>
            <span class="a-label">Подпись под числом (необязательно)</span>
            <input v-model="item.note" class="a-input" maxlength="120" placeholder="Осенние каникулы с 27 октября" />
          </label>

          <div class="row2">
            <div>
              <span class="a-label">Цвет</span>
              <ThemeSwatches v-model="item.theme" />
            </div>
            <label>
              <span class="a-label">Показывать, сек.</span>
              <input type="number" class="a-input a-num" min="3" max="3600" :value="item.duration" @change="setDuration($event.target.value)" />
            </label>
          </div>
        </div>

        <div class="preview">
          <span class="a-label">Так будет на экране</span>
          <div class="screen"><CountdownSlide :item="item" :active="false" :layout="layoutOf(item)" /></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cd-ed {
  width: min(1400px, 96vw);
}
.head {
  display: flex;
  align-items: center;
  gap: 14px;
}
.head .a-hint {
  margin-right: auto;
}
.cols {
  display: flex;
  gap: 20px;
  min-height: 0;
  overflow: auto;
}
.form {
  flex: 0 0 520px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.form label {
  display: flex;
  flex-direction: column;
}
.form .a-input {
  width: 100%;
}
.row2 {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.row2 > * {
  flex: 1;
}
.with-btn {
  display: flex;
  gap: 6px;
}
.preview {
  flex: 1;
  min-width: 0;
}
.screen {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  overflow: hidden;
  background: #000;
}
</style>
