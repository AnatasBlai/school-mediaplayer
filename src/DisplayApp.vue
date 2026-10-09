<script setup>
// Экран для зрителей (/): браузер на весь экран на втором мониторе. Только показ, без редактирования.
import ScheduleBoard from './components/ScheduleBoard.vue'
</script>

<template>
  <div class="display">
    <ScheduleBoard />
  </div>
</template>

<style scoped>
.display {
  position: fixed;
  inset: 0;
  cursor: none;
}
</style>
