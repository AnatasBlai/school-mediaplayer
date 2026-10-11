<script setup>
// Окно правки новости: форма слева, живое превью справа. Правки сразу пишутся в слайд плейлиста
// (и уходят на экраны, как любая правка плейлиста).
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { mediaById, thumbUrl, layoutOf, NEWS_ANIMS } from '../playlist.js'
import NewsSlide from '../display/NewsSlide.vue'
import MediaPicker from './MediaPicker.vue'
import ThemeSwatches from './ThemeSwatches.vue'

const props = defineProps({ item: Object }) // слайд type: 'news' — правим прямо его
const emit = defineEmits(['close'])

const LABELS = ['Новости', 'Событие', 'Объявление', 'Поздравляем!', 'Внимание', 'Достижения']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
function today() {
  const d = new Date()
  props.item.date = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`
}

const cut = ref({ title: false, text: false }) // что в превью обрезано
const picking = ref(false)
function pick(id) {
  props.item.media = id
  picking.value = false
}
function setDuration(v) {
  props.item.duration = Math.min(3600, Math.max(3, Math.round(Number(v)) || props.item.duration))
}

const titleEl = ref(null)
const onKey = (e) => e.key === 'Escape' && !picking.value && emit('close')
onMounted(() => {
  window.addEventListener('keydown', onKey)
  if (!props.item.title) titleEl.value?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="a-modal-back" @mousedown.self="emit('close')">
    <div class="a-modal news-ed">
      <div class="head">
        <h2>Новость</h2>
        <span class="a-hint">Сохраняется сама и сразу видна на экранах</span>
        <button class="a-btn primary" @click="emit('close')">Готово</button>
      </div>

      <div class="cols">
        <div class="form">
          <div class="row2">
            <label>
              <span class="a-label">Метка</span>
              <input v-model="item.label" class="a-input" list="news-labels" maxlength="40" placeholder="Новости" />
              <datalist id="news-labels">
                <option v-for="l in LABELS" :key="l" :value="l" />
              </datalist>
            </label>
            <label>
              <span class="a-label">Дата (необязательно)</span>
              <span class="with-btn">
                <input v-model="item.date" class="a-input" maxlength="40" placeholder="9 октября" />
                <button class="a-btn small" @click="today">сегодня</button>
              </span>
            </label>
          </div>

          <label>
            <span class="a-label">Заголовок</span>
            <input ref="titleEl" v-model="item.title" class="a-input" maxlength="140" placeholder="Победа на олимпиаде по информатике" />
          </label>

          <label>
            <span class="a-label">Текст · {{ (item.text || '').length }} / 800</span>
            <textarea
              v-model="item.text"
              class="a-textarea"
              rows="7"
              maxlength="800"
              placeholder="2–5 предложений. Чем короче текст, тем крупнее он на экране."
            ></textarea>
          </label>

          <div>
            <span class="a-label">Фото</span>
            <div class="photo-row">
              <img v-if="item.media && mediaById(item.media)" class="mini" :src="thumbUrl(mediaById(item.media))" alt="" />
              <button class="a-btn" @click="picking = true">{{ item.media ? 'Заменить' : 'Выбрать из медиатеки' }}</button>
              <button v-if="item.media" class="a-btn" @click="delete item.media">Без фото</button>
              <span v-if="item.media" class="a-seg">
                <button :class="{ on: item.fit !== 'contain' }" @click="item.fit = 'cover'">Заполнить</button>
                <button :class="{ on: item.fit === 'contain' }" @click="item.fit = 'contain'">Целиком</button>
              </span>
            </div>
          </div>

          <div>
            <span class="a-label">Анимация</span>
            <div class="photo-row">
              <span class="a-seg">
                <button v-for="(v, k) in NEWS_ANIMS" :key="k" :class="{ on: (item.anim || 'none') === k }" @click="item.anim = k">{{ v[0] }}</button>
              </span>
            </div>
            <span class="a-hint">{{ NEWS_ANIMS[item.anim || 'none'][1] }}<template v-if="!item.media && ['zoom', 'drift', 'parallax'].includes(item.anim)"> Без фото — как «Появление текста».</template></span>
          </div>

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
          <div class="screen"><NewsSlide :item="item" :active="false" preview measure :layout="layoutOf(item)" @overflow="cut = $event" /></div>
          <p v-if="cut.title" class="a-warn">⚠ Заголовок не помещается целиком — сократите его</p>
          <p v-if="cut.text" class="a-warn">⚠ Текст не помещается — сократите его или уберите фото</p>
        </div>
      </div>
    </div>

    <MediaPicker v-if="picking" :current="item.media || ''" @pick="pick" @close="picking = false" />
  </div>
</template>

<style scoped>
.news-ed {
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
.form .a-input,
.form .a-textarea {
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
.photo-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.mini {
  width: 96px;
  height: 54px;
  object-fit: cover;
  border-radius: 6px;
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
