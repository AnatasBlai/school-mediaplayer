<script setup>
// Слайд «колода»: одна карточка за показ. Карточку выбирает сразу при появлении (пока слайд ещё «следующий»):
//   mode 'next'  — общий счётчик показов на сервере (POST /api/decks/<id>/take), все экраны идут по кругу дальше;
//   mode 'daily' — номер дня: весь день одна и та же карточка.
// Факт идёт deck.factTime секунд; вопрос — qTime, затем ответ — aTime. Потом 'done'.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { deckById, dayNumber, takeCard } from '../decks.js'
import DeckCard from './DeckCard.vue'

const props = defineProps({
  item: Object, // слайд плейлиста type: 'deck'
  active: Boolean,
})
const emit = defineEmits(['done'])

const deck = computed(() => deckById(props.item.deck))
const n = ref(null) // номер показа
const card = computed(() => {
  const cards = deck.value?.cards || []
  return n.value == null || !cards.length ? null : cards[n.value % cards.length]
})

const phase = ref('q')
const elapsed = ref(0) // мс с начала фазы
const phaseLen = computed(() => {
  const d = deck.value
  if (!d || !card.value) return 1
  return (card.value.type === 'fact' ? d.factTime : phase.value === 'q' ? d.qTime : d.aTime) * 1000
})

let timer = null
let last = 0
let running = false
function tick() {
  const t = performance.now()
  elapsed.value += t - last
  last = t
  if (elapsed.value < phaseLen.value) return
  if (card.value && card.value.type !== 'fact' && phase.value === 'q') {
    phase.value = 'a'
    elapsed.value = 0
    return
  }
  stop()
  emit('done')
}
function start() {
  if (running || !props.active) return
  // карточка ещё не пришла с сервера — подождём; колоды нет или она пуста — дальше
  if (!card.value) {
    if (n.value != null) setTimeout(() => props.active && emit('done'), 1000)
    return
  }
  running = true
  phase.value = 'q'
  elapsed.value = 0
  last = performance.now()
  timer = setInterval(tick, 250)
}
function stop() {
  running = false
  clearInterval(timer)
}

watch(
  () => props.active,
  (a) => (a ? start() : stop()),
)
watch(n, () => start())

onMounted(async () => {
  n.value = props.item.mode === 'daily' ? dayNumber() : await takeCard(props.item.deck)
})
onBeforeUnmount(stop)
</script>

<template>
  <DeckCard
    v-if="deck && card"
    :deck="deck"
    :card="card"
    :phase="phase"
    :left="(phaseLen - elapsed) / 1000"
    :progress="elapsed / phaseLen"
  />
</template>
