<script setup>
// Выбор цветовой темы (как у вкладок табло): v-model = ключ темы '5'…'11' | 'changes'.
import { THEMES, themeBackground } from '../themes.js'

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
</template>
