<script setup>
// Окно правки слайда «Именинники»: заголовок, вид имён, цвет, анимация, время; кнопка «Список именинников».
// Справа живое превью: сегодняшние именинники, а если их нет — пример. Правки сразу пишутся в слайд плейлиста.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { layoutOf, saveAsTemplate } from '../playlist.js'
import { todayBirthdays } from '../birthdaysStore.js'
import { displayName, TEACHER } from '../birthdays.js'
import { plural } from '../bells.js'
import BirthdaysSlide from '../display/BirthdaysSlide.vue'
import BirthdaysModal from './BirthdaysModal.vue'
import ThemeSwatches from './ThemeSwatches.vue'

const props = defineProps({ item: Object }) // слайд type: 'birthdays' — правим прямо его
const emit = defineEmits(['close'])

// фото у слайда нет — из анимаций новости нужны только эти две
const ANIMS = { none: 'Без анимации', rise: 'Появление: панель и имена по очереди' }
const SAMPLE = [
  ['Иванова Анна Сергеевна', '5А'],
  ['Петров Тимур Ильдарович', '8Б', true],
  ['Сафина Алия Маратовна', '11А'],
  ['Галиева Гульнара Рашитовна', TEACHER],
]
const today = computed(() => todayBirthdays(props.item.full))
const sample = computed(() => SAMPLE.map(([n, cls, weekend]) => ({ name: displayName(n, cls, props.item.full), cls, weekend: !!weekend })))
const people = computed(() => (today.value.length ? today.value : sample.value))

function setDuration(v) {
  props.item.duration = Math.min(3600, Math.max(3, Math.round(Number(v)) || props.item.duration))
}

const listOpen = ref(false)
const onKey = (e) => e.key === 'Escape' && !listOpen.value && emit('close')
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="a-modal-back" @mousedown.self="emit('close')">
    <div class="a-modal bd-ed">
      <div class="head">
        <h2>Именинники</h2>
        <span class="a-hint">Сохраняется сам и сразу виден на экранах</span>
        <button class="a-btn" title="Запомнить этот слайд как заготовку" @click="saveAsTemplate(item)">Сохранить как шаблон</button>
        <button class="a-btn primary" @click="emit('close')">Готово</button>
      </div>

      <div class="cols">
        <div class="form">
          <div class="list-box">
            <button class="a-btn primary" data-ro-allow @click="listOpen = true">🎂 Список именинников…</button>
            <span class="a-hint">
              Список один на всё табло. Слайд сам показывает тех, у кого день рождения сегодня, а в понедельник — и тех, у
              кого он был в выходные.
            </span>
            <b :class="{ none: !today.length }">
              {{ today.length ? `Сегодня ${today.length} ${plural(today.length, 'именинник', 'именинника', 'именинников')}` : 'Сегодня именинников нет — слайд пропускается' }}
            </b>
          </div>

          <label>
            <span class="a-label">Заголовок</span>
            <input v-model="item.title" class="a-input" maxlength="60" placeholder="С днём рождения!" />
          </label>

          <div>
            <span class="a-label">Как писать имена</span>
            <span class="a-seg">
              <button :class="{ on: !item.full }" @click="item.full = false">Имя Ф.</button>
              <button :class="{ on: item.full }" @click="item.full = true">Показывать полностью: Имя Фамилия</button>
            </span>
            <p class="a-hint">Учителя — по имени и отчеству. Дата рождения на экране не видна.</p>
          </div>

          <div>
            <span class="a-label">Анимация</span>
            <span class="a-seg">
              <button v-for="(v, k) in ANIMS" :key="k" :class="{ on: (item.anim || 'none') === k }" @click="item.anim = k">{{ v }}</button>
            </span>
          </div>

          <div class="row2">
            <div>
              <span class="a-label">Цвет</span>
              <ThemeSwatches v-model="item.theme" />
            </div>
            <label>
              <span class="a-label">Сек. на экран имён</span>
              <input type="number" class="a-input a-num" min="3" max="3600" :value="item.duration" @change="setDuration($event.target.value)" />
              <span class="a-hint">Больше 12 имён — несколько экранов по очереди</span>
            </label>
          </div>
        </div>

        <div class="preview">
          <span class="a-label">{{ today.length ? 'Так будет на экране сегодня' : 'Так будет на экране (пример)' }}</span>
          <div class="screen"><BirthdaysSlide :item="item" :people="people" preview :layout="layoutOf(item)" /></div>
        </div>
      </div>
    </div>
    <BirthdaysModal v-if="listOpen" @close="listOpen = false" />
  </div>
</template>

<style scoped>
.bd-ed {
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
.list-box {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid #353943;
}
.list-box b {
  color: #8fe0a2;
}
.list-box b.none {
  color: #9aa1ad;
}
.row2 {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.row2 > * {
  flex: 1;
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
