<script setup>
// Победители: оформление как у новости (фото слева, стеклянная панель, анимации, цвет), но вместо текста —
// группы-классы по очереди: пьедестал 2–1–3 и ниже список призёров. Каждый экран группы идёт item.duration
// секунд; не поместившиеся призёры — на экранах «продолжение» (раскладка — src/winners.js). После последнего — 'done'.
// В редакторе — превью (preview): показывает только группу group и листает её экраны по кругу.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { mediaById, mediaUrl, thumbUrl } from '../playlist.js'
import { winnerScreens, listCols } from '../winners.js'
import { fitText } from '../fit.js'
import SlideStage from '../components/SlideStage.vue'
import InfoPanel from './InfoPanel.vue'

const props = defineProps({
  item: Object, // слайд плейлиста type: 'winners'
  active: Boolean,
  preview: Boolean, // превью в редакторе
  group: { type: Number, default: -1 }, // превью: какую группу показывать (-1 — все)
  layout: { type: String, default: 'full' }, // 'panel' — справа панель с часами, звонками, изменениями
  measure: Boolean, // только превью в редакторе: мерить, не обрезано ли что-то, и сообщать в 'overflow'
})
const emit = defineEmits(['done', 'overflow'])

const file = computed(() => (props.item.media ? mediaById(props.item.media) : null))
const photo = computed(() => (file.value?.type === 'image' ? file.value : null))
const panel = computed(() => props.layout === 'panel')

// ---------- экраны ----------
const maxCols = computed(() => listCols(panel.value, !!photo.value))
const allScreens = computed(() => winnerScreens(props.item, maxCols.value))
const screens = computed(() => (props.preview && props.group >= 0 ? allScreens.value.filter((s) => s.group === props.group) : allScreens.value))
const groupIds = computed(() => [...new Set(allScreens.value.map((s) => s.group))])
const idx = ref(0)
const scr = computed(() => screens.value[Math.min(idx.value, screens.value.length - 1)] || null)
const scrKey = computed(() => (scr.value ? scr.value.group + '.' + scr.value.part : 'none'))
watch(
  () => props.group,
  () => (idx.value = 0),
)

// список призёров: колонок не больше, чем позволяет место, и по 4+ строки в колонке
const cols = computed(() => (scr.value ? Math.max(1, Math.min(maxCols.value, Math.ceil(scr.value.list.length / 4))) : 1))
const rows = computed(() => (scr.value ? Math.ceil(scr.value.list.length / cols.value) : 1))

// ---------- размеры ----------
const pick = (len, steps) => steps.find(([max]) => len <= max)?.[1] ?? steps[steps.length - 1][1]
const scale = computed(() => (photo.value ? 0.85 : 1) * (panel.value ? 0.85 : 1))
const titleSize = computed(() => Math.round(pick((props.item.title || '').length, [[24, 80], [45, 66], [999, 54]]) * scale.value) + 'px')
// пьедестал: без списка под ним — крупнее; несколько человек на месте — имена мельче
const bigPodium = computed(() => !scr.value?.list.length)
const STEPS = { small: [150, 115, 85], big: [230, 175, 130] }
const stepHeight = (pi) => (bigPodium.value ? STEPS.big : STEPS.small)[pi] + 'px'
function nameSize(pi) {
  const n = scr.value?.podium?.[pi].length || 1
  const base = (bigPodium.value ? 62 : 50) * (n === 1 ? 1 : n === 2 ? 0.85 : 0.72)
  return Math.round(base * (photo.value ? 0.85 : 1) * (panel.value ? 0.9 : 1)) + 'px'
}

// шрифт списка: самый крупный из ступеней, при котором список помещается; мельче 30 px не делаем.
// Под пьедесталом список не крупнее 36 px — победители должны быть заметнее призёров
const LIST_SIZES = [48, 44, 40, 36, 33, 30]
const UNDER_MAX = 36
const listCut = ref(false)
function fitList(list) {
  const box = list.parentElement
  if (!box || !list.isConnected) return
  const names = list.querySelectorAll('.nm')
  names.forEach((e) => (e.style.fontSize = ''))
  let ok = false
  for (const s of LIST_SIZES) {
    if (scr.value?.podium && s > UNDER_MAX) continue
    list.style.fontSize = s + 'px'
    if (list.offsetHeight <= box.clientHeight + 1) {
      ok = true
      break
    }
  }
  // очень длинное ФИО ужимается по ширине своей колонки
  names.forEach((e) => fitText(e, 22))
  listCut.value = !ok
  if (props.measure) doMeasure()
}
const vFitList = {
  mounted(el) {
    requestAnimationFrame(() => fitList(el))
    document.fonts?.ready.then(() => fitList(el))
  },
  updated(el) {
    requestAnimationFrame(() => fitList(el))
  },
}

// ---------- анимация (как у новости) ----------
const anim = computed(() => {
  const a = props.item.anim || 'none'
  return !photo.value && ['zoom', 'drift', 'parallax'].includes(a) ? 'rise' : a
})
const run = ref(false)
const total = computed(() => Math.max(1, allScreens.value.length) * props.item.duration)
const animTime = computed(() => {
  const d = props.preview ? Math.min(total.value, 10) : total.value
  return (anim.value === 'rise' ? (props.preview ? 2 : 1.2) : d) + 's'
})

// ---------- смена экранов ----------
const PREVIEW_SECS = 4 // в превью экраны группы листаются быстрее
let timer = null
function tick() {
  clearTimeout(timer)
  const secs = props.preview ? PREVIEW_SECS : props.item.duration
  timer = setTimeout(() => {
    if (props.preview) {
      idx.value = screens.value.length ? (idx.value + 1) % screens.value.length : 0
      tick()
    } else if (props.active) {
      if (idx.value + 1 < screens.value.length) {
        idx.value++
        tick()
      } else emit('done')
    }
  }, secs * 1000)
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

// ---------- предупреждения для редактора ----------
const titleEl = ref(null)
const rootEl = ref(null)
const cut = (el) => !!el && (el.scrollHeight > el.clientHeight + parseFloat(getComputedStyle(el).fontSize) * 0.4 || el.scrollWidth > el.clientWidth + 2)
let measureSeq = 0
async function doMeasure() {
  const seq = ++measureSeq
  await nextTick()
  await document.fonts?.ready
  if (seq !== measureSeq) return
  const names = [...(rootEl.value?.querySelectorAll('.pname') || [])]
  emit('overflow', { title: cut(titleEl.value), names: names.some(cut), list: !!scr.value?.list.length && listCut.value })
}
if (props.measure) {
  watch(() => [props.item.title, props.item.label, props.item.date, props.item.media, props.item.fit, props.layout, scrKey.value], doMeasure, { flush: 'post' })
  onMounted(doMeasure)
}
</script>

<template>
  <SlideStage :theme="item.theme">
    <div
      ref="rootEl"
      class="news"
      :class="[{ 'with-photo': photo, panel, run: run || preview }, 'anim-' + anim, { loop: preview }]"
      :style="{ '--anim-time': animTime }"
    >
      <div v-if="photo" class="photo" :class="item.fit">
        <div v-if="item.fit === 'contain'" class="back" :style="{ backgroundImage: `url(&quot;${thumbUrl(photo)}&quot;)` }"></div>
        <img :src="mediaUrl(photo)" alt="" />
      </div>
      <div class="card">
        <div v-if="item.label || item.date" class="meta">
          <span v-if="item.label" class="label">{{ item.label }}</span>
          <span v-if="item.date" class="date">{{ item.date }}</span>
        </div>
        <h1 v-if="item.title" ref="titleEl" class="title" :style="{ fontSize: titleSize }">{{ item.title }}</h1>

        <Transition name="swap" mode="out-in" @after-enter="measure && doMeasure()">
          <div v-if="scr" :key="scrKey" class="grp">
            <div v-if="scr.name || groupIds.length > 1" class="ghead">
              <span class="gname">
                {{ scr.name }}<small v-if="scr.part" :class="{ sep: scr.name }">продолжение</small>
              </span>
              <span v-if="groupIds.length > 1" class="dots">
                <i v-for="g in groupIds" :key="g" :class="{ on: g === scr.group }"></i>
              </span>
            </div>

            <div class="body" :class="{ 'with-podium': scr.podium }">
              <div v-if="scr.podium" class="podium" :class="{ big: bigPodium }">
                <div v-for="pi in [1, 0, 2]" :key="pi" class="place" :class="['p' + (pi + 1), { empty: !scr.podium[pi].length }]">
                  <div class="who" :style="{ fontSize: nameSize(pi) }">
                    <div v-for="(p, k) in scr.podium[pi]" :key="k" class="person">
                      <span class="pname">{{ p.name }}</span>
                      <span v-if="p.cls" class="pcls">{{ p.cls }}</span>
                    </div>
                  </div>
                  <div class="step" :style="{ height: stepHeight(pi) }">
                    <span>{{ pi + 1 }}</span>
                  </div>
                </div>
              </div>

              <div v-if="scr.list.length" class="listbox">
                <ol v-fit-list class="list" :style="{ '--cols': cols, '--rows': rows }">
                  <li v-for="(p, k) in scr.list" :key="k">
                    <span class="cls" :class="{ none: !p.cls }">{{ p.cls || '—' }}</span>
                    <span class="nm">{{ p.name }}</span>
                  </li>
                </ol>
              </div>
            </div>
          </div>
          <div v-else key="none" class="nobody">
            {{ preview && group >= 0 ? 'В этом классе пока никого нет' : 'Добавьте победителей или призёров' }}
          </div>
        </Transition>
      </div>
    </div>
    <InfoPanel v-if="panel" in-stage />
  </SlideStage>
</template>

<style scoped>
/* рамка, фото и анимации — как в NewsSlide.vue */
.news {
  position: absolute;
  inset: 30px;
  display: flex;
  gap: 30px;
}
.news.panel {
  right: 440px;
}
.photo {
  position: relative;
  flex: 0 0 900px;
  border-radius: 56px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}
.panel .photo {
  flex-basis: 640px;
}
.photo img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.photo.contain img {
  object-fit: contain;
}
.back {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
}
.back::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
}
.card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 50px 60px;
  border-radius: 64px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1));
  border: 1px solid var(--glass-border);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    0 20px 60px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}
.with-photo .card {
  padding: 46px 46px;
}
.meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 18px;
  font-weight: 800;
  font-size: 30px;
}
.label {
  padding: 8px 26px;
  border-radius: 999px;
  background: var(--text);
  color: var(--tab-text);
  text-shadow: none;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.date {
  color: var(--accent);
}
.title {
  margin: 0;
  flex: none;
  font-weight: 900;
  line-height: 1.08;
  text-transform: uppercase;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.run.anim-zoom .photo img {
  animation: news-zoom var(--anim-time) ease-in-out both;
}
.run.anim-drift .photo img {
  transform: scale(1.08);
  animation: news-drift var(--anim-time) ease-in-out both;
}
.run.anim-parallax .photo img {
  animation: news-par-photo var(--anim-time) ease-in-out both;
}
.run.anim-parallax .card {
  animation: news-par-card var(--anim-time) ease-in-out both;
}
.run.anim-rise .card {
  animation: news-rise var(--anim-time) ease-out both;
}
.loop.run .photo img,
.loop.run .card {
  animation-iteration-count: infinite;
  animation-direction: alternate;
}
.anim-parallax .photo img {
  transform: scale(1.06) translateX(10px);
}
.anim-rise .card {
  opacity: 0;
}
.anim-rise.run .card {
  opacity: 1;
}
@keyframes news-zoom {
  from { transform: scale(1); }
  to { transform: scale(1.08); }
}
@keyframes news-drift {
  from { transform: scale(1.08) translateX(-2%); }
  to { transform: scale(1.08) translateX(2%); }
}
@keyframes news-par-photo {
  from { transform: scale(1.06) translateX(10px); }
  to { transform: scale(1.06) translateX(-10px); }
}
@keyframes news-par-card {
  from { transform: translateX(-5px); }
  to { transform: translateX(5px); }
}
@keyframes news-rise {
  from { transform: translateY(30px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* ---------- группа: заголовок, пьедестал, список ---------- */
.grp {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.ghead {
  flex: none;
  display: flex;
  align-items: center;
  gap: 24px;
  min-height: 44px;
}
.gname {
  flex: 1;
  min-width: 0;
  font-size: 46px;
  font-weight: 900;
  line-height: 1.1;
  text-transform: uppercase;
  color: var(--accent);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.gname small {
  font-size: 0.6em;
  font-weight: 800;
  color: var(--text);
  text-transform: none;
}
.gname small.sep::before {
  content: '·';
  margin: 0 0.4em;
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
  gap: 30px;
}
.podium {
  flex: none;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 18px;
}
.place {
  flex: 1;
  min-width: 0;
  max-width: 420px;
  display: flex;
  flex-direction: column;
}
.who {
  display: flex;
  flex-direction: column;
  gap: 0.35em;
  padding: 0 4px 16px;
  text-align: center;
}
.person {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.pname {
  font-weight: 800;
  line-height: 1.1;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pcls {
  margin-top: 0.25em;
  padding: 0.08em 0.5em;
  border-radius: 0.45em;
  background: var(--text);
  color: var(--tab-text);
  text-shadow: none;
  font-size: 0.6em;
  font-weight: 900;
  line-height: 1.2;
}
.step {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10px;
  border-radius: 26px 26px 10px 10px;
  border: 1px solid rgba(255, 255, 255, 0.45);
  box-shadow:
    inset 0 2px 0 rgba(255, 255, 255, 0.6),
    0 14px 40px rgba(0, 0, 0, 0.25);
  color: rgba(40, 24, 0, 0.7);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4);
  font-weight: 900;
  font-size: 72px;
  line-height: 1;
}
.big .step {
  font-size: 100px;
  padding-top: 16px;
}
.p1 .step {
  background: linear-gradient(180deg, #ffe58a, #d9a514);
}
.p2 .step {
  background: linear-gradient(180deg, #f4f7fb, #a9b4c2);
}
.p3 .step {
  background: linear-gradient(180deg, #f3be8b, #b8692d);
}
/* место не присуждено: ступень остаётся, но тусклая */
.place.empty .step {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow: none;
  color: rgba(255, 255, 255, 0.35);
  text-shadow: none;
}
.listbox {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  overflow: hidden;
}
.with-podium .listbox {
  flex: 0 1 auto;
}
.list {
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  grid-template-rows: repeat(var(--rows), auto);
  grid-auto-flow: column;
  column-gap: 1.1em;
  row-gap: 0.32em;
  font-size: 40px;
  line-height: 1.2;
}
.list li {
  display: flex;
  align-items: center;
  gap: 0.45em;
  min-width: 0;
}
.cls {
  flex: none;
  min-width: 2.7em;
  padding: 0.12em 0.3em;
  border-radius: 0.45em;
  background: var(--text);
  color: var(--tab-text);
  text-shadow: none;
  text-align: center;
  font-size: 0.72em;
  font-weight: 900;
}
.cls.none {
  visibility: hidden;
}
.nm {
  flex: 1;
  min-width: 0;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
}
.nobody {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  font-weight: 800;
  opacity: 0.6;
  text-align: center;
}
/* смена группы: только opacity и transform */
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
