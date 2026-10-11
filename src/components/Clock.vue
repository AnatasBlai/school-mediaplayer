<script setup>
// Время «ЧЧ:ММ» с мигающим двоеточием (раз в секунду, мягко — только opacity)
import { computed } from 'vue'

const props = defineProps({ date: { type: Date, required: true } })

const hours = computed(() => props.date.toLocaleTimeString('ru-RU', { hour: '2-digit' }).slice(0, 2))
const minutes = computed(() => String(props.date.getMinutes()).padStart(2, '0'))
</script>

<template>
  <span class="time">{{ hours }}<span class="colon">:</span>{{ minutes }}</span>
</template>

<style scoped>
.time {
  font-variant-numeric: tabular-nums;
}
.colon {
  animation: colon-blink 1s ease-in-out infinite;
}
@keyframes colon-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.25;
  }
}
</style>
