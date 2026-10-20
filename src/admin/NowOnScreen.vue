<script setup>
// «Сейчас на экране»: карточка на каждый экран, который сообщал о себе серверу.
import { computed } from 'vue'
import { playlist, mediaById, slideTitle, thumbUrl } from '../playlist.js'
import { screens, startScreens, serverNow, isOnline, visibleScreens, screenLabel as label, removeScreen } from './screens.js'

startScreens()

const lastSeen = (s) => Math.max(s.seen, s.goneAt || 0)

const list = computed(() => {
  void screens.now // пересчёт раз в секунду
  return visibleScreens.value.map((s) => ({ ...s, online: isOnline(s) })).sort((a, b) => b.online - a.online || lastSeen(b) - lastSeen(a))
})

function remove(s) {
  if (confirm(`Экран «${label(s)}» больше не используется?`)) removeScreen(s.id)
}

function fmtAgo(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return s + ' с'
  if (s < 3600) return Math.floor(s / 60) + ' мин ' + (s % 60) + ' с'
  return Math.floor(s / 3600) + ' ч ' + Math.floor((s % 3600) / 60) + ' мин'
}

function view(s) {
  const sl = s.slide
  const item = playlist.items.find((x) => x.id === sl.id)
  const board = sl.type === 'schedule' || sl.type === 'changes'
  const file = item?.media ? mediaById(item.media) : null
  let title
  if (sl.type === 'blank') title = 'Экран погашен по расписанию'
  else if (sl.fallback) title = 'Расписание — в плейлисте сейчас нечего показать'
  else if (item) title = slideTitle(item)
  else title = 'Слайд уже убран из плейлиста'
  const urgent = !!sl.urgent
  const tab = board && sl.tab ? (sl.tab === 'changes' ? 'вкладка «Изменения»' : `сейчас ${sl.tab}-е классы`) : ''
  return {
    title,
    tab,
    urgent,
    thumb: file ? thumbUrl(file) : '',
    label: board ? (sl.tab === 'changes' ? 'Изм.' : sl.tab || '5–11') : sl.type === 'deck' ? '?!' : sl.type === 'blank' ? '☾' : sl.type === 'news' && !file ? 'Нов.' : sl.type === 'winners' && !file ? '🏆' : sl.type === 'countdown' ? '⏳' : '',
    cls: sl.type,
    num: item ? playlist.items.indexOf(item) + 1 : 0,
  }
}
</script>

<template>
  <div id="now-on-screen" class="now">
    <div v-if="screens.loaded && !list.length" class="none">
      Экраны пока не на связи. Откройте экран (кнопка «Открыть экран ↗») — он появится здесь.
    </div>
    <div v-for="s in list" :key="s.id" class="scr" :class="{ offline: !s.online }">
      <div class="thumb" :class="view(s).cls">
        <img v-if="view(s).thumb" :src="view(s).thumb" alt="" />
        <span v-else>{{ view(s).label }}</span>
      </div>
      <div class="info">
        <div class="name">
          <span class="dot"></span>
          {{ label(s) }}
          <span class="meta">{{ s.w }}×{{ s.h }}</span>
        </div>
        <template v-if="s.online">
          <div class="title">
            <span v-if="view(s).num" class="num">№{{ view(s).num }}</span>
            {{ view(s).title }}
          </div>
          <div class="sub">
            <template v-if="view(s).urgent"><b class="urg">Срочный режим</b> · </template>
            <template v-if="view(s).tab">{{ view(s).tab }} · </template>идёт {{ fmtAgo(serverNow() - s.since) }}
          </div>
        </template>
        <div v-else class="sub bad">Нет связи {{ fmtAgo(serverNow() - lastSeen(s)) }}</div>
        <button v-if="!s.online" class="rm" @click="remove(s)">Убрать из списка</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.now {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.none {
  padding: 10px 12px;
  border-radius: 10px;
  background: #1d1f24;
  color: #a4a9b3;
  font-weight: 600;
}
.scr {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px 8px 8px;
  border-radius: 10px;
  background: #1d1f24;
  border: 1px solid #2f5d3a;
}
.scr.offline {
  border-color: #5a2f2a;
  opacity: 0.75;
}
.rm {
  align-self: flex-start;
  margin-top: 4px;
  border: none;
  border-radius: 8px;
  padding: 6px 10px;
  background: #3b404a;
  color: #fff;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.rm:hover {
  background: #4a505c;
}
.thumb {
  flex: 0 0 auto;
  width: 96px;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: #000;
  color: #fff;
  font-weight: 900;
  font-size: 18px;
}
.thumb.schedule {
  background: linear-gradient(135deg, #f0a32a, #c45a10);
}
.thumb.changes {
  background: linear-gradient(135deg, #6b4a2b, #3f7a3a);
}
.thumb.news {
  background: linear-gradient(135deg, #2c74c0, #0c2c68);
}
.thumb.winners {
  background: linear-gradient(135deg, #e0b030, #7a4a0c);
}
.thumb.countdown {
  background: linear-gradient(135deg, #e0752a, #7a1f0c);
}
.thumb.deck {
  background: linear-gradient(135deg, #7a2fd0, #12052e);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.name {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #c9ccd3;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3fae5a;
  box-shadow: 0 0 0 3px rgba(63, 174, 90, 0.25);
}
.offline .dot {
  background: #ff8a7a;
  box-shadow: none;
}
.meta {
  color: #7c818b;
  font-weight: 600;
  text-transform: none;
}
.title {
  font-weight: 800;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.num {
  color: #7fb0ff;
}
.sub {
  color: #8b909a;
  font-size: 12px;
  font-weight: 600;
}
.urg {
  color: #ff8a7a;
}
.sub.bad {
  color: #ff8a7a;
}
</style>
