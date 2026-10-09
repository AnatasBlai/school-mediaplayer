<script setup>
// «Сейчас на экране»: карточка на каждый экран, который сообщал о себе серверу.
import { computed } from 'vue'
import { playlist, mediaById, slideTitle, thumbUrl } from '../playlist.js'
import { screens, startScreens, serverNow, isOnline } from './screens.js'

startScreens()

const HIDE_OFFLINE = 12 * 3600 * 1000 // экран без связи дольше 12 ч не показываем

const label = (s) => s.name || 'Экран ' + s.ip
const lastSeen = (s) => Math.max(s.seen, s.goneAt || 0)

const list = computed(() => {
  void screens.now // пересчёт раз в секунду
  const all = screens.items.map((s) => ({ ...s, online: isOnline(s) }))
  // тот же компьютер с другим id (очистили данные браузера, открыли другой браузер) — старую запись прячем
  const live = new Set(all.filter((s) => s.online).map((s) => label(s) + '|' + s.ip))
  return all
    .filter((s) => s.online || (!live.has(label(s) + '|' + s.ip) && serverNow() - lastSeen(s) < HIDE_OFFLINE))
    .sort((a, b) => b.online - a.online || lastSeen(b) - lastSeen(a))
})

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
  const tab = board && sl.tab ? (sl.tab === 'changes' ? 'вкладка «Изменения»' : `сейчас ${sl.tab}-е классы`) : ''
  return {
    title,
    tab,
    thumb: file ? thumbUrl(file) : '',
    label: board ? (sl.tab === 'changes' ? 'Изм.' : sl.tab || '5–11') : sl.type === 'deck' ? '?!' : sl.type === 'blank' ? '☾' : sl.type === 'news' && !file ? 'Нов.' : '',
    cls: sl.type,
    num: item ? playlist.items.indexOf(item) + 1 : 0,
  }
}
</script>

<template>
  <div class="now">
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
            <template v-if="view(s).tab">{{ view(s).tab }} · </template>идёт {{ fmtAgo(serverNow() - s.since) }}
          </div>
        </template>
        <div v-else class="sub bad">Нет связи {{ fmtAgo(serverNow() - lastSeen(s)) }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.now {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.none {
  padding: 10px 14px;
  border-radius: 10px;
  background: #26292f;
  color: #a4a9b3;
  font-weight: 600;
}
.scr {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 360px;
  max-width: 520px;
  padding: 8px 14px 8px 8px;
  border-radius: 12px;
  background: #26292f;
  border: 1px solid #2f5d3a;
}
.scr.offline {
  border-color: #5a2f2a;
  opacity: 0.75;
}
.thumb {
  flex: 0 0 auto;
  width: 112px;
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
.sub.bad {
  color: #ff8a7a;
}
</style>
