<script setup>
// «Сегодня»: крупно дата («20 ОКТЯБРЯ»), ниже карточки праздников дня (до 3) — значок группы, название, пояснение.
// На экране идёт item.duration секунд, потом 'done'. В превью редактора — проп list (пример или сегодняшние даты).
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { holidaysFor, GROUP_ICONS, MAX_SHOWN } from '../holidays.js'
import { MONTHS_GEN } from '../birthdays.js'
import { vFit } from '../fit.js'
import SlideStage from '../components/SlideStage.vue'
import InfoPanel from './InfoPanel.vue'

const props = defineProps({
  item: Object, // слайд плейлиста type: 'today'
  active: Boolean,
  preview: Boolean, // превью в редакторе: без таймера
  list: { type: Array, default: null }, // превью: что показать (null — даты сегодняшнего дня)
  layout: { type: String, default: 'full' }, // 'panel' — справа панель с часами, звонками, изменениями
})
const emit = defineEmits(['done'])

const panel = computed(() => props.layout === 'panel')
const now = ref(new Date())
const shown = computed(() => (props.list || holidaysFor(props.item, now.value)).slice(0, MAX_SHOWN))
const dateText = computed(() => `${now.value.getDate()} ${MONTHS_GEN[now.value.getMonth()]}`)
// шрифт названия — по числу карточек и наличию пояснений
const titleSize = computed(() => {
  const n = shown.value.length
  const base = n <= 1 ? 92 : n === 2 ? 70 : 56
  return Math.round(base * (panel.value ? 0.8 : 1)) + 'px'
})

const anim = computed(() => ((props.item.anim || 'none') === 'none' ? 'none' : 'rise'))
const run = ref(false)

let timer = null
let tick = null
function start() {
  run.value = true
  clearTimeout(timer)
  timer = setTimeout(() => props.active && emit('done'), props.item.duration * 1000)
}
watch(
  () => props.active,
  (a) => (a ? start() : clearTimeout(timer)),
)
onMounted(() => {
  ;(props.active || props.preview) && (run.value = true)
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
    <div class="td" :class="[{ panel, run }, 'anim-' + anim]">
      <div class="card">
        <div class="head">Сегодня</div>
        <div class="date">{{ dateText }}</div>
        <div v-if="shown.length" class="list" :style="{ fontSize: titleSize }">
          <div v-for="(h, k) in shown" :key="k" class="row" :style="{ '--i': k }">
            <span class="ico">{{ GROUP_ICONS[h.group] }}</span>
            <div class="txt">
              <span v-fit="24" class="nm">{{ h.title }}</span>
              <span v-if="h.note" class="note">{{ h.note }}</span>
            </div>
          </div>
        </div>
        <div v-else class="nobody">Сегодня особых дат нет</div>
      </div>
    </div>
    <InfoPanel v-if="panel" in-stage />
  </SlideStage>
</template>

<style scoped>
.td {
  position: absolute;
  inset: 30px;
  display: flex;
}
.td.panel {
  right: 440px;
}
.card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 50px 60px;
  border-radius: 64px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1));
  border: 1px solid var(--glass-border);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    0 20px 60px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}
.head {
  font-size: 44px;
  font-weight: 800;
  text-transform: uppercase;
  opacity: 0.85;
}
.date {
  font-size: 150px;
  font-weight: 900;
  line-height: 1.05;
  text-transform: uppercase;
  color: var(--accent);
  white-space: nowrap;
  text-shadow: var(--shadow-text);
}
.panel .date {
  font-size: 120px;
}
.list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.3em;
  padding-top: 20px;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.35em;
  padding: 0.25em 0.45em;
  border-radius: 0.5em;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.25);
}
.ico {
  flex: none;
  font-size: 1.1em;
  line-height: 1;
}
.txt {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.nm {
  display: block;
  font-weight: 900;
  line-height: 1.12;
  white-space: nowrap;
  overflow: hidden;
}
.note {
  font-size: 0.45em;
  font-weight: 700;
  opacity: 0.85;
}
.nobody {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44px;
  font-weight: 800;
  opacity: 0.6;
}
/* «Появление»: карточка и строки по очереди — только transform и opacity, один раз */
.anim-rise .card {
  opacity: 0;
}
.anim-rise.run .card {
  opacity: 1;
  animation: td-rise 1.2s ease-out both;
}
.anim-rise.run .row {
  animation: td-pop 0.6s ease-out both;
  animation-delay: calc(0.4s + var(--i) * 0.15s);
}
@keyframes td-rise {
  from { transform: translateY(30px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes td-pop {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
</style>
