<script setup>
// Выбор одной картинки из медиатеки (для новостей и карточек колод). emit('pick', id) или emit('close').
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { media, thumbUrl } from '../playlist.js'

const props = defineProps({ current: { type: String, default: '' } })
const emit = defineEmits(['pick', 'close'])

const category = ref('')
const query = ref('')
const images = computed(() =>
  media.value
    .filter((m) => m.type === 'image')
    .filter((m) => !category.value || m.category === category.value)
    .filter((m) => !query.value || m.name.toLowerCase().includes(query.value.toLowerCase()))
    .sort((a, b) => b.addedAt - a.addedAt),
)
const categories = computed(() =>
  [...new Set(media.value.filter((m) => m.type === 'image').map((m) => m.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
)

const onKey = (e) => e.key === 'Escape' && emit('close')
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="a-modal-back" @mousedown.self="emit('close')">
    <div class="a-modal picker">
      <div class="head">
        <h2>Картинка из медиатеки</h2>
        <input v-model="query" class="a-input" placeholder="Поиск по названию" />
        <select v-if="categories.length" v-model="category" class="a-select">
          <option value="">Все категории</option>
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
      <div v-if="!images.length" class="a-hint empty">
        Фото не найдено. Загрузите его в разделе <a href="#media" @click="emit('close')">Медиатека</a>.
      </div>
      <div class="grid">
        <button v-for="m in images" :key="m.id" class="pick" :class="{ on: m.id === props.current }" @click="emit('pick', m.id)">
          <img :src="thumbUrl(m)" alt="" loading="lazy" />
          <span class="name">{{ m.name }}</span>
        </button>
      </div>
      <div class="foot">
        <button class="a-btn" @click="emit('close')">Отмена</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.picker {
  width: min(1000px, 94vw);
  height: min(720px, 90vh);
}
.head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.head h2 {
  margin-right: auto;
}
.empty a {
  color: #8db4ff;
}
.grid {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  align-content: start;
  gap: 10px;
}
.pick {
  position: relative;
  aspect-ratio: 16 / 9;
  padding: 0;
  border: 3px solid transparent;
  border-radius: 10px;
  overflow: hidden;
  background: #000;
  cursor: pointer;
}
.pick:hover {
  border-color: #4a505c;
}
.pick.on {
  border-color: #3d7be0;
}
.pick img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.name {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 14px 8px 5px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.foot {
  display: flex;
  justify-content: flex-end;
}
</style>
