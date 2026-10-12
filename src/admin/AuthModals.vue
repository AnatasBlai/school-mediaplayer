<script setup>
// Окна «Вход в редактор» и «Пароль» (задать / сменить / убрать). Логика — в auth.js.
import { ref, watch } from 'vue'
import { auth, login, setPassword } from './auth.js'

const pass = ref('')
const cur = ref('')
const next = ref('')
const next2 = ref('')
const error = ref('')
const busy = ref(false)

watch(
  () => [auth.loginOpen, auth.passOpen],
  () => {
    pass.value = cur.value = next.value = next2.value = error.value = ''
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

const doLogin = () => pass.value && run(() => login(pass.value))

function doSet(remove) {
  if (!remove && next.value !== next2.value) return (error.value = 'Пароли не совпадают')
  if (!remove && next.value.length < 4) return (error.value = 'Пароль — не короче 4 символов')
  run(() => setPassword(cur.value, remove ? '' : next.value))
}
</script>

<template>
  <div v-if="auth.loginOpen" class="a-modal-back auth-back">
    <form class="a-modal auth" @submit.prevent="doLogin">
      <h2>Вход в редактор</h2>
      <input v-model="pass" class="a-input" type="password" placeholder="Пароль" autocomplete="current-password" autofocus />
      <div v-if="error" class="err">{{ error }}</div>
      <button class="a-btn primary" :disabled="busy || !pass">Войти</button>
      <div class="small">Забыли пароль? Обратитесь к администратору табло</div>
    </form>
  </div>

  <div v-else-if="auth.passOpen" class="a-modal-back" @mousedown.self="auth.passOpen = false">
    <form class="a-modal auth" @submit.prevent="doSet(false)">
      <h2>{{ auth.required ? 'Сменить пароль' : 'Пароль на редактор' }}</h2>
      <div v-if="!auth.required" class="small">
        Без пароля любой в школьной сети может менять расписание. С паролем редактор будет просить вход; экраны работают как раньше.
      </div>
      <input
        v-if="auth.required"
        v-model="cur"
        class="a-input"
        type="password"
        placeholder="Текущий пароль"
        autocomplete="current-password"
      />
      <input v-model="next" class="a-input" type="password" placeholder="Новый пароль" autocomplete="new-password" />
      <input v-model="next2" class="a-input" type="password" placeholder="Новый пароль ещё раз" autocomplete="new-password" />
      <div v-if="error" class="err">{{ error }}</div>
      <div class="row">
        <button class="a-btn primary" :disabled="busy || !next">{{ auth.required ? 'Сменить' : 'Задать пароль' }}</button>
        <button v-if="auth.required" type="button" class="a-btn danger" :disabled="busy || !cur" @click="doSet(true)">
          Убрать пароль
        </button>
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
