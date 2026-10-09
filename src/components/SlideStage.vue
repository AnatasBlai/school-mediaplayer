<script setup>
// Сцена 1920×1080 с фоном цветовой темы (как у табло), масштабируется под свой блок.
// На ней рисуются новости и карточки колод — и на экране, и в превью редактора.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { THEMES, themeBackground } from '../themes.js'

const props = defineProps({ theme: { type: String, default: '6' } })

const W = 1920
const H = 1080
const root = ref(null)
const scale = ref(1)
function fit() {
  const el = root.value
  if (el) scale.value = Math.min(el.clientWidth / W, el.clientHeight / H)
}

const t = computed(() => THEMES[props.theme] || THEMES[6])
const stageStyle = computed(() => ({
  transform: `translate(-50%, -50%) scale(${scale.value})`,
  background: themeBackground(t.value),
  '--accent': t.value.accent,
  '--shadow-text': t.value.shadow,
  '--tab-text': t.value.tabText,
}))

let obs
onMounted(() => {
  fit()
  obs = new ResizeObserver(fit)
  obs.observe(root.value)
})
onBeforeUnmount(() => obs?.disconnect())
</script>

<template>
  <div ref="root" class="slide-stage" :style="{ background: t.base }">
    <div class="stage" :style="stageStyle">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.slide-stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.stage {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1920px;
  height: 1080px;
  overflow: hidden;
  color: var(--text);
  text-shadow: var(--shadow-text);
}
</style>
