<script setup>
// Бегущая строка внизу экрана поверх слайдов. Размеры через vh (Player — не масштабируемая сцена).
// Лента = два одинаковых куска подряд, едет на -50% — шов незаметен; анимация — один transform.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { playlist } from '../playlist.js'
import { tickerTexts } from '../rules.js'

const props = defineProps({ now: { type: Date, required: true } })

const texts = computed(() => tickerTexts(playlist.ticker, props.now))
const line = computed(() => texts.value.join('  •  '))
const SPEEDS = { slow: 60, normal: 100 } // пикселей холста 1080 в секунду

const piece = ref(null)
const duration = ref(30)

// кусок должен быть не уже экрана: повторяем текст нужное число раз
const repeat = ref(1)
async function measure() {
  repeat.value = 1
  await nextTick()
  const el = piece.value
  if (!el || !line.value) return
  const one = el.scrollWidth
  if (!one) return
  repeat.value = Math.max(1, Math.ceil(window.innerWidth / one))
  await nextTick()
  const scale = window.innerHeight / 1080
  duration.value = Math.max(5, el.scrollWidth / ((SPEEDS[playlist.ticker.speed] || 100) * scale))
}
watch([line, () => playlist.ticker.speed], measure)
onMounted(() => {
  measure()
  document.fonts?.ready.then(measure)
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => window.removeEventListener('resize', measure))
</script>

<template>
  <div v-if="texts.length" class="ticker">
    <div class="track" :style="{ animationDuration: duration + 's' }">
      <span v-for="n in 2" :key="n" :ref="(e) => n === 1 && (piece = e)" class="piece">
        <template v-for="r in repeat" :key="r">{{ line }}<i>•</i></template>
      </span>
    </div>
  </div>
</template>

<style scoped>
.ticker {
  --u: calc(100vh / 1080);
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 4;
  height: calc(var(--u) * 60);
  overflow: hidden;
  background: rgba(10, 12, 18, 0.72);
  border-top: 1px solid var(--glass-border, rgba(255, 255, 255, 0.25));
  color: #fff;
  font-weight: 800;
  font-size: calc(var(--u) * 30);
  line-height: calc(var(--u) * 60);
  white-space: nowrap;
}
.track {
  display: flex;
  width: max-content;
  will-change: transform;
  animation: tick linear infinite;
}
.piece {
  flex: none;
}
.piece i {
  font-style: normal;
  padding: 0 calc(var(--u) * 28);
}
@keyframes tick {
  to {
    transform: translateX(-50%);
  }
}
</style>
