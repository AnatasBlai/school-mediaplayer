<script setup>
// Меню ⚙ в шапке редактора: вид разделов, журнал, состояние, пользователи, мой пароль, выход.
// Окна открывает AdminApp (события journal/status) и auth.js (флаги usersOpen/passOpen/setupOpen).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { auth, can, logout } from './auth.js'
import { icon } from './icons.js'
import { state } from '../store.js'
import { transfer } from './transferApi.js'

const props = defineProps({ navView: String, sysLevel: String })
const emit = defineEmits(['update:navView', 'journal', 'status'])

const VIEWS = [
  { id: 'text', title: 'Надписи' },
  { id: 'icons', title: 'Иконки' },
  { id: 'both', title: 'Иконки + надписи' },
]
const SYS_TITLE = { ok: 'Всё хорошо', warn: 'Есть предупреждения', bad: 'Есть ошибки' }

const open = ref(false)
// погода на табло: тот же переключатель, что в настройках у календаря (settings.weather.on); меню не закрываем
const weatherOn = computed(() => !!state.settings.weather?.on)
const toggleWeather = () => (state.settings.weather = { ...state.settings.weather, on: !weatherOn.value })
const root = ref(null)
// пункт выбран → меню закрывается, затем действие
function pick(fn) {
  open.value = false
  fn()
}
const onDoc = (e) => {
  if (open.value && !root.value?.contains(e.target)) open.value = false
}
const onKey = (e) => {
  if (open.value && e.key === 'Escape') open.value = false
}
onMounted(() => {
  document.addEventListener('mousedown', onDoc)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDoc)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="hm">
    <button
      class="gear"
      :class="{ on: open }"
      :title="'Настройки' + (sysLevel && sysLevel !== 'ok' ? ' — ' + SYS_TITLE[sysLevel].toLowerCase() : '')"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="ico" v-html="icon('gear')"></span>
      <span v-if="sysLevel" class="sdot" :class="sysLevel"></span>
    </button>
    <div v-if="open" class="menu" role="menu">
      <div class="group">Вид разделов</div>
      <div class="views">
        <button
          v-for="v in VIEWS"
          :key="v.id"
          class="view"
          :class="{ on: props.navView === v.id }"
          role="menuitemradio"
          :aria-checked="props.navView === v.id"
          @click="emit('update:navView', v.id)"
        >
          {{ v.title }}
        </button>
      </div>
      <div class="sep"></div>
      <button class="item" role="menuitemswitch" :aria-checked="weatherOn" :disabled="!can('schedule')" title="Показывать погоду на табло (нужен интернет на ПК с сервером)" @click="toggleWeather">
        <span class="ico emo">🌤</span>Погода на табло
        <span class="sw" :class="{ on: weatherOn }">{{ weatherOn ? 'Вкл' : 'Выкл' }}</span>
      </button>
      <div class="sep"></div>
      <template v-if="!auth.required || auth.user">
        <button class="item" role="menuitem" @click="pick(() => (transfer.exportOpen = true))"><span class="ico emo">⬇</span>Сохранить в файл</button>
        <button class="item" role="menuitem" @click="pick(() => (transfer.importOpen = true))"><span class="ico emo">⬆</span>Загрузить из файла</button>
      </template>
      <button v-if="!auth.required || auth.user" class="item" role="menuitem" @click="pick(() => emit('journal'))">
        <span class="ico" v-html="icon('journal')"></span>Журнал правок
      </button>
      <button class="item" role="menuitem" @click="pick(() => emit('status'))">
        <span class="ico" v-html="icon('status')"></span>Состояние системы
        <span v-if="sysLevel" class="sdot in" :class="sysLevel" :title="SYS_TITLE[sysLevel]"></span>
      </button>
      <template v-if="!auth.required">
        <div class="sep"></div>
        <button class="item" role="menuitem" @click="pick(() => (auth.setupOpen = true))">
          <span class="ico" v-html="icon('lock')"></span>Создать администратора
        </button>
      </template>
      <template v-else-if="auth.user">
        <button v-if="can('admin')" class="item" role="menuitem" @click="pick(() => (auth.usersOpen = true))">
          <span class="ico" v-html="icon('users')"></span>Пользователи
        </button>
        <button v-if="can('admin')" class="item" role="menuitem" @click="pick(() => (auth.accessOpen = true))">
          <span class="ico" v-html="icon('lock')"></span>Доступ к редактору
        </button>
        <button class="item" role="menuitem" @click="pick(() => (auth.passOpen = true))">
          <span class="ico" v-html="icon('key')"></span>Мой пароль
        </button>
        <div class="sep"></div>
        <button class="item" role="menuitem" @click="pick(logout)">
          <span class="ico" v-html="icon('logout')"></span>Выйти
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.hm {
  position: relative;
  flex: none;
}
.gear {
  position: relative;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 8px;
  background: #3b404a;
  color: #fff;
  cursor: pointer;
}
.gear:hover,
.gear.on {
  background: #4a505c;
}
.ico {
  display: inline-grid;
  place-items: center;
  flex: none;
}
.gear .sdot {
  position: absolute;
  top: 5px;
  right: 5px;
  box-shadow: 0 0 0 2px #3b404a;
}
.sdot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #4cc26a;
}
.sdot.warn {
  background: #e8b630;
}
.sdot.bad {
  background: #e5503f;
}
.sdot.in {
  margin-left: auto;
}
.menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 60;
  width: 270px;
  padding: 8px;
  border-radius: 12px;
  background: #2b2f36;
  border: 1px solid #3b404a;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}
.group {
  padding: 4px 8px 6px;
  color: #8b909a;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.views {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.view,
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: none;
  border-radius: 8px;
  padding: 8px 10px;
  background: transparent;
  color: #e6e8ec;
  font: inherit;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}
.view::before {
  content: '';
  flex: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #6b717c;
  box-sizing: border-box;
}
.view.on::before {
  border: 4px solid #3d7be0;
}
.view:hover,
.item:hover {
  background: #3b404a;
}
.item:disabled {
  opacity: 0.5;
  cursor: default;
}
.emo {
  font-size: 16px;
  line-height: 1;
}
.sw {
  margin-left: auto;
  padding: 2px 10px;
  border-radius: 10px;
  background: #3b404a;
  color: #aeb4bf;
  font-size: 13px;
}
.sw.on {
  background: #2f9d57;
  color: #fff;
}
.sep {
  height: 1px;
  margin: 6px 4px;
  background: #3b404a;
}
</style>
