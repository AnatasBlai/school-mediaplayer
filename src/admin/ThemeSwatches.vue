<script setup>
// Выбор цветовой темы: v-model = ключ темы '5'…'11' | 'changes' | новые ('sea', 'sunset'…).
// Первый ряд — темы параллелей (как вкладки табло), второй — «Ещё цвета».
import { THEMES, EXTRA_THEMES, themeBackground } from '../themes.js'

const model = defineModel({ type: String, default: '6' })
</script>

<template>
  <div class="a-swatches">
    <button
      v-for="(t, k) in THEMES"
      :key="k"
      class="a-swatch"
      :class="{ on: model === k }"
      :title="t.name"
      :style="{ background: themeBackground(t) }"
      @click="model = k"
    ></button>
  </div>
  <div class="a-swatches-more">Ещё цвета</div>
  <div class="a-swatches">
    <button
      v-for="(t, k) in EXTRA_THEMES"
      :key="k"
      class="a-swatch"
      :class="{ on: model === k }"
      :title="t.name"
      :style="{ background: themeBackground(t) }"
      @click="model = k"
    ></button>
  </div>
</template>

<style scoped>
.a-swatches-more {
  margin: 8px 0 4px;
  font-size: 12px;
  opacity: 0.6;
}
</style>
