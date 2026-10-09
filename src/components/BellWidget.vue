<script setup>
import { computed } from 'vue'
import { fmt, plural } from '../bells.js'

const props = defineProps({ status: Object })

const lessonName = (n) => (n === 0 ? 'Нулевой урок' : `${n}-й урок`)

const view = computed(() => {
  const s = props.status || { kind: 'none' }
  const mins = s.left != null ? Math.max(1, Math.ceil(s.left - 1e-9)) : 0
  const minWord = plural(mins, 'минута', 'минуты', 'минут')
  switch (s.kind) {
    case 'lesson':
      return {
        title: `Идёт ${lessonName(s.bell.n).toLowerCase()}`,
        sub: `${fmt(s.bell.start)} – ${fmt(s.bell.end)}`,
        big: mins,
        unit: `${minWord} до звонка`,
        progress: s.progress,
        mode: 'lesson',
      }
    case 'break':
      return {
        title: 'Перемена',
        sub: `Далее ${lessonName(s.bell.n).toLowerCase()} в ${fmt(s.bell.start)}`,
        big: mins,
        unit: `${minWord} до урока`,
        progress: s.progress,
        mode: 'break',
      }
    case 'before':
      return s.left <= 90
        ? { title: 'Скоро уроки', sub: `${lessonName(s.bell.n)} в ${fmt(s.bell.start)}`, big: mins, unit: `${minWord} до начала`, mode: 'break' }
        : { title: 'Уроки начнутся', sub: `в ${fmt(s.bell.start)}`, mode: 'idle' }
    case 'after':
      return { title: 'Уроки закончились', sub: `Последний звонок в ${fmt(s.bell.end)}`, mode: 'idle' }
    default:
      return { title: 'Сегодня уроков нет', sub: 'Хорошего отдыха!', mode: 'idle' }
  }
})
</script>

<template>
  <div class="bell" :class="view.mode">
    <div class="info">
      <div class="title">{{ view.title }}</div>
      <div class="sub">{{ view.sub }}</div>
      <div v-if="view.progress != null" class="bar">
        <span :style="{ transform: `scaleX(${Math.min(1, Math.max(0, view.progress))})` }"></span>
      </div>
    </div>
    <div v-if="view.big != null" class="count">
      <div class="num">{{ view.big }}</div>
      <div class="unit">{{ view.unit }}</div>
    </div>
  </div>
</template>

<style scoped>
.bell {
  margin-top: 22px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px 16px 22px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.16);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3);
}
.bell.lesson {
  background: rgba(255, 255, 255, 0.24);
  box-shadow:
    inset 0 0 0 2px var(--accent),
    0 0 18px rgba(255, 255, 255, 0.12);
}
.info {
  flex: 1;
  min-width: 0;
}
.title {
  font-weight: 900;
  font-size: 21px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  line-height: 1.15;
}
.sub {
  margin-top: 4px;
  font-weight: 700;
  font-size: 16px;
  opacity: 0.85;
}
.bar {
  margin-top: 10px;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.2);
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--accent);
  transform-origin: left center;
  transition: transform 1s linear;
}
.count {
  flex: 0 0 auto;
  min-width: 96px;
  text-align: center;
}
.num {
  font-weight: 900;
  font-size: 54px;
  line-height: 1;
  color: var(--accent);
}
.unit {
  margin-top: 4px;
  font-weight: 700;
  font-size: 12px;
  line-height: 1.2;
  opacity: 0.85;
  max-width: 100px;
}
</style>
