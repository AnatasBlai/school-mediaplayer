<script setup>
// Движок показа: идёт по плейлисту по кругу. Одновременно на странице не больше трёх слайдов:
//   active  — показывается сейчас;
//   leaving — предыдущий, лежит под active, пока тот проявляется (~1 с);
//   next    — следующий, невидимый: фото/видео заранее грузятся, табло уже отрисовано.
// Слайды расписания и изменений используют ОДНО табло (ключ 'board'): между ними нет затемнения,
// табло само плавно меняет вкладку и тему.
// Правила показа (даты, время, дни) проверяются по часам этого компьютера.
// Фото, видео, новости, отсчёты и колоды идут по шаблону (layoutOf): на весь экран или с панелью справа —
// панель рисует сам слайд (MediaSlide поверх превью, NewsSlide/DeckCard — внутри своей сцены).
// О текущем слайде экран сообщает серверу (POST /api/screens) — редактор показывает «сейчас на экране».
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { state, GRADES, hasChanges } from '../store.js'
import { playlist, playlistLoaded, mediaLoaded, mediaById, startPlaylist, layoutOf } from '../playlist.js'
import ScheduleBoard from '../components/ScheduleBoard.vue'
import MediaSlide from './MediaSlide.vue'
import NewsSlide from './NewsSlide.vue'
import CountdownSlide from './CountdownSlide.vue'
import DeckSlide from './DeckSlide.vue'
import { ruleState, isBlanked, countdownState } from '../rules.js'
import Ticker from './Ticker.vue'
import { decksLoaded, deckById, startDecks } from '../decks.js'

startPlaylist()
startDecks()

const isBoard = (it) => it.type === 'schedule' || it.type === 'changes'
const isMedia = (it) => it.type === 'image' || it.type === 'video'

function boardTabs(it) {
  if (it.type === 'changes') return ['changes']
  const gs = it.grades?.length ? it.grades : GRADES
  return gs.filter((g) => (state.settings.letters[g] || []).length)
}

// время для правил показа; обновляем раз в 10 с — этого хватает, слайды всё равно длиннее
const now = ref(new Date())

function playable(it) {
  if (!it.on || !ruleState(it.when, now.value).ok) return false
  if (it.type === 'schedule') return boardTabs(it).length > 0
  if (it.type === 'changes') return !it.skipEmpty || hasChanges(now.value)
  if (it.type === 'news') return !!(it.title || it.text)
  if (it.type === 'countdown') return !!it.date && !countdownState(it, now.value).over
  if (it.type === 'deck') return decksLoaded.value && (deckById(it.deck)?.cards.length || 0) > 0
  return mediaById(it.media)?.type === it.type
}

// плейлист пуст или всё выключено — экран не должен быть чёрным, показываем расписание
const FALLBACK = { id: 'fallback', type: 'schedule', on: true, duration: 15, grades: [] }

// срочный режим: показывается только этот слайд, без проверки on/«Когда» и гашения
const urgentItem = computed(() => (playlist.urgent.on ? playlist.items.find((x) => x.id === playlist.urgent.id) : null))

/** Следующий слайд после слайда с данным id, по кругу. Если id нет в плейлисте — с начала. */
function following(id) {
  if (urgentItem.value) return urgentItem.value
  const items = playlist.items
  const n = items.length
  const start = items.findIndex((x) => x.id === id)
  for (let k = 1; k <= n; k++) {
    const it = items[(start + k + n) % n]
    if (playable(it)) return it
  }
  return FALLBACK
}

// seq — порядковый номер показа; у фото/видео он входит в ключ, чтобы один и тот же файл
// подряд (плейлист из одного видео) получал новый элемент и заранее грузился заново
const keyOf = (item, seq) => (isBoard(item) ? 'board' : item.id + '#' + seq)
const slot = (item, seq) => ({ item, seq, key: keyOf(item, seq) })

const cur = ref(null)
const leaving = ref(null)
const next = computed(() => cur.value && slot(following(cur.value.item.id), cur.value.seq + 1))

const slots = computed(() => {
  const list = []
  const seen = new Set()
  for (const [s, role] of [
    [cur.value, 'active'],
    [leaving.value, 'leaving'],
    [next.value, 'next'],
  ]) {
    if (s && !seen.has(s.key)) {
      seen.add(s.key)
      list.push({ ...s, role })
    }
  }
  // постоянный порядок в DOM, чтобы Vue не переставлял элементы (видео при этом может остановиться)
  return list.sort((a, b) => a.seq - b.seq)
})

// гашение экрана по расписанию: слайды убираются совсем (видео не играет), остаётся чёрный экран
const blanked = computed(() => !urgentItem.value && isBlanked(playlist.blank, now.value))
// смена срочного режима применяется сразу, а не после конца текущего слайда
watch([blanked, () => urgentItem.value?.id], ([b]) => {
  if (b) {
    cur.value = leaving.value = null
  } else if (ready.value) advance()
})

let leaveTimer = null
function advance() {
  if (blanked.value) return
  const old = cur.value
  const n = old ? next.value : slot(following(null), 1)
  cur.value = n
  if (old && old.key !== n.key) {
    leaving.value = old
    clearTimeout(leaveTimer)
    leaveTimer = setTimeout(() => (leaving.value = null), 1000)
  }
}

function onDone(s) {
  if (cur.value && s.key === cur.value.key && s.seq === cur.value.seq) advance()
}

// файл показываемого слайда удалили из медиатеки — сразу дальше
watch(
  () => cur.value && isMedia(cur.value.item) && mediaLoaded.value && !mediaById(cur.value.item.media),
  (gone) => gone && advance(),
)

// старт: ждём плейлист, медиатеку и колоды (иначе слайды в начале плейлиста пропустятся), но не дольше 5 с
const ready = computed(() => playlistLoaded.value && mediaLoaded.value && decksLoaded.value)
const startTimer = setTimeout(() => !cur.value && advance(), 5000)
watch(ready, (r) => r && !cur.value && advance(), { immediate: true })

// ---------- отчёт серверу: что сейчас на экране ----------
// id экрана живёт в localStorage этого браузера; имя можно задать в адресе: /?name=Холл
const screenId = (() => {
  const make = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  try {
    let id = localStorage.getItem('screen-id')
    if (!id) localStorage.setItem('screen-id', (id = make()))
    return id
  } catch {
    return make()
  }
})()
const screenName = new URLSearchParams(location.search).get('name') || ''
const boardTab = ref('') // какую вкладку сейчас показывает табло

function report() {
  const c = cur.value
  if (blanked.value) return send({ id: 'blank', type: 'blank', seq: 0, tab: '', fallback: false })
  if (!c) return
  send({ id: c.item.id, type: c.item.type, seq: c.seq, tab: isBoard(c.item) ? boardTab.value : '', fallback: c.item.id === FALLBACK.id, urgent: !!urgentItem.value })
}
function send(slide) {
  fetch('/api/screens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: screenId,
      name: screenName,
      slide,
      w: innerWidth,
      h: innerHeight,
    }),
  }).catch(() => {})
}
watch([cur, boardTab, blanked], report)

// страницу закрыли или перезагрузили — сразу сообщаем, чтобы редактор не считал экран живым ещё минуту
const bye = () => navigator.sendBeacon?.('/api/screens', JSON.stringify({ id: screenId, gone: true }))

let clockTimer, reportTimer
onMounted(() => {
  clockTimer = setInterval(() => (now.value = new Date()), 10_000)
  reportTimer = setInterval(report, 30_000)
  window.addEventListener('pagehide', bye)
})
onBeforeUnmount(() => {
  window.removeEventListener('pagehide', bye)
  clearTimeout(startTimer)
  clearTimeout(leaveTimer)
  clearInterval(clockTimer)
  clearInterval(reportTimer)
})
</script>

<template>
  <div class="player">
    <div v-if="blanked" class="blank"></div>
    <Ticker v-else :now="now" />
    <div v-for="s in slots" :key="s.key" class="slide" :class="s.role">
      <ScheduleBoard
        v-if="isBoard(s.item)"
        :tabs="boardTabs(s.item)"
        :seconds="s.item.duration"
        :run="s.seq"
        :playing="s.role === 'active'"
        @done="onDone(s)"
        @tab="(t) => (boardTab = t)"
      />
      <NewsSlide
        v-else-if="s.item.type === 'news'"
        :item="s.item"
        :active="s.role === 'active'"
        :layout="layoutOf(s.item)"
        @done="onDone(s)"
      />
      <CountdownSlide
        v-else-if="s.item.type === 'countdown'"
        :item="s.item"
        :active="s.role === 'active'"
        :layout="layoutOf(s.item)"
        @done="onDone(s)"
      />
      <DeckSlide
        v-else-if="s.item.type === 'deck'"
        :item="s.item"
        :active="s.role === 'active'"
        :layout="layoutOf(s.item)"
        @done="onDone(s)"
      />
      <MediaSlide
        v-else-if="mediaById(s.item.media)"
        :item="s.item"
        :file="mediaById(s.item.media)"
        :active="s.role === 'active'"
        :layout="layoutOf(s.item)"
        @done="onDone(s)"
      />
    </div>
  </div>
</template>

<style scoped>
.player {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #000;
  cursor: none;
}
.blank {
  position: absolute;
  inset: 0;
  z-index: 5;
  background: #000;
}
.slide {
  position: absolute;
  inset: 0;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.8s ease;
}
.slide.active {
  z-index: 2;
  opacity: 1;
  visibility: visible;
}
.slide.leaving {
  z-index: 1;
  opacity: 1;
  visibility: visible;
}
</style>
