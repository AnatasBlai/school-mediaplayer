<script setup>
// «Погода»: «Погода в Учалах», крупно температура + значок + описание + ветер, ниже 3 дня прогноза карточками.
// Данные — из weatherStore (свежие); на экране идёт item.duration секунд, потом 'done'. Превью/проверка — проп data.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useWeather } from '../weatherStore.js'
import { weatherKind, fmtTemp, fmtTempShort, weatherTitle, dayNameOf, nextDays } from '../weather.js'
import SlideStage from '../components/SlideStage.vue'
import InfoPanel from './InfoPanel.vue'
import WeatherIcon from './WeatherIcon.vue'

const props = defineProps({
  item: Object, // слайд плейлиста type: 'weather'
  active: Boolean,
  preview: Boolean, // превью в редакторе: без таймера
  data: { type: Object, default: null }, // подмена данных (превью, проверка); null — из weatherStore
  layout: { type: String, default: 'full' }, // 'panel' — справа панель с часами, звонками, изменениями
})
const emit = defineEmits(['done'])

const live = useWeather()
const w = computed(() => props.data || live.value)
const panel = computed(() => props.layout === 'panel')
const kind = computed(() => (w.value ? weatherKind(w.value.current.code) : null))
const days = computed(() => (w.value ? nextDays(w.value) : []))
const wind = computed(() => Math.round(w.value?.current.wind ?? 0))

let timer = null
function start() {
  clearTimeout(timer)
  timer = setTimeout(() => props.active && emit('done'), props.item.duration * 1000)
}
watch(
  () => props.active,
  (a) => (a ? start() : clearTimeout(timer)),
)
onMounted(() => props.active && start())
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <SlideStage :theme="item.theme">
    <div class="wx" :class="{ panel }">
      <div v-if="w" class="card">
        <div class="head">{{ weatherTitle(w.place) }}</div>
        <div class="now">
          <WeatherIcon :kind="kind.icon" class="big-ico" />
          <div class="temp">{{ fmtTempShort(w.current.temp) }}</div>
          <div class="desc">
            <span class="word">{{ kind.word }}</span>
            <span class="wind">Ветер {{ wind }} м/с</span>
          </div>
        </div>
        <div v-if="days.length" class="days">
          <div v-for="d in days" :key="d.date" class="day">
            <span class="dn">{{ dayNameOf(d.date) }}</span>
            <WeatherIcon :kind="weatherKind(d.code).icon" class="d-ico" />
            <span class="range"><b>{{ fmtTemp(d.max) }}</b> <i>{{ fmtTemp(d.min) }}</i></span>
            <span class="dw">{{ weatherKind(d.code).word }}</span>
          </div>
        </div>
      </div>
    </div>
    <InfoPanel v-if="panel" in-stage />
  </SlideStage>
</template>

<style scoped>
.wx {
  position: absolute;
  inset: 30px;
  display: flex;
}
.wx.panel {
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
  font-size: 54px;
  font-weight: 900;
  text-transform: uppercase;
  white-space: nowrap;
  opacity: 0.9;
}
.now {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 50px;
}
.big-ico {
  font-size: 300px;
  flex: none;
}
.temp {
  flex: none;
  font-size: 260px;
  font-weight: 900;
  line-height: 1;
  color: var(--accent);
  text-shadow: var(--shadow-text);
  font-variant-numeric: tabular-nums;
}
.desc {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.word {
  font-size: 62px;
  font-weight: 900;
  line-height: 1.1;
  text-transform: uppercase;
  max-width: 560px;
}
.wind {
  font-size: 44px;
  font-weight: 700;
  opacity: 0.88;
}
.days {
  flex: none;
  display: flex;
  gap: 28px;
}
.day {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas: 'dn dn' 'ico range' 'dw dw';
  align-items: center;
  column-gap: 20px;
  padding: 24px 30px;
  border-radius: 40px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.25);
}
.dn {
  grid-area: dn;
  font-size: 38px;
  font-weight: 900;
  text-transform: uppercase;
}
.d-ico {
  grid-area: ico;
  font-size: 100px;
}
.range {
  grid-area: range;
  font-size: 54px;
  font-weight: 900;
  white-space: nowrap;
  text-align: right;
}
.range i {
  font-style: normal;
  font-size: 0.75em;
  opacity: 0.7;
}
.dw {
  grid-area: dw;
  font-size: 28px;
  font-weight: 700;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* с панелью справа места меньше */
.panel .card {
  padding: 40px 44px;
}
.panel .head {
  font-size: 44px;
}
.panel .now {
  gap: 30px;
}
.panel .big-ico {
  font-size: 220px;
}
.panel .temp {
  font-size: 190px;
}
.panel .word {
  font-size: 46px;
  max-width: 360px;
}
.panel .wind {
  font-size: 34px;
}
.panel .days {
  gap: 18px;
}
.panel .day {
  padding: 18px 20px;
}
.panel .dn {
  font-size: 30px;
}
.panel .d-ico {
  font-size: 76px;
}
.panel .range {
  font-size: 42px;
}
.panel .dw {
  font-size: 22px;
}
</style>
