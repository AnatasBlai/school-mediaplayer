<script setup>
// Окна «Вход в редактор», «Создать администратора» и «Мой пароль». Логика — в auth.js.
import { ref, watch } from 'vue'
import { auth, login, setPassword, createAdmin } from './auth.js'

const name = ref('')
const log = ref('')
const pass = ref('')
const cur = ref('')
const next = ref('')
const next2 = ref('')
const error = ref('')
const busy = ref(false)

watch(
  () => [auth.loginOpen, auth.passOpen, auth.setupOpen],
  () => {
    name.value = log.value = pass.value = cur.value = next.value = next2.value = error.value = ''
  },
)

async function run(fn) {
  busy.value = true
  error.value = ''
  try {
    await fn()
  } catch (e) {
    error.value = e.message
  }
  busy.value = false
}

const doLogin = () => log.value && pass.value && run(() => login(log.value, pass.value))

function doSet() {
  if (next.value !== next2.value) return (error.value = 'Пароли не совпадают')
  if (next.value.length < 4) return (error.value = 'Пароль — не короче 4 символов')
  run(() => setPassword(cur.value, next.value))
}

function doSetup() {
  if (next.value !== next2.value) return (error.value = 'Пароли не совпадают')
  run(() => createAdmin(name.value, log.value, next.value))
}
</script>

<template>
  <div v-if="auth.loginOpen" class="a-modal-back auth-back">
    <form class="a-modal auth" @submit.prevent="doLogin">
      <h2>Вход в редактор</h2>
      <input v-model="log" class="a-input" placeholder="Логин" autocomplete="username" autocapitalize="none" autofocus />
      <input v-model="pass" class="a-input" type="password" placeholder="Пароль" autocomplete="current-password" />
      <div v-if="error" class="err">{{ error }}</div>
      <button class="a-btn primary" :disabled="busy || !log || !pass">Войти</button>
      <div class="small">Забыли пароль? Обратитесь к администратору табло</div>
    </form>
  </div>

  <div v-else-if="auth.setupOpen" class="a-modal-back" @mousedown.self="auth.setupOpen = false">
    <form class="a-modal auth" @submit.prevent="doSetup">
      <h2>Создать администратора</h2>
      <div class="small">
        Без входа любой в школьной сети может менять расписание. После создания редактор будет просить логин и пароль; экраны работают как раньше.
      </div>
      <input v-model="name" class="a-input" placeholder="Имя (Иванова И. И.)" maxlength="60" />
      <input v-model="log" class="a-input" placeholder="Логин (латиница и цифры)" maxlength="30" autocapitalize="none" autocomplete="username" />
      <input v-model="next" class="a-input" type="password" placeholder="Пароль" autocomplete="new-password" />
      <input v-model="next2" class="a-input" type="password" placeholder="Пароль ещё раз" autocomplete="new-password" />
      <div v-if="error" class="err">{{ error }}</div>
      <div class="row">
        <button class="a-btn primary" :disabled="busy || !name || !log || !next">Создать</button>
        <button type="button" class="a-btn" @click="auth.setupOpen = false">Отмена</button>
      </div>
    </form>
  </div>

  <div v-else-if="auth.passOpen" class="a-modal-back" @mousedown.self="auth.passOpen = false">
    <form class="a-modal auth" @submit.prevent="doSet">
      <h2>Мой пароль</h2>
      <input v-model="cur" class="a-input" type="password" placeholder="Текущий пароль" autocomplete="current-password" />
      <input v-model="next" class="a-input" type="password" placeholder="Новый пароль" autocomplete="new-password" />
      <input v-model="next2" class="a-input" type="password" placeholder="Новый пароль ещё раз" autocomplete="new-password" />
      <div class="small">На других компьютерах придётся войти заново.</div>
      <div v-if="error" class="err">{{ error }}</div>
      <div class="row">
        <button class="a-btn primary" :disabled="busy || !cur || !next">Сменить</button>
        <button type="button" class="a-btn" @click="auth.passOpen = false">Отмена</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.auth {
  width: 340px;
}
.auth-back {
  z-index: 200;
}
.err {
  color: #ff8a7a;
  font-weight: 700;
}
.small {
  color: #8b909a;
  font-size: 12px;
}
.row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
