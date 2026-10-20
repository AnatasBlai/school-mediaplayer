<script setup>
// Окно «Пользователи» (только «Администратор»): кто может входить в редактор и в какие разделы.
import { computed, onMounted, ref } from 'vue'
import { auth, listUsers, addUser, saveUser, removeUser } from './auth.js'

const emit = defineEmits(['close'])

const RIGHT_TITLES = [
  ['schedule', 'Расписание'],
  ['playlist', 'Плейлист'],
  ['decks', 'Колоды'],
  ['media', 'Медиатека'],
  ['admin', 'Администратор'],
]

const users = ref([])
const error = ref('')
const busy = ref(false)
const sel = ref('') // id выбранного, '' — новый
const form = ref(blank())
const newPass = ref('')
const confirmDel = ref(false)

function blank() {
  return { name: '', login: '', rights: [], disabled: false }
}
const isNew = computed(() => !sel.value)
const isMe = computed(() => sel.value && sel.value === auth.user?.id)

async function load() {
  users.value = await listUsers()
}
onMounted(() => load().catch((e) => (error.value = e.message)))

function pick(u) {
  sel.value = u ? u.id : ''
  form.value = u ? { name: u.name, login: u.login, rights: [...u.rights], disabled: u.disabled } : blank()
  newPass.value = ''
  error.value = ''
  confirmDel.value = false
}

function toggle(r) {
  const f = form.value
  f.rights = f.rights.includes(r) ? f.rights.filter((x) => x !== r) : [...f.rights, r]
}

async function run(fn, after) {
  busy.value = true
  error.value = ''
  try {
    await fn()
    await load()
    after?.()
  } catch (e) {
    error.value = e.message
  }
  busy.value = false
}

const create = () =>
  run(
    async () => {
      const d = await addUser({ ...form.value, password: newPass.value })
      sel.value = d.user.id
    },
    () => pick(users.value.find((u) => u.id === sel.value)),
  )
const save = () =>
  run(
    () => saveUser(sel.value, { name: form.value.name, login: form.value.login, rights: form.value.rights, password: newPass.value || undefined }),
    () => pick(users.value.find((u) => u.id === sel.value)),
  )
const toggleOff = () =>
  run(
    () => saveUser(sel.value, { disabled: !form.value.disabled }),
    () => pick(users.value.find((u) => u.id === sel.value)),
  )
const del = () =>
  run(
    () => removeUser(sel.value),
    () => pick(null),
  )
const rightsText = (u) => (u.rights.includes('admin') ? 'Администратор' : RIGHT_TITLES.filter(([r]) => u.rights.includes(r)).map(([, t]) => t).join(', ') || 'только просмотр')
</script>

<template>
  <div class="a-modal-back" @mousedown.self="emit('close')">
    <div class="a-modal users">
      <h2>Пользователи</h2>
      <div class="cols">
        <div class="list">
          <button v-for="u in users" :key="u.id" class="u" :class="{ on: u.id === sel, off: u.disabled }" @click="pick(u)">
            <b>{{ u.name }}</b>
            <span>{{ u.login }} · {{ u.disabled ? 'отключён' : rightsText(u) }}</span>
          </button>
          <button class="a-btn" @click="pick(null)">＋ Добавить</button>
        </div>
        <div class="form">
          <div class="cap">{{ isNew ? 'Новый пользователь' : form.name }}</div>
          <input v-model="form.name" class="a-input" placeholder="Имя (Иванова И. И.)" maxlength="60" />
          <input v-model="form.login" class="a-input" placeholder="Логин (латиница и цифры)" maxlength="30" autocapitalize="none" />
          <div class="rights">
            <label v-for="[r, t] in RIGHT_TITLES" :key="r" class="a-check">
              <input type="checkbox" :checked="form.rights.includes(r)" @change="toggle(r)" />
              {{ t }}
            </label>
          </div>
          <div class="small">«Администратор» — всё, а ещё резервные копии и пользователи. Без галочек человек может только смотреть.</div>
          <input v-model="newPass" class="a-input" type="password" autocomplete="new-password" :placeholder="isNew ? 'Пароль' : 'Новый пароль (если нужно сменить)'" />
          <div v-if="error" class="err">{{ error }}</div>
          <div class="row">
            <button v-if="isNew" class="a-btn primary" :disabled="busy || !form.name || !form.login || !newPass" @click="create">Создать</button>
            <template v-else>
              <button class="a-btn primary" :disabled="busy || !form.name || !form.login" @click="save">Сохранить</button>
              <button v-if="!isMe" class="a-btn" :disabled="busy" @click="toggleOff">{{ form.disabled ? 'Включить' : 'Отключить' }}</button>
              <button v-if="!isMe && !confirmDel" class="a-btn danger" :disabled="busy" @click="confirmDel = true">Удалить</button>
              <button v-if="confirmDel" class="a-btn danger" :disabled="busy" @click="del">Точно удалить?</button>
            </template>
          </div>
        </div>
      </div>
      <div class="row"><button class="a-btn" @click="emit('close')">Закрыть</button></div>
    </div>
  </div>
</template>

<style scoped>
.users {
  width: 760px;
  max-width: 96vw;
}
.cols {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.list {
  flex: 0 0 250px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 60vh;
  overflow: auto;
}
.u {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  border: 1px solid #3b404a;
  border-radius: 8px;
  padding: 7px 10px;
  background: #15171b;
  color: #f2f2f2;
  font: inherit;
  cursor: pointer;
}
.u.on {
  border-color: #3d7be0;
}
.u.off {
  opacity: 0.55;
}
.u span {
  font-size: 12px;
  color: #8b909a;
}
.form {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cap {
  font-weight: 800;
}
.rights {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
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
