<script setup>
// Новость: фото слева (если есть), справа стеклянная панель — метка · дата, заголовок, текст.
// Без фото текст на всю сцену. На экране идёт item.duration секунд, потом 'done'.
// В редакторе — живое превью (active = false, таймера нет).
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { mediaById, mediaUrl, thumbUrl } from '../playlist.js'
import SlideStage from '../components/SlideStage.vue'
import InfoPanel from './InfoPanel.vue'

const props = defineProps({
  item: Object, // слайд плейлиста type: 'news'
  active: Boolean,
  preview: Boolean, // превью в редакторе: анимация идёт по кругу
  layout: { type: String, default: 'full' }, // 'panel' — справа панель с часами, звонками, изменениями
})
const emit = defineEmits(['done'])

const file = computed(() => (props.item.media ? mediaById(props.item.media) : null))
const photo = computed(() => (file.value?.type === 'image' ? file.value : null))

// размер шрифта по длине текста: длинный заголовок и текст мельче, чтобы влезли
const pick = (len, steps) => steps.find(([max]) => len <= max)?.[1] ?? steps[steps.length - 1][1]
const panel = computed(() => props.layout === 'panel')
const titleSize = computed(() => {
  const n = (props.item.title || '').length
  const s = pick(n, [[24, 96], [45, 80], [80, 64], [120, 54], [999, 46]])
  return Math.round(s * (photo.value ? 0.85 : 1) * (panel.value ? 0.85 : 1)) + 'px'
})
const textSize = computed(() => {
  const n = (props.item.text || '').length
  const s = pick(n, [[120, 44], [250, 38], [400, 33], [600, 29], [999, 26]])
  return Math.round(s * (photo.value ? 0.9 : 1) * (panel.value ? 0.9 : 1)) + 'px'
})

// анимация: без фото движение фото/параллакс заменяется появлением текста
const anim = computed(() => {
  const a = props.item.anim || 'none'
  return !photo.value && ['zoom', 'drift', 'parallax'].includes(a) ? 'rise' : a
})
// стартует, когда слайд стал активным, и не сбрасывается при уходе (пока он тает под следующим);
// на каждый показ в плеере создаётся новый компонент, так что новая новость начинает с нуля
const run = ref(false)
// в превью редактора — по кругу туда-обратно; слишком долгий показ в превью сокращаем, чтобы движение было видно
const animTime = computed(() => {
  const d = props.preview ? Math.min(props.item.duration, 10) : props.item.duration
  return (anim.value === 'rise' ? (props.preview ? 2 : 1.2) : d) + 's'
})

let timer = null
function start() {
  clearTimeout(timer)
  run.value = true
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
    <div
      class="news"
      :class="[{ 'with-photo': photo, panel, run: run || preview }, 'anim-' + anim, { loop: preview }]"
      :style="{ '--anim-time': animTime }"
    >
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
    <InfoPanel v-if="panel" in-stage />
  </SlideStage>
</template>

<style scoped>
.news {
  position: absolute;
  inset: 30px;
  display: flex;
  gap: 30px;
}
/* место справа — под панель 440 px (у её карточки свой отступ 30 px) */
.news.panel {
  right: 440px;
}
.photo {
  position: relative;
  flex: 0 0 900px;
  border-radius: 56px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}
.panel .photo {
  flex-basis: 640px;
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
/* анимации: только transform и opacity; запускает класс run (слайд стал активным) */
.run.anim-zoom .photo img {
  animation: news-zoom var(--anim-time) ease-in-out both;
}
.run.anim-drift .photo img {
  transform: scale(1.08);
  animation: news-drift var(--anim-time) ease-in-out both;
}
.run.anim-parallax .photo img {
  animation: news-par-photo var(--anim-time) ease-in-out both;
}
.run.anim-parallax .card {
  animation: news-par-card var(--anim-time) ease-in-out both;
}
.run.anim-rise .card {
  animation: news-rise var(--anim-time) ease-out both;
}
.loop.run .photo img,
.loop.run .card {
  animation-iteration-count: infinite;
  animation-direction: alternate;
}
/* до старта кадр уже в начальном положении, чтобы не прыгал */
.anim-parallax .photo img {
  transform: scale(1.06) translateX(10px);
}
.anim-rise .card {
  opacity: 0;
}
.anim-rise.run .card {
  opacity: 1;
}
@keyframes news-zoom {
  from { transform: scale(1); }
  to { transform: scale(1.08); }
}
@keyframes news-drift {
  from { transform: scale(1.08) translateX(-2%); }
  to { transform: scale(1.08) translateX(2%); }
}
@keyframes news-par-photo {
  from { transform: scale(1.06) translateX(10px); }
  to { transform: scale(1.06) translateX(-10px); }
}
@keyframes news-par-card {
  from { transform: translateX(-5px); }
  to { transform: translateX(5px); }
}
@keyframes news-rise {
  from { transform: translateY(30px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
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
