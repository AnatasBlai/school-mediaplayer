<script setup>
// Редактор (/admin): открывается в отдельной вкладке. Правки сразу уходят на сервер и видны на экранах.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { saveStatus, connected } from '../store.js'
import { syncNotice } from '../saver.js'
import ScheduleBoard from '../components/ScheduleBoard.vue'
import MediaLibrary from './MediaLibrary.vue'
import PlaylistEditor from './PlaylistEditor.vue'
import DeckEditor from './DeckEditor.vue'
import ScheduleImport from './ScheduleImport.vue'
import { playlist, startPlaylist } from '../playlist.js'
import { startDecks } from '../decks.js'
import SystemStatus from './SystemStatus.vue'
import { level as sysLevel, startStatus } from './systemStatus.js'
import { silentList, screenLabel } from './screens.js'
import { plural } from '../bells.js'
import AuthModals from './AuthModals.vue'
import UsersModal from './UsersModal.vue'
import { auth, can, checkAuth, logout } from './auth.js' // подключение auth.js ставит обработку 401 на все запросы
import './ui.css'

checkAuth()
// плейлист нужен и разделу «Плейлист», и медиатеке (предупреждение при удалении файла)
startPlaylist()
startDecks()
startStatus()

// разделы редактора; текущий хранится в адресе (/admin#media), чтобы переживать обновление страницы
const SECTIONS = [
  { id: 'schedule', title: 'Расписание' },
  { id: 'playlist', title: 'Плейлист' },
  { id: 'decks', title: 'Колоды' },
  { id: 'media', title: 'Медиатека' },
]
const fromHash = () => (SECTIONS.some((s) => s.id === location.hash.slice(1)) ? location.hash.slice(1) : 'schedule')
const section = ref(fromHash())
const importOpen = ref(false) // окно «Вставить из Excel»
const statusOpen = ref(false) // окно «Состояние системы»
// раздел без права виден только для чтения: сверху плашка, а любые действия в разделе гасятся (сервер всё равно ответит 403)
const readonly = computed(() => !can(section.value))
const BLOCKED = ['click', 'dblclick', 'mousedown', 'keydown', 'keypress', 'beforeinput', 'input', 'change', 'paste', 'cut', 'drop', 'dragstart', 'contextmenu']
function guard(e) {
  if (!readonly.value || (e.type === 'keydown' && e.key === 'Tab')) return
  e.stopPropagation()
  e.preventDefault()
}
const SYS_TITLE = { ok: 'Всё хорошо', warn: 'Есть предупреждения', bad: 'Есть ошибки' }
function go(id) {
  section.value = id
  history.replaceState(null, '', id === 'schedule' ? location.pathname : '#' + id)
}
const onHash = () => (section.value = fromHash())

// файл, брошенный мимо медиатеки, браузер открыл бы вместо редактора — запрещаем
const stopDrop = (e) => e.preventDefault()
const workEl = ref(null)
onMounted(() => {
  BLOCKED.forEach((t) => workEl.value?.addEventListener(t, guard, true))
  window.addEventListener('hashchange', onHash)
  window.addEventListener('dragover', stopDrop)
  window.addEventListener('drop', stopDrop)
})
onBeforeUnmount(() => {
  BLOCKED.forEach((t) => workEl.value?.removeEventListener(t, guard, true))
  window.removeEventListener('hashchange', onHash)
  window.removeEventListener('dragover', stopDrop)
  window.removeEventListener('drop', stopDrop)
})

// плашка «экран не отвечает»: один экран — со временем, несколько — списком
const silentText = computed(() => {
  const l = silentList.value
  if (!l.length) return ''
  if (l.length === 1) return `Экран «${screenLabel(l[0])}» не отвечает ${Math.max(5, Math.round(l[0].silentMs / 60000))} мин`
  return `Не отвечают ${l.length} ${plural(l.length, 'экран', 'экрана', 'экранов')}: ${l.map(screenLabel).join(', ')}`
})
function goScreens() {
  go('playlist')
  setTimeout(() => document.getElementById('now-on-screen')?.scrollIntoView({ block: 'center' }), 50)
}

const status = computed(() => {
  if (!connected.value || saveStatus.value === 'offline')
    return { cls: 'bad', text: 'Нет связи с сервером — правки сохранятся только в этом браузере' }
  if (saveStatus.value === 'saving') return { cls: '', text: 'Сохранение…' }
  if (saveStatus.value === 'saved') return { cls: 'ok', text: 'Сохранено, экраны обновлены' }
  return { cls: '', text: '' }
})
</script>

<template>
  <div class="admin">
    <header class="bar">
      <div class="brand">Управление экранами</div>
      <nav class="nav">
        <button v-for="s in SECTIONS" :key="s.id" class="nav-btn" :class="{ on: section === s.id }" @click="go(s.id)">
          {{ s.title }}
        </button>
      </nav>
      <div class="hint">
        <template v-if="section === 'schedule'">Клик — выделить ячейку, второй клик или ввод — редактировать, Enter — сохранить</template>
      </div>
      <button v-if="section === 'schedule' && can('schedule')" class="open xl" @click="importOpen = true">Вставить из Excel</button>
      <div v-if="playlist.urgent.on" class="urgent" title="Откройте раздел «Плейлист», чтобы отключить">⚠ Срочный режим включён</div>
      <button v-if="silentText" class="silent" :title="silentText + ' — показать «Сейчас на экране»'" @click="goScreens">⚠ {{ silentText }}</button>
      <div class="status" :class="status.cls">{{ status.text }}</div>
      <a class="open" href="/" target="_blank">Открыть экран ↗</a>
      <button class="open xl" @click="statusOpen = true">
        <span v-if="sysLevel" class="sdot" :class="sysLevel" :title="SYS_TITLE[sysLevel]"></span>Состояние
      </button>
      <button v-if="!auth.required" class="open xl" @click="auth.setupOpen = true">🔒 Создать администратора</button>
      <template v-else-if="auth.user">
        <span class="who" :title="auth.user.login">{{ auth.user.name }}</span>
        <button v-if="can('admin')" class="open xl" @click="auth.usersOpen = true">Пользователи</button>
        <button class="open xl" @click="auth.passOpen = true">Мой пароль</button>
        <button class="open xl" @click="logout">Выйти</button>
      </template>
    </header>
    <div v-if="syncNotice" class="sync-note" :class="{ err: syncNotice.error }" role="status">{{ syncNotice.text }}</div>
    <div v-if="readonly" class="ro-note" role="status">Вы можете только смотреть этот раздел</div>
    <div v-if="auth.denied" class="sync-note err" role="alert">{{ auth.denied }}</div>
    <main ref="workEl" class="work" :class="{ ro: readonly }">
      <div v-if="section === 'schedule'" class="board">
        <ScheduleBoard editable />
      </div>
      <PlaylistEditor v-else-if="section === 'playlist'" />
      <DeckEditor v-else-if="section === 'decks'" />
      <MediaLibrary v-else-if="section === 'media'" />
    </main>
    <ScheduleImport v-if="importOpen" @close="importOpen = false" />
    <SystemStatus v-if="statusOpen" @close="statusOpen = false" />
    <UsersModal v-if="auth.usersOpen" @close="auth.usersOpen = false" />
    <AuthModals />
  </div>
</template>

<style scoped>
.admin {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #1d1f24;
  color: #f2f2f2;
}
.bar {
  flex: 0 0 56px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  background: #26292f;
  border-bottom: 1px solid #353943;
  font-size: 14px;
}
.brand {
  font-weight: 800;
  font-size: 16px;
  white-space: nowrap;
}
.nav {
  display: flex;
  gap: 6px;
}
.nav-btn {
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  background: transparent;
  color: #c9ccd3;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.nav-btn:hover {
  background: #31353d;
}
.nav-btn.on {
  background: #3b404a;
  color: #fff;
}
.hint {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #8b909a;
  font-weight: 600;
}
.status {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 700;
  color: #c9ccd3;
}
.sync-note {
  position: fixed;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  max-width: min(900px, 94vw);
  padding: 10px 18px;
  border-radius: 10px;
  background: #3d7be0;
  color: #fff;
  font-weight: 700;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
}
.sync-note.err {
  background: #b3261e;
}
.urgent {
  white-space: nowrap;
  padding: 5px 12px;
  border-radius: 8px;
  background: #b3261e;
  color: #fff;
  font-weight: 800;
}
.silent {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: none;
  padding: 5px 12px;
  border-radius: 8px;
  background: #e8b630;
  color: #1d1f24;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
.status.ok {
  color: #7fd18b;
}
.status.bad {
  color: #ff8a7a;
}
.open {
  flex: none;
  white-space: nowrap;
  padding: 8px 14px;
  border-radius: 8px;
  background: #3b404a;
  color: #fff;
  font-weight: 700;
  text-decoration: none;
}
.open.xl {
  border: none;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.sdot {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 8px;
  border-radius: 50%;
  background: #4cc26a;
}
.sdot.warn {
  background: #e8b630;
}
.sdot.bad {
  background: #e5503f;
}
.open:hover {
  background: #4a505c;
}
.who {
  flex: none;
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 700;
  color: #c9ccd3;
}
.ro-note {
  flex: none;
  padding: 7px 16px;
  background: #4a505c;
  color: #e6e8ec;
  font-weight: 700;
  text-align: center;
}
.work.ro {
  cursor: default;
}
.work {
  flex: 1;
  min-height: 0;
  padding: 16px;
}
.board {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
}
@media (max-width: 1400px) {
  .bar {
    gap: 6px;
    padding: 0 8px;
  }
  .open,
  .nav-btn {
    padding: 8px 10px;
  }
}
</style>
