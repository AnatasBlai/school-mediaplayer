<script setup>
// Именинники дня: заголовок «С ДНЁМ РОЖДЕНИЯ!», дата, имена карточками (класс — мелко акцентом), учителя — отдельной
// строкой «Поздравляем учителей:». Больше PER_SCREEN имён — экраны по очереди, каждый item.duration секунд, потом 'done'.
// Список — с сервера (GET /api/birthdays/today, уже без дат и в нужном виде имени); в превью редактора — проп people.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { birthdayScreens, MONTHS_GEN } from '../birthdays.js'
import { todayBirthdays } from '../birthdaysStore.js'
import { vFit } from '../fit.js'
import SlideStage from '../components/SlideStage.vue'
import InfoPanel from './InfoPanel.vue'

const props = defineProps({
  item: Object, // слайд плейлиста type: 'birthdays'
  active: Boolean,
  preview: Boolean, // превью в редакторе: экраны листаются по кругу
  people: { type: Array, default: null }, // превью: кого показать (null — сегодняшние с сервера)
  layout: { type: String, default: 'full' }, // 'panel' — справа панель с часами, звонками, изменениями
})
const emit = defineEmits(['done'])

const panel = computed(() => props.layout === 'panel')
const list = computed(() => props.people || todayBirthdays(props.item.full))
const screens = computed(() => birthdayScreens(list.value))
const idx = ref(0)
const scr = computed(() => screens.value[Math.min(idx.value, screens.value.length - 1)] || null)
const dateText = (() => {
  const d = new Date()
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`
})()

// ---------- раскладка: колонок не больше, чем влезает; шрифт — по числу строк на экране ----------
// длинные имена («Камила Хабибуллина», учителя по имени-отчеству) — на колонку меньше, иначе сильно ужимаются
const longNames = computed(() => list.value.some((p) => p.name.length > 14))
const maxCols = computed(() => (panel.value ? 3 : 4) - (longNames.value ? 1 : 0))
const colsFor = (n) => Math.min(maxCols.value, n <= 3 ? n : n === 4 ? 2 : n <= 6 ? 3 : 4)
const sCols = computed(() => colsFor(scr.value?.students.length || 0) || 1)
const tCols = computed(() => colsFor(scr.value?.teachers.length || 0) || 1)
const rows = computed(() => {
  if (!scr.value) return 1
  const { students: s, teachers: t } = scr.value
  return Math.ceil(s.length / sCols.value) + Math.ceil(t.length / tCols.value) + (t.length && s.length ? 0.6 : 0)
})
const nameSize = computed(() => {
  const r = rows.value
  const base = r <= 1 ? 96 : r <= 2 ? 80 : r <= 3 ? 66 : r <= 4 ? 56 : 48
  return Math.round(base * (panel.value ? 0.85 : 1)) + 'px'
})

// ---------- анимация: без фото «Приближение» и др. — как «Появление» (как у новости без фото) ----------
const anim = computed(() => ((props.item.anim || 'none') === 'none' ? 'none' : 'rise'))
const run = ref(false)

// ---------- смена экранов ----------
const PREVIEW_SECS = 4
let timer = null
function tick() {
  clearTimeout(timer)
  timer = setTimeout(
    () => {
      if (props.preview) {
        idx.value = screens.value.length ? (idx.value + 1) % screens.value.length : 0
        tick()
      } else if (props.active) {
        if (idx.value + 1 < screens.value.length) {
          idx.value++
          tick()
        } else emit('done')
      }
    },
    (props.preview ? PREVIEW_SECS : props.item.duration) * 1000,
  )
}
function start() {
  run.value = true
  idx.value = 0
  tick()
}
watch(
  () => props.active,
  (a) => (a ? start() : clearTimeout(timer)),
)
onMounted(() => (props.active || props.preview) && start())
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <SlideStage :theme="item.theme">
    <div class="bd" :class="[{ panel, run: run || preview }, 'anim-' + anim]">
      <div class="card">
        <div class="head">
          <h1 v-fit="40" class="title">{{ item.title || 'С днём рождения!' }}</h1>
          <span v-if="screens.length > 1" class="dots">
            <i v-for="(s, k) in screens" :key="k" :class="{ on: k === idx }"></i>
          </span>
        </div>
        <div class="date">{{ dateText }}</div>

        <Transition name="swap" mode="out-in">
          <div v-if="scr" :key="idx" class="body" :style="{ fontSize: nameSize }">
            <div v-if="scr.students.length" class="grid" :style="{ '--cols': sCols }">
              <div v-for="(p, k) in scr.students" :key="k" class="person" :style="{ '--i': k }">
                <span v-fit="20" class="nm">{{ p.name }}</span>
                <span class="sub">
                  <span class="cls">{{ p.cls }}</span>
                  <span v-if="p.weekend" class="wk">в выходные</span>
                </span>
              </div>
            </div>
            <template v-if="scr.teachers.length">
              <div class="thead">Поздравляем учителей:</div>
              <div class="grid" :style="{ '--cols': tCols }">
                <div v-for="(p, k) in scr.teachers" :key="k" class="person teacher" :style="{ '--i': scr.students.length + k }">
                  <span v-fit="20" class="nm">{{ p.name }}</span>
                  <span v-if="p.weekend" class="sub"><span class="wk">в выходные</span></span>
                </div>
              </div>
            </template>
          </div>
          <div v-else key="none" class="nobody">Сегодня именинников нет</div>
        </Transition>
      </div>
    </div>
    <InfoPanel v-if="panel" in-stage />
  </SlideStage>
</template>

<style scoped>
.bd {
  position: absolute;
  inset: 30px;
  display: flex;
}
.bd.panel {
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
  display: flex;
  align-items: center;
  gap: 24px;
}
.title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 104px;
  font-weight: 900;
  line-height: 1.05;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
}
.panel .title {
  font-size: 84px;
}
.date {
  margin-top: 12px;
  font-size: 40px;
  font-weight: 800;
  color: var(--accent);
}
.dots {
  display: flex;
  gap: 12px;
}
.dots i {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
}
.dots i.on {
  background: var(--accent);
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.4em;
  padding-top: 24px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  gap: 0.35em;
  width: 100%;
  max-width: calc(var(--cols) * 760px);
  margin: 0 auto;
}
.person {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.3em 0.4em;
  border-radius: 0.5em;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.25);
  text-align: center;
}
.nm {
  display: block;
  width: 100%;
  font-weight: 900;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
}
.sub {
  display: flex;
  align-items: baseline;
  gap: 0.6em;
  margin-top: 0.12em;
  font-size: 0.5em;
  font-weight: 800;
}
.cls {
  color: var(--accent);
}
.wk {
  opacity: 0.8;
}
.thead {
  width: 100%;
  max-width: 1700px;
  margin: 0.3em auto 0;
  text-align: center;
  font-size: 0.6em;
  font-weight: 900;
  text-transform: uppercase;
  color: var(--accent);
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
/* «Появление»: карточка и имена по очереди — только transform и opacity, один раз за экран */
.anim-rise .card {
  opacity: 0;
}
.anim-rise.run .card {
  opacity: 1;
  animation: bd-rise 1.2s ease-out both;
}
.anim-rise.run .person {
  animation: bd-pop 0.6s ease-out both;
  animation-delay: calc(0.4s + var(--i) * 0.08s);
}
@keyframes bd-rise {
  from { transform: translateY(30px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes bd-pop {
  from { transform: scale(0.85); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.swap-enter-active {
  transition:
    opacity 0.45s ease,
    transform 0.45s ease;
}
.swap-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}
.swap-enter-from {
  opacity: 0;
  transform: translateY(24px);
}
.swap-leave-to {
  opacity: 0;
  transform: translateY(-16px);
}
</style>
