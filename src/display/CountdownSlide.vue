<script setup>
// Обратный отсчёт: «ДО КАНИКУЛ» — огромное число с правильным окончанием — подпись.
// Меньше суток: «Уже сегодня!» или «Осталось 5 ч 20 мин» (если задано время).
// На экране идёт item.duration секунд, потом 'done'. В редакторе — живое превью (active = false, таймера нет).
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { countdownState } from '../rules.js'
import { plural } from '../bells.js'
import SlideStage from '../components/SlideStage.vue'
import InfoPanel from './InfoPanel.vue'

const props = defineProps({
  item: Object, // слайд плейлиста type: 'countdown'
  active: Boolean,
  layout: { type: String, default: 'full' }, // 'panel' — справа панель с часами, звонками, изменениями
})
const emit = defineEmits(['done'])

const now = ref(new Date())
const c = computed(() => countdownState(props.item, now.value))
const panel = computed(() => props.layout === 'panel')

// большая часть: число + слово, либо фраза «Уже сегодня!» / «Осталось 5 ч 20 мин»
const big = computed(() => {
  if (!props.item.date || c.value.over) return { num: '0', word: 'дней' } // пустая заготовка в превью
  if (!c.value.today) return { num: String(c.value.days), word: plural(c.value.days, 'день', 'дня', 'дней') }
  if (props.item.time) {
    const { hours, mins } = c.value
    return { text: 'Осталось ' + (hours ? hours + ' ч ' : '') + mins + ' мин' }
  }
  return { text: 'Уже сегодня!' }
})
const numSize = computed(() => Math.round((panel.value ? 340 : 420) * (big.value.num?.length > 3 ? 0.7 : 1)) + 'px')

let timer = null
let tick = null
function start() {
  clearTimeout(timer)
  timer = setTimeout(() => props.active && emit('done'), props.item.duration * 1000)
}
watch(
  () => props.active,
  (a) => (a ? start() : clearTimeout(timer)),
)
onMounted(() => {
  props.active && start()
  tick = setInterval(() => (now.value = new Date()), 20_000)
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  clearInterval(tick)
})
</script>

<template>
  <SlideStage :theme="item.theme">
    <div class="cd" :class="{ panel }">
      <div class="card">
        <div class="head">До {{ item.title || '…' }}</div>
        <div v-if="big.num" class="count">
          <span class="num" :style="{ fontSize: numSize }">{{ big.num }}</span>
          <span class="word">{{ big.word }}</span>
        </div>
        <div v-else class="today">{{ big.text }}</div>
        <div v-if="item.note" class="note">{{ item.note }}</div>
      </div>
    </div>
    <InfoPanel v-if="panel" in-stage />
  </SlideStage>
</template>

<style scoped>
.cd {
  position: absolute;
  inset: 30px;
  display: flex;
}
/* место справа — под панель 440 px */
.cd.panel {
  right: 440px;
}
.card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 50px 70px;
  text-align: center;
  border-radius: 64px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1));
  border: 1px solid var(--glass-border);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    0 20px 60px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}
.head {
  max-width: 100%;
  font-weight: 900;
  font-size: 96px;
  line-height: 1.1;
  text-transform: uppercase;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.panel .head {
  font-size: 76px;
}
.count {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 40px;
  color: var(--accent);
}
.num {
  font-weight: 900;
  line-height: 1;
}
.word {
  font-weight: 900;
  font-size: 110px;
  text-transform: uppercase;
}
.panel .word {
  font-size: 84px;
}
.today {
  font-weight: 900;
  font-size: 150px;
  line-height: 1.05;
  color: var(--accent);
  text-transform: uppercase;
  overflow-wrap: anywhere;
}
.panel .today {
  font-size: 110px;
}
.note {
  max-width: 100%;
  font-weight: 800;
  font-size: 52px;
  line-height: 1.25;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.panel .note {
  font-size: 42px;
}
</style>
