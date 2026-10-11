<script setup>
// Карточка колоды на сцене 1920×1080 — только отрисовка, без таймеров (их ведёт DeckSlide; в редакторе — превью).
//   fact   — заголовок (или название колоды) и текст;
//   choice — вопрос и варианты А/Б/В/Г; в фазе 'a' верный подсвечивается, остальные гаснут, ниже пояснение;
//   open   — вопрос; в фазе 'a' появляется «Ответ: …» и пояснение.
// У любой карточки может быть картинка из медиатеки — тогда она слева.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { mediaById, mediaUrl } from '../playlist.js'
import { LETTERS } from '../deckText.js'
import SlideStage from '../components/SlideStage.vue'
import InfoPanel from './InfoPanel.vue'

const props = defineProps({
  deck: Object,
  card: Object,
  phase: { type: String, default: 'q' }, // 'q' — вопрос, 'a' — ответ
  left: { type: Number, default: null }, // секунд до конца фазы (для таймера)
  progress: { type: Number, default: 0 }, // 0…1 — сколько фазы прошло
  layout: { type: String, default: 'full' }, // 'panel' — справа панель с часами, звонками, изменениями
  measure: Boolean, // только превью в редакторе: мерить, не вылезает ли содержимое, и сообщать в 'overflow'
})
const emit = defineEmits(['overflow'])
const panel = computed(() => props.layout === 'panel')

const photo = computed(() => {
  const m = props.card.media ? mediaById(props.card.media) : null
  return m?.type === 'image' ? m : null
})
const reveal = computed(() => props.phase === 'a')
const kindText = computed(() => {
  if (props.card.type === 'fact') return ''
  return reveal.value ? 'Ответ' : props.card.type === 'choice' ? 'Выберите ответ' : 'Подумайте!'
})
const options = computed(() => (props.card.options || []).map((o, i) => ({ o, i })).filter((x) => x.o))

const pick = (len, steps) => steps.find(([max]) => len <= max)?.[1] ?? steps[steps.length - 1][1]
const k = computed(() => (photo.value ? 0.82 : 1) * (panel.value ? 0.88 : 1))
const mainSize = computed(() => {
  const n = (props.card.text || '').length
  const steps =
    props.card.type === 'fact'
      ? [[60, 72], [120, 60], [200, 50], [300, 42], [999, 36]]
      : props.card.type === 'choice'
        ? [[50, 64], [100, 54], [180, 46], [999, 38]]
        : [[50, 80], [100, 66], [180, 54], [999, 44]]
  return Math.round(pick(n, steps) * k.value) + 'px'
})
const optSize = computed(() => {
  const n = Math.max(0, ...options.value.map((x) => x.o.length))
  return Math.round(pick(n, [[16, 44], [30, 36], [50, 30], [999, 26]]) * k.value) + 'px'
})

// предупреждение «не помещается»: содержимое выше блока .content (он обрезает лишнее)
const contentEl = ref(null)
let measureSeq = 0
async function doMeasure() {
  const seq = ++measureSeq
  await nextTick()
  await document.fonts?.ready
  const el = contentEl.value
  if (seq !== measureSeq || !el) return
  emit('overflow', { text: el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2 })
}
if (props.measure) {
  watch(() => [JSON.stringify(props.card), props.layout, props.deck.name], doMeasure, { flush: 'post' })
  onMounted(doMeasure)
}
</script>

<template>
  <SlideStage :theme="deck.theme">
    <div class="deck-card" :class="[card.type, { reveal, 'with-photo': photo, panel }]">
      <header class="head">
        <span class="deck-name">{{ deck.name }}</span>
        <span v-if="kindText" class="kind">{{ kindText }}</span>
        <span class="spacer"></span>
        <span v-if="left != null" class="timer">{{ Math.max(0, Math.ceil(left)) }}</span>
        <div class="bar"><span :style="{ transform: `scaleX(${1 - Math.min(1, Math.max(0, progress))})` }"></span></div>
      </header>

      <div class="body">
        <div v-if="photo" class="photo"><img :src="mediaUrl(photo)" alt="" /></div>

        <div ref="contentEl" class="content">
          <!-- факт -->
          <template v-if="card.type === 'fact'">
            <div v-if="card.title" class="fact-title">{{ card.title }}</div>
            <div class="main" :style="{ fontSize: mainSize }">{{ card.text }}</div>
          </template>

          <!-- вопрос с вариантами -->
          <template v-else-if="card.type === 'choice'">
            <div class="main question" :style="{ fontSize: mainSize }">{{ card.text }}</div>
            <div class="options" :style="{ fontSize: optSize }">
              <div v-for="x in options" :key="x.i" class="opt" :class="{ right: reveal && x.i === card.correct, wrong: reveal && x.i !== card.correct }">
                <span class="letter">{{ reveal && x.i === card.correct ? '✓' : LETTERS[x.i] }}</span>
                <span class="opt-text">{{ x.o }}</span>
              </div>
            </div>
            <div class="explain" :class="{ on: reveal && card.explain }">{{ card.explain }}</div>
          </template>

          <!-- открытый вопрос / загадка -->
          <template v-else>
            <div class="main question" :style="{ fontSize: mainSize }">{{ card.text }}</div>
            <div class="answer" :class="{ on: reveal }">
              <span class="answer-lbl">Ответ</span>
              <span class="answer-text">{{ card.answer }}</span>
              <span v-if="card.explain" class="answer-explain">{{ card.explain }}</span>
            </div>
          </template>
        </div>
      </div>
    </div>
    <InfoPanel v-if="panel" in-stage />
  </SlideStage>
</template>

<style scoped>
.deck-card {
  position: absolute;
  inset: 30px;
  display: flex;
  flex-direction: column;
  gap: 26px;
}

/* место справа — под панель 440 px */
.deck-card.panel {
  right: 440px;
}
.panel .photo {
  flex-basis: 520px;
}
.panel .deck-name {
  font-size: 46px;
}
.head,
.content {
  border-radius: 56px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1));
  border: 1px solid var(--glass-border);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    0 20px 60px rgba(0, 0, 0, 0.2);
}

/* ---------- шапка ---------- */
.head {
  position: relative;
  flex: 0 0 130px;
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 0 48px;
  overflow: hidden;
}
.deck-name {
  font-weight: 900;
  font-size: 56px;
  text-transform: uppercase;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kind {
  padding: 8px 24px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  font-weight: 800;
  font-size: 28px;
  white-space: nowrap;
}
.reveal .kind {
  background: var(--text);
  color: var(--tab-text);
  text-shadow: none;
}
.spacer {
  flex: 1;
}
.timer {
  min-width: 96px;
  text-align: right;
  font-weight: 900;
  font-size: 72px;
  line-height: 1;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.bar {
  position: absolute;
  left: 48px;
  right: 48px;
  bottom: 14px;
  height: 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.18);
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--accent);
  transform-origin: left center;
  transition: transform 0.25s linear;
}

/* ---------- содержимое ---------- */
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 26px;
}
.photo {
  flex: 0 0 720px;
  border-radius: 56px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}
.photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 40px;
  padding: 56px 72px;
  overflow: hidden;
}
.main {
  font-weight: 800;
  line-height: 1.25;
  overflow-wrap: anywhere;
  white-space: pre-line;
}
.question {
  font-weight: 900;
  line-height: 1.15;
}
.fact-title {
  align-self: flex-start;
  padding: 10px 32px;
  border-radius: 999px;
  background: var(--text);
  color: var(--tab-text);
  text-shadow: none;
  font-weight: 900;
  font-size: 44px;
  text-transform: uppercase;
}
.open .question {
  text-align: center;
}

/* варианты */
.options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22px;
}
.opt {
  display: flex;
  align-items: center;
  gap: 22px;
  min-height: 112px;
  padding: 16px 30px 16px 18px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
  font-weight: 800;
  transition:
    opacity 0.5s,
    background 0.5s,
    transform 0.5s;
}
.letter {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 78px;
  height: 78px;
  border-radius: 50%;
  background: var(--text);
  color: var(--tab-text);
  text-shadow: none;
  font-weight: 900;
  font-size: 40px;
}
.opt-text {
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.15;
}
.opt.right {
  background: #2fae5b;
  box-shadow:
    0 0 0 4px #b8ffcb,
    0 0 40px rgba(120, 255, 160, 0.5);
  transform: scale(1.03);
}
.opt.right .letter {
  color: #1d7a3d;
}
.opt.wrong {
  opacity: 0.3;
}
.explain {
  min-height: 1.3em;
  font-weight: 700;
  font-size: 34px;
  line-height: 1.3;
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 0.5s 0.3s,
    transform 0.5s 0.3s;
}
.explain.on {
  opacity: 1;
  transform: none;
}

/* ответ на открытый вопрос */
.answer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 34px 40px;
  border-radius: 48px;
  background: rgba(255, 255, 255, 0.16);
  text-align: center;
  opacity: 0;
  transform: scale(0.9);
  transition:
    opacity 0.5s,
    transform 0.5s;
}
.answer.on {
  opacity: 1;
  transform: none;
  background: rgba(255, 255, 255, 0.24);
  box-shadow: inset 0 0 0 3px var(--accent);
}
.answer-lbl {
  font-weight: 800;
  font-size: 28px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.85;
}
.answer-text {
  font-weight: 900;
  font-size: 84px;
  line-height: 1.05;
  text-transform: uppercase;
  color: var(--accent);
  overflow-wrap: anywhere;
}
.answer-explain {
  font-weight: 700;
  font-size: 34px;
  line-height: 1.3;
}
</style>
