<script setup>
// Меню столовой: заголовок «МЕНЮ НА СЕГОДНЯ · ВТОРНИК» и стеклянные карточки приёмов пищи (1–2 в ряд, 3–4 сеткой 2×2).
// После последнего урока показывает завтрашний день. Длинное меню: шрифт мельче, потом несколько экранов по очереди.
// На экране идёт (экранов × item.duration) секунд, потом 'done'. В редакторе — превью выбранного дня (проп day, active = false).
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { vFit } from '../fit.js'
import { afterLessons } from '../store.js'
import { menuDay, menuHeading, mealsOf, fitMenu, dishCols, DAY_NAMES } from '../menu.js'
import SlideStage from '../components/SlideStage.vue'
import InfoPanel from './InfoPanel.vue'

const props = defineProps({
  item: Object, // слайд плейлиста type: 'menu'
  active: Boolean,
  layout: { type: String, default: 'full' }, // 'panel' — справа панель с часами, звонками, изменениями
  day: { type: String, default: '' }, // превью в редакторе: ключ дня из item.days вместо «по часам»
  page: { type: Number, default: 0 }, // превью: номер экрана
})
const emit = defineEmits(['done'])

const now = ref(new Date())
const panel = computed(() => props.layout === 'panel')

// какой день показываем: по часам или (в превью) выбранный в редакторе
const view = computed(() => {
  if (props.day) {
    const key = Number(props.day)
    const dow = key > 7 ? key - 7 : key
    return { dow: dow % 7, tomorrow: false, later: false, meals: mealsOf(props.item, props.day) }
  }
  return menuDay(props.item, now.value, afterLessons(now.value)) || { dow: now.value.getDay(), meals: [] }
})
const heading = computed(() => menuHeading(props.item, view.value))
const fit = computed(() => fitMenu(view.value.meals, panel.value))

const idx = ref(0)
const pageIdx = computed(() => (props.day ? Math.min(props.page, fit.value.pages.length - 1) : Math.min(idx.value, fit.value.pages.length - 1)))
const meals = computed(() => fit.value.pages[pageIdx.value] || [])
const gridClass = computed(() => 'n' + Math.min(4, Math.max(1, meals.value.length)))

let timer = null
let tick = null
function step() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (!props.active) return
    if (idx.value + 1 < fit.value.pages.length) {
      idx.value++
      step()
    } else emit('done')
  }, props.item.duration * 1000)
}
watch(
  () => props.active,
  (a) => {
    if (a) {
      idx.value = 0
      step()
    } else clearTimeout(timer)
  },
)
onMounted(() => {
  if (props.active) step()
  tick = setInterval(() => (now.value = new Date()), 20_000)
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  clearInterval(tick)
})
</script>

<template>
  <SlideStage :theme="item.theme">
    <div class="menu" :class="{ panel }" :style="{ '--fs': fit.size + 'px' }">
      <h1 class="head">{{ heading }}</h1>
      <div v-if="meals.length" class="grid" :class="gridClass">
        <section v-for="(m, mi) in meals" :key="mi" class="card">
          <header class="mh">
            <span v-fit="20" class="mname">{{ m.name || 'Меню' }}</span>
            <span v-if="m.time" class="mtime">{{ m.time }}</span>
          </header>
          <ul class="dishes" :style="{ columnCount: dishCols(m, meals.length, fit.size) }">
            <li v-for="(d, di) in m.dishes" :key="di">
              <span v-fit="16" class="dn">{{ d.name }}</span>
              <span v-if="d.size" class="ds">{{ d.size }}</span>
              <span v-if="d.price" class="dp">{{ d.price }}</span>
            </li>
          </ul>
        </section>
      </div>
      <div v-else class="empty">На {{ DAY_NAMES[view.dow] }} меню не задано</div>
    </div>
    <InfoPanel v-if="panel" in-stage />
  </SlideStage>
</template>

<style scoped>
.menu {
  position: absolute;
  inset: 30px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.menu.panel {
  right: 440px;
}
.head {
  margin: 0;
  height: 142px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-weight: 900;
  font-size: 84px;
  line-height: 1.1;
  text-transform: uppercase;
  text-shadow: var(--shadow-text);
  white-space: nowrap;
}
.panel .head {
  font-size: 64px;
}
.grid {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 24px;
  grid-template-columns: 1fr;
  grid-auto-rows: 1fr;
}
.grid.n2 {
  grid-template-columns: 1fr 1fr;
}
.grid.n3,
.grid.n4 {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}
.card {
  min-width: 0;
  min-height: 0;
  padding: 28px 40px;
  border-radius: 48px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1));
  border: 1px solid var(--glass-border);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    0 20px 60px rgba(0, 0, 0, 0.22);
  overflow: hidden;
  font-size: var(--fs);
}
.mh {
  height: 1.9em;
  display: flex;
  align-items: baseline;
  gap: 24px;
  color: var(--accent);
}
.mname {
  flex: 0 1 auto;
  min-width: 0;
  font-weight: 900;
  font-size: 1.25em;
  text-transform: uppercase;
  white-space: nowrap;
}
.mtime {
  margin-left: auto;
  font-weight: 800;
  font-size: 0.75em;
  opacity: 0.85;
  white-space: nowrap;
}
.dishes {
  margin: 0;
  padding: 0;
  list-style: none;
  column-gap: 48px;
}
.dishes li {
  display: flex;
  align-items: baseline;
  gap: 18px;
  height: 1.5em;
  line-height: 1.5em;
  break-inside: avoid;
  font-weight: 800;
  white-space: nowrap;
}
.dn {
  flex: 1;
  min-width: 0;
}
.ds {
  opacity: 0.7;
  font-weight: 800;
  font-size: 0.8em;
}
.dp {
  min-width: 3.2em;
  text-align: right;
  color: var(--accent);
  font-weight: 900;
}
.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 56px;
  opacity: 0.8;
}
</style>
