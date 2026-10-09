<script setup>
// Слайд с фото или видео. Пока active=false — лежит невидимым и заранее грузится (следующий слайд).
// Фото показывается item.duration секунд, видео — до конца. Потом 'done'.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { mediaUrl, thumbUrl } from '../playlist.js'

const props = defineProps({
  item: Object, // слайд плейлиста
  file: Object, // элемент медиатеки
  active: Boolean,
})
const emit = defineEmits(['done'])

const img = ref(null)
const video = ref(null)
let timer = null
let failed = false
let finished = false

function finish() {
  if (!props.active || finished) return
  finished = true
  clearTimeout(timer)
  emit('done')
}

// файл не открылся — не задерживаемся на чёрном экране, но и не листаем слишком быстро
function fail() {
  failed = true
  if (props.active) {
    clearTimeout(timer)
    timer = setTimeout(finish, 2000)
  }
}

function start() {
  finished = false
  clearTimeout(timer)
  if (failed) return (timer = setTimeout(finish, 2000))
  if (props.file.type === 'image') return (timer = setTimeout(finish, props.item.duration * 1000))

  const v = video.value
  v.currentTime = 0
  v.muted = !props.item.sound
  // со звуком браузер может не дать запустить видео без клика — тогда показываем без звука
  v.play().catch(() => {
    v.muted = true
    v.play().catch(fail)
  })
  // страховка, если видео зависнет и не дойдёт до конца
  timer = setTimeout(finish, ((props.file.duration || 600) + 15) * 1000)
}

function stop() {
  clearTimeout(timer)
  video.value?.pause()
}

watch(
  () => props.active,
  (a) => (a ? start() : stop()),
)
onMounted(() => {
  // заранее раскодируем фото, чтобы смена слайда не подтормаживала
  img.value?.decode?.().catch(() => {})
  if (props.active) start()
})
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="media" :class="item.fit">
    <!-- при «вписать» поля заполняет размытое увеличенное превью (маленькая картинка, без filter: blur) -->
    <div
      v-if="item.fit === 'contain' && thumbUrl(file)"
      class="back"
      :style="{ backgroundImage: `url(&quot;${thumbUrl(file)}&quot;)` }"
    ></div>
    <img v-if="file.type === 'image'" ref="img" :src="mediaUrl(file)" alt="" @error="fail" />
    <video v-else ref="video" :src="mediaUrl(file)" preload="auto" playsinline muted @ended="finish" @error="fail"></video>
  </div>
</template>

<style scoped>
.media {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #000;
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
  background: rgba(0, 0, 0, 0.5);
}
img,
video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.contain img,
.contain video {
  object-fit: contain;
}
</style>
