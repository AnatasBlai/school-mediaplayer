<script setup>
// «Кружки и секции». Режим «Сегодня»: строки «15:00–15:45 · название · кабинет · руководитель», закончившиеся — тусклее,
// идущее сейчас — с меткой «ИДЁТ». Режим «Вся неделя»: карточки кружков с днями и временем. Не влезает — экраны по очереди
// (раскладка — src/clubs.js), на каждом item.duration секунд, после последнего 'done'. В превью редактора (preview) экраны листаются сами.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { clubScreens, clubsHeading, weekCols } from '../clubs.js'
import { vFit } from '../fit.js'
import SlideStage from '../components/SlideStage.vue'
import InfoPanel from './InfoPanel.vue'

const props = defineProps({
  item: Object, // слайд плейлиста type: 'clubs'
  active: Boolean,
  preview: Boolean, // превью в редакторе: без done, экраны листаются по кругу
  layout: { type: String, default: 'full' }, // 'panel' — справа панель с часами, звонками, изменениями
})
const emit = defineEmits(['done'])

const panel = computed(() => props.layout === 'panel')
const now = ref(new Date())
const week = computed(() => props.item.mode === 'week')
const screens = computed(() => clubScreens(props.item, now.value, weekCols(panel.value)))
const idx = ref(0)
const scr = computed(() => screens.value[Math.min(idx.value, screens.value.length - 1)])
const rows = computed(() => scr.value.rows || [])
const cards = computed(() => scr.value.cards || [])
const heading = computed(() => clubsHeading(props.item))
const empty = computed(() => !rows.value.length && !cards.value.length)

// шрифт строк «Сегодня»: чем их меньше, тем крупнее; мельче 28 px не бывает
const size = computed(() => {
  const n = rows.value.length
  const name = n <= 3 ? 66 : n <= 5 ? 54 : n <= 6 ? 46 : 40
  return { '--nm': Math.round(name * (panel.value ? 0.9 : 1)) + 'px', '--mt': (n <= 3 ? 38 : n <= 5 ? 34 : 30) + 'px' }
})
const meta = (r) => [r.room && 'каб. ' + r.room, r.teacher, r.who].filter(Boolean).join(' · ')
const cardMeta = (c) => {
  const second = [c.room && 'каб. ' + c.room, c.who].filter(Boolean).join(' · ')
  // у карточки с тремя и более строками времени (.dense) заметки в одну строку, иначе не хватает высоты
  return c.lines.length >= 3 ? [[c.teacher, second].filter(Boolean).join(' · ')] : [c.teacher, second].filter(Boolean)
}

let timer = null
let tick = null
function step() {
  clearTimeout(timer)
  const secs = props.preview ? 4 : props.item.duration
  timer = setTimeout(() => {
    if (props.preview) {
      idx.value = (idx.value + 1) % screens.value.length
      step()
    } else if (props.active) {
      if (idx.value + 1 < screens.value.length) {
        idx.value++
        step()
      } else emit('done')
    }
  }, secs * 1000)
}
watch(
  () => props.active,
  (a) => {
    if (a) {
      idx.value = 0
      now.value = new Date()
      step()
    } else clearTimeout(timer)
  },
)
onMounted(() => {
  if (props.active || props.preview) step()
  tick = setInterval(() => (now.value = new Date()), 20_000)
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  clearInterval(tick)
})
</script>

<template>
  <SlideStage :theme="item.theme">
    <div class="clubs" :class="{ panel, week }">
      <h1 v-fit="36" class="head">{{ heading }}</h1>
      <div v-if="empty" class="empty">{{ week ? 'Кружки не добавлены' : 'Сегодня занятий нет' }}</div>
      <div v-else-if="!week" class="rows" :style="size">
        <div v-for="(r, k) in rows" :key="r.from + r.name + k" class="row" :class="r.state">
          <span class="time">{{ r.from }}–{{ r.to }}</span>
          <div class="txt">
            <span v-fit="28" class="nm">{{ r.name }}</span>
            <span v-if="meta(r)" class="mt">{{ meta(r) }}</span>
          </div>
          <b v-if="r.state === 'now'" class="now">Идёт</b>
        </div>
      </div>
      <div v-else class="grid" :class="{ c2: panel }">
        <section v-for="(c, k) in cards" :key="c.name + k" class="card" :class="{ dense: c.lines.length >= 3 }">
          <span class="cn">{{ c.name }}</span>
          <span v-for="(m, mi) in cardMeta(c)" :key="mi" class="cm">{{ m }}</span>
          <div class="times">
            <span v-for="(l, li) in c.lines" :key="li">{{ l }}</span>
          </div>
        </section>
      </div>
      <div v-if="screens.length > 1" class="dots">
        <i v-for="(s, k) in screens" :key="k" :class="{ on: k === Math.min(idx, screens.length - 1) }"></i>
      </div>
    </div>
    <InfoPanel v-if="panel" in-stage />
  </SlideStage>
</template>

<style scoped>
.clubs {
  position: absolute;
  inset: 30px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 34px 50px 30px;
  border-radius: 64px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1));
  border: 1px solid var(--glass-border);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    0 20px 60px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}
.clubs.panel {
  right: 440px;
  padding: 30px 40px 26px;
}
.head {
  flex: none;
  margin: 0;
  height: 86px;
  line-height: 86px;
  font-size: 64px;
  font-weight: 900;
  text-transform: uppercase;
  color: var(--accent);
  white-space: nowrap;
  overflow: hidden;
  text-shadow: var(--shadow-text);
}
.panel .head {
  font-size: 54px;
}
.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44px;
  font-weight: 800;
  opacity: 0.6;
}

/* ---- сегодня ---- */
.rows {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
}
.row {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: calc(var(--nm) * 0.16) 28px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.25);
}
.row.past {
  opacity: 0.4;
}
.row.now {
  background: rgba(255, 255, 255, 0.3);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent);
}
.time {
  flex: none;
  width: calc(var(--nm) * 5.9);
  font-size: calc(var(--nm) * 0.75);
  font-weight: 900;
  color: var(--accent);
  white-space: nowrap;
  text-shadow: var(--shadow-text);
}

.txt {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.nm {
  display: block;
  font-size: var(--nm);
  font-weight: 900;
  line-height: 1.12;
  white-space: nowrap;
  overflow: hidden;
  text-transform: uppercase;
}
.mt {
  font-size: var(--mt);
  font-weight: 700;
  line-height: 1.2;
  opacity: 0.9;
}
.now {
  flex: none;
  padding: 4px 22px;
  border-radius: 999px;
  background: var(--accent);
  color: #1c1c1c;
  font-size: 32px;
  font-weight: 900;
  text-transform: uppercase;
}

/* ---- вся неделя ---- */
.grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.grid.c2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.card {
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px 24px;
  border-radius: 32px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.25);
  overflow: hidden;
}
.cn {
  display: block;
  font-size: 38px;
  font-weight: 900;
  line-height: 1.12;
  flex: none;
  overflow: hidden;
  text-transform: uppercase;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.dense .cn {
  -webkit-line-clamp: 1;
}
.cm {
  flex: none;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
  opacity: 0.9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.times {
  flex: none;
  margin-top: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 0 22px;
  font-size: 30px;
  font-weight: 900;
  line-height: 1.25;
  color: var(--accent);
  text-shadow: var(--shadow-text);
}
.times span {
  white-space: nowrap;
}

.dots {
  position: absolute;
  right: 44px;
  top: 40px;
  display: flex;
  gap: 10px;
}
.dots i {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.35);
}
.dots i.on {
  background: var(--accent);
}
</style>
