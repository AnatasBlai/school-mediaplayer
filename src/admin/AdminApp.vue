<script setup>
// Редактор (/admin): открывается в отдельной вкладке. Правки сразу уходят на сервер и видны на экранах.
import { computed } from 'vue'
import { saveStatus, connected } from '../store.js'
import ScheduleBoard from '../components/ScheduleBoard.vue'

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
        <button class="nav-btn on">Расписание</button>
      </nav>
      <div class="hint">Клик — выделить ячейку, второй клик или ввод — редактировать, Enter — сохранить</div>
      <div class="status" :class="status.cls">{{ status.text }}</div>
      <a class="open" href="/" target="_blank">Открыть экран ↗</a>
    </header>
    <main class="work">
      <div class="board">
        <ScheduleBoard editable />
      </div>
    </main>
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
  gap: 20px;
  padding: 0 20px;
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
  white-space: nowrap;
  font-weight: 700;
  color: #c9ccd3;
}
.status.ok {
  color: #7fd18b;
}
.status.bad {
  color: #ff8a7a;
}
.open {
  white-space: nowrap;
  padding: 8px 14px;
  border-radius: 8px;
  background: #3b404a;
  color: #fff;
  font-weight: 700;
  text-decoration: none;
}
.open:hover {
  background: #4a505c;
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
</style>
