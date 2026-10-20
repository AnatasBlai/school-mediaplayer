<script setup>
// Окно «Состояние системы»: что проверено → состояние → подсказка. Данные — systemStatus.js (GET /api/status).
import { onMounted, ref } from 'vue'
import { loadStatus, rows, sys } from './systemStatus.js'
import BackupPanel from './BackupPanel.vue'

const emit = defineEmits(['close'])
const backupOpen = ref(false)
onMounted(loadStatus)
</script>

<template>
  <div class="a-modal-back" @mousedown.self="emit('close')">
    <div class="a-modal st">
      <h2>Состояние системы</h2>
      <p v-if="sys.error" class="err">Нет связи с сервером: {{ sys.error }}</p>
      <ul class="list">
        <li v-for="r in rows" :key="r.name" class="row">
          <span class="dot" :class="r.level"></span>
          <div class="txt">
            <b>{{ r.name }}</b>
            <span class="val">{{ r.value }}</span>
            <span v-if="r.hint" class="hint" :class="r.level">{{ r.hint }}</span>
            <button v-if="r.action === 'backup'" class="a-btn" @click="backupOpen = true">Открыть настройки копий</button>
          </div>
        </li>
      </ul>
      <div class="foot">
        <button class="a-btn" :disabled="sys.loading" @click="loadStatus">Обновить</button>
        <button class="a-btn primary" @click="emit('close')">Закрыть</button>
      </div>
    </div>
    <BackupPanel v-if="backupOpen" @close="((backupOpen = false), loadStatus())" />
  </div>
</template>

<style scoped>
.st {
  width: 760px;
  overflow: auto;
}
.list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.dot {
  flex: none;
  width: 14px;
  height: 14px;
  margin-top: 3px;
  border-radius: 50%;
  background: #4cc26a;
}
.dot.warn {
  background: #e8b630;
}
.dot.bad {
  background: #e5503f;
}
.txt {
  display: flex;
  flex-direction: column;
  gap: 3px;
  align-items: flex-start;
}
.val {
  color: #c9ccd3;
}
.hint.warn {
  color: #e8b630;
}
.hint.bad {
  color: #ff8a7a;
}
.err {
  margin: 0;
  color: #ff8a7a;
  font-weight: 700;
}
.foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
