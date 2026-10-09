<script setup>
// Новость: фото слева (если есть), справа стеклянная панель — метка · дата, заголовок, текст.
// Без фото текст на всю сцену. На экране идёт item.duration секунд, потом 'done'.
// В редакторе — живое превью (active = false, таймера нет).
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { mediaById, mediaUrl, thumbUrl } from '../playlist.js'
import SlideStage from '../components/SlideStage.vue'

const props = defineProps({
  item: Object, // слайд плейлиста type: 'news'
  active: Boolean,
})
const emit = defineEmits(['done'])

const file = computed(() => (props.item.media ? mediaById(props.item.media) : null))
const photo = computed(() => (file.value?.type === 'image' ? file.value : null))

// размер шрифта по длине текста: длинный заголовок и текст мельче, чтобы влезли
const pick = (len, steps) => steps.find(([max]) => len <= max)?.[1] ?? steps[steps.length - 1][1]
const titleSize = computed(() => {
  const n = (props.item.title || '').length
  const s = pick(n, [[24, 96], [45, 80], [80, 64], [120, 54], [999, 46]])
  return Math.round(s * (photo.value ? 0.85 : 1)) + 'px'
})
const textSize = computed(() => {
  const n = (props.item.text || '').length
  const s = pick(n, [[120, 44], [250, 38], [400, 33], [600, 29], [999, 26]])
  return Math.round(s * (photo.value ? 0.9 : 1)) + 'px'
})

let timer = null
function start() {
  clearTimeout(timer)
  timer = setTimeout(() => props.active && emit('done'), props.item.duration * 1000)
}
watch(
  () => props.active,
  (a) => (a ? start() : clearTimeout(timer)),
)
onMounted(() => props.active && start())
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <SlideStage :theme="item.theme">
    <div class="news" :class="{ 'with-photo': photo }">
      <div v-if="photo" class="photo" :class="item.fit">
        <div v-if="item.fit === 'contain'" class="back" :style="{ backgroundImage: `url(&quot;${thumbUrl(photo)}&quot;)` }"></div>
        <img :src="mediaUrl(photo)" alt="" />
      </div>
      <div class="card">
        <div v-if="item.label || item.date" class="meta">
          <span v-if="item.label" class="label">{{ item.label }}</span>
          <span v-if="item.date" class="date">{{ item.date }}</span>
        </div>
        <h1 class="title" :style="{ fontSize: titleSize }">{{ item.title }}</h1>
        <div v-if="item.text" class="text" :style="{ fontSize: textSize }">{{ item.text }}</div>
      </div>
    </div>
  </SlideStage>
</template>

<style scoped>
.news {
  position: absolute;
  inset: 30px;
  display: flex;
  gap: 30px;
}
.photo {
  position: relative;
  flex: 0 0 900px;
  border-radius: 56px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}
.photo img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.photo.contain img {
  object-fit: contain;
}
.back {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
}
.back::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
}
.card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 34px;
  padding: 60px 70px;
  border-radius: 64px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1));
  border: 1px solid var(--glass-border);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    0 20px 60px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}
.with-photo .card {
  padding: 56px 56px;
}
.meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 18px;
  font-weight: 800;
  font-size: 30px;
}
.label {
  padding: 8px 26px;
  border-radius: 999px;
  background: var(--text);
  color: var(--tab-text);
  text-shadow: none;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.date {
  color: var(--accent);
}
.title {
  margin: 0;
  font-weight: 900;
  line-height: 1.08;
  text-transform: uppercase;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.text {
  font-weight: 600;
  line-height: 1.38;
  white-space: pre-line;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 12;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
