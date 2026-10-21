<script setup>
// Окно «Доступ к редактору» (только «Администратор»): с каких компьютеров школы можно открывать редактор.
import { computed, onMounted, ref } from 'vue'
import { getAccess, saveAccess } from './auth.js'

const emit = defineEmits(['close'])

const on = ref(false)
const allow = ref([]) // [{ net, note }]
const me = ref('')
const error = ref('')
const busy = ref(false)
const saved = ref(false)

const isLocal = computed(() => me.value === '127.0.0.1' || me.value === '::1')
const hasMe = computed(() => allow.value.some((x) => x.net.trim() === me.value))

onMounted(async () => {
  try {
    const d = await getAccess()
    on.value = d.on
    allow.value = d.allow
    me.value = d.me
  } catch (e) {
    error.value = e.message
  }
})

function addMe() {
  if (!hasMe.value) allow.value.push({ net: me.value, note: '' })
}
const addRow = () => allow.value.push({ net: '', note: '' })
const removeRow = (i) => allow.value.splice(i, 1)

async function save() {
  busy.value = true
  error.value = ''
  saved.value = false
  try {
    const d = await saveAccess({ on: on.value, allow: allow.value })
    allow.value = d.allow
    saved.value = true
  } catch (e) {
    error.value = e.message
  }
  busy.value = false
}
</script>

<template>
  <div class="a-modal-back" @mousedown.self="emit('close')">
    <div class="a-modal access">
      <h2>Доступ к редактору</h2>
      <label class="a-check">
        <input v-model="on" type="checkbox" />
        Открывать редактор только с этих компьютеров
      </label>
      <div class="small">Экраны (табло на телевизорах) работают всегда. Компьютер, на котором запущен сервер, может открыть редактор в любом случае.</div>
      <div class="me">
        Этот компьютер: <b>{{ me || '…' }}</b>
        <button v-if="!isLocal && !hasMe" class="a-btn" @click="addMe">Добавить этот компьютер</button>
        <span v-else-if="hasMe" class="small">— уже в списке</span>
        <span v-else class="small">— сам сервер, разрешён всегда</span>
      </div>
      <div class="rows">
        <div v-for="(x, i) in allow" :key="i" class="r">
          <input v-model="x.net" class="a-input net" placeholder="192.168.1.25 или 192.168.1.0/24" maxlength="40" />
          <input v-model="x.note" class="a-input note" placeholder="Подпись (Учительская)" maxlength="60" />
          <button class="a-btn danger" title="Убрать" @click="removeRow(i)">✕</button>
        </div>
        <div v-if="!allow.length" class="small">Список пуст.</div>
      </div>
      <div class="row"><button class="a-btn" :disabled="allow.length >= 50" @click="addRow">＋ Добавить адрес</button></div>
      <div v-if="error" class="err">{{ error }}</div>
      <div v-if="saved" class="ok">Сохранено</div>
      <div class="row">
        <button class="a-btn primary" :disabled="busy" @click="save">Сохранить</button>
        <button class="a-btn" @click="emit('close')">Закрыть</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.access {
  width: 640px;
  max-width: 96vw;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.me {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 40vh;
  overflow: auto;
}
.r {
  display: flex;
  gap: 6px;
}
.net {
  flex: 0 0 240px;
}
.note {
  flex: 1;
  min-width: 0;
}
.err {
  color: #ff8a7a;
  font-weight: 700;
}
.ok {
  color: #6fd08c;
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
