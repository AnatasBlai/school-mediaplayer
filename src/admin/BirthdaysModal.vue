<script setup>
// Окно «Именинники»: один список на всё табло (data/birthdays.json) — ФИО, класс или «учитель», день и месяц.
// Поиск, «Добавить», удаление, «Вставить из Excel» с предпросмотром (ошибочные строки — красным, повторы не добавляются).
// Правки сохраняются сами (src/birthdaysStore.js). Полный список виден только после входа.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { birthdays, birthdaysLoaded, birthdaysError, startBirthdays, makeBirthday } from '../birthdaysStore.js'
import { parseBirthDate, normBirthCls, parseBirthdayTable, sameBirthday, fmtBirthDate, TEACHER } from '../birthdays.js'
import { plural } from '../bells.js'

const emit = defineEmits(['close'])
onMounted(startBirthdays)

const dm = (d) => (d ? d.slice(3) + '.' + d.slice(0, 2) : '') // 'ММ-ДД' → 'ДД.ММ'

// ---------- список ----------
const q = ref('')
const shown = computed(() => {
  const s = q.value.trim().toLowerCase().replace(/ё/g, 'е')
  const list = s ? birthdays.items.filter((x) => (x.name + ' ' + x.cls + ' ' + dm(x.d)).toLowerCase().replace(/ё/g, 'е').includes(s)) : birthdays.items
  return [...list].sort((a, b) => a.d.localeCompare(b.d) || a.name.localeCompare(b.name, 'ru'))
})
const total = computed(() => birthdays.items.length)
const teachers = computed(() => birthdays.items.filter((x) => x.cls === TEACHER).length)

function setName(it, e) {
  const v = e.target.value.replace(/\s+/g, ' ').trim().slice(0, 80)
  if (v) it.name = v
  else e.target.value = it.name
}
function setCls(it, e) {
  const v = normBirthCls(e.target.value)
  if (v) it.cls = v
  e.target.value = it.cls
}
const badDate = ref('') // id строки, где дату не поняли
function setDate(it, e) {
  const d = parseBirthDate(e.target.value)
  if (d) {
    it.d = d
    badDate.value = ''
  } else badDate.value = it.id
  e.target.value = dm(it.d)
}
function remove(it) {
  if (!confirm(`Удалить из списка: ${it.name}?`)) return
  const i = birthdays.items.indexOf(it)
  if (i >= 0) birthdays.items.splice(i, 1)
}

// ---------- добавить одного ----------
const add = reactive({ name: '', cls: '', date: '', error: '' })
const nameEl = ref(null)
function addOne() {
  const name = add.name.replace(/\s+/g, ' ').trim().slice(0, 80)
  const cls = normBirthCls(add.cls)
  const d = parseBirthDate(add.date)
  add.error = !name ? 'Впишите ФИО' : !cls ? 'Класс — например, 8А, или «учитель»' : !d ? 'Дата — например, 05.03 или 5 марта' : ''
  if (add.error) return
  if (birthdays.items.some((x) => sameBirthday(x, { name, d }))) return (add.error = 'Такой человек с этой датой уже есть')
  birthdays.items.push(makeBirthday(name, cls, d))
  Object.assign(add, { name: '', cls: '', date: '', error: '' })
  nextTick(() => nameEl.value?.focus())
}

// ---------- из Excel ----------
const pasteOpen = ref(false)
const text = ref('')
const parsed = computed(() => (text.value.trim() ? parseBirthdayTable(text.value, birthdays.items) : []))
const good = computed(() => parsed.value.filter((r) => !r.error && !r.dup))
const bad = computed(() => parsed.value.filter((r) => r.error))
const dups = computed(() => parsed.value.filter((r) => r.dup))
// в предпросмотре сначала ошибки, потом повторы — чтобы их было видно без прокрутки
const preview = computed(() => [...bad.value, ...dups.value, ...good.value])
const done = ref(null) // { ids } — для «Отменить»
function addPasted() {
  const added = good.value.map((r) => makeBirthday(r.name, r.cls, r.d))
  birthdays.items.push(...added)
  done.value = { ids: added.map((x) => x.id) }
  text.value = ''
}
function undoPasted() {
  const ids = new Set(done.value.ids)
  birthdays.items = birthdays.items.filter((x) => !ids.has(x.id))
  done.value = null
}

const onKey = (e) => e.key === 'Escape' && emit('close')
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="a-modal-back" @mousedown.self="emit('close')">
    <div class="a-modal bdl">
      <div class="head">
        <h2>Именинники</h2>
        <span class="a-hint">
          <template v-if="birthdaysLoaded">
            {{ total }} {{ plural(total, 'человек', 'человека', 'человек') }}<template v-if="teachers">, из них учителей — {{ teachers }}</template>
          </template>
        </span>
        <button class="a-btn primary" data-ro-allow @click="emit('close')">Готово</button>
      </div>
      <p class="a-hint note">
        Список вносится с согласия учеников, родителей и учителей — решает школа. Хранятся только ФИО, класс, день и месяц
        рождения (без года). Экран показывает только сегодняшних именинников и без дат.
      </p>

      <div v-if="birthdaysError" class="bad">{{ birthdaysError }}</div>
      <template v-else-if="birthdaysLoaded">
        <!-- добавить одного -->
        <div class="add">
          <input ref="nameEl" v-model="add.name" class="a-input nm" maxlength="80" placeholder="Фамилия Имя Отчество" @keydown.enter="addOne" />
          <input v-model="add.cls" class="a-input cl" maxlength="10" placeholder="8А / учитель" list="bd-cls" @keydown.enter="addOne" />
          <datalist id="bd-cls"><option value="учитель" /></datalist>
          <input v-model="add.date" class="a-input dt" maxlength="20" placeholder="05.03" @keydown.enter="addOne" />
          <button class="a-btn" @click="addOne">＋ Добавить</button>
          <button class="a-btn" :class="{ on: pasteOpen }" @click="pasteOpen = !pasteOpen">Вставить из Excel</button>
        </div>
        <div v-if="add.error" class="a-warn">{{ add.error }}</div>

        <!-- вставка из Excel -->
        <div v-if="pasteOpen" class="paste">
          <textarea
            v-model="text"
            class="a-textarea box"
            rows="5"
            placeholder="Выделите в Excel три столбца — ФИО, класс, дата рождения — нажмите Ctrl+C и вставьте сюда (Ctrl+V)"
          ></textarea>
          <p class="a-hint">
            Дата — в любом виде: «05.03.2012», «5 марта», «05.03»; год не сохраняется. Для учителя в столбце класса —
            «учитель». Строка заголовка («ФИО, Класс, Дата») пропускается. Повторы (то же ФИО и дата) не добавляются.
          </p>
          <div v-if="done" class="ok">
            Добавлено: {{ done.ids.length }}
            <button class="a-link" @click="undoPasted">Отменить</button>
          </div>
          <div v-if="parsed.length" class="table pv">
            <table>
              <tbody>
                <tr v-for="r in preview" :key="r.line" :class="{ err: r.error, dup: r.dup }">
                  <td class="n">{{ r.line }}</td>
                  <td>{{ r.name }}</td>
                  <td>{{ r.cls }}</td>
                  <td>{{ r.d ? fmtBirthDate(r.d) : '' }}</td>
                  <td class="why">{{ r.error || (r.dup ? 'уже есть — пропускается' : '') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="parsed.length" class="foot">
            <button class="a-btn primary" :disabled="!good.length" @click="addPasted">
              Добавить {{ good.length }} {{ plural(good.length, 'человека', 'человек', 'человек') }}
            </button>
            <span v-if="bad.length" class="a-hint">
              С ошибками: {{ bad.length }} — не добавятся, исправьте их в Excel и вставьте снова.
            </span>
            <span v-if="dups.length" class="a-hint">Повторов: {{ dups.length }}.</span>
          </div>
        </div>

        <!-- список -->
        <input v-model="q" class="a-input search" placeholder="Поиск: фамилия, класс или дата" data-ro-allow />
        <div class="table list">
          <table>
            <thead>
              <tr>
                <th>ФИО</th>
                <th>Класс</th>
                <th>День.месяц</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="it in shown" :key="it.id">
                <td><input class="cell" :value="it.name" maxlength="80" @change="setName(it, $event)" /></td>
                <td><input class="cell cl" :value="it.cls" maxlength="10" @change="setCls(it, $event)" /></td>
                <td>
                  <input class="cell dt" :class="{ bad: badDate === it.id }" :value="dm(it.d)" maxlength="20" :title="fmtBirthDate(it.d)" @change="setDate(it, $event)" />
                </td>
                <td class="x"><button class="a-btn small" title="Удалить" @click="remove(it)">✕</button></td>
              </tr>
              <tr v-if="!shown.length">
                <td colspan="4" class="empty">{{ q ? 'Никого не нашли' : 'Список пуст — добавьте людей или вставьте таблицу из Excel' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <div v-else class="a-hint">Загрузка…</div>
    </div>
  </div>
</template>

<style scoped>
.bdl {
  width: min(900px, 96vw);
  max-height: 92vh;
  overflow-y: auto;
}
.head {
  display: flex;
  align-items: center;
  gap: 14px;
}
.head .a-hint {
  margin-right: auto;
}
.note {
  margin: 0;
}
.add {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.add .nm {
  flex: 1 1 240px;
}
.add .cl {
  width: 120px;
}
.add .dt {
  width: 100px;
}
.a-btn.on {
  background: #3d7be0;
}
.paste {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #353943;
}
.box {
  width: 100%;
  box-sizing: border-box;
  font-family: monospace;
  font-size: 13px;
  white-space: pre;
}
.paste .a-hint {
  margin: 0;
}
.ok {
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(63, 174, 90, 0.18);
  border: 1px solid #3fae5a;
  color: #8fe0a2;
  font-weight: 700;
}
.bad {
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(220, 70, 60, 0.18);
  border: 1px solid #dc463c;
  color: #ff9a8f;
  font-weight: 700;
}
.foot {
  display: flex;
  align-items: center;
  gap: 12px;
}
.search {
  width: 100%;
  box-sizing: border-box;
}
.table {
  overflow: auto;
  border: 1px solid #353943;
  border-radius: 8px;
}
.pv {
  max-height: 260px;
}
.list {
  max-height: 46vh;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-weight: 600;
}
th,
td {
  padding: 4px 8px;
  border: 1px solid #2c3037;
  text-align: left;
}
th {
  position: sticky;
  top: 0;
  background: #262a31;
  z-index: 1;
}
td.n {
  width: 30px;
  color: #9aa1ad;
}
tr.err td {
  background: rgba(220, 70, 60, 0.16);
  color: #ff9a8f;
}
tr.dup td {
  color: #7d8491;
}
td.why {
  font-weight: 700;
}
.cell {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
}
.cell:hover,
.cell:focus {
  border-color: #4a505c;
  background: #1d1f24;
  outline: none;
}
.cell.cl {
  width: 110px;
}
.cell.dt {
  width: 90px;
}
.cell.bad {
  border-color: #dc463c;
}
td.x {
  width: 40px;
  text-align: center;
}
.empty {
  padding: 18px;
  text-align: center;
  color: #9aa1ad;
}
</style>
