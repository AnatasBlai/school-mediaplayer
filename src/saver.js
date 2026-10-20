// Сохранение данных на сервер без затирания чужих правок (общее для store.js, playlist.js, decks.js).
// Saver помнит «базу» — версию, которую последней получил с сервера или успешно отправил. PUT идёт с заголовком
// X-Base-Updated; ответ 409 — в файле уже новее: объединяем (src/merge.js) и повторяем. Подробности — в CLAUDE.md.
import { ref } from 'vue'
import { merge3, deepEqual, describeConflicts } from './merge.js'

/** Сообщение для шапки редактора: { text, error } или null; само гаснет через 10 с. */
export const syncNotice = ref(null)
let noticeTimer = null
function notify(text, error = false) {
  syncNotice.value = { text, error }
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => (syncNotice.value = null), 10000)
}

const clone = (v) => JSON.parse(JSON.stringify(v))
const content = (doc) => {
  const { updatedAt, ...rest } = doc // eslint-disable-line no-unused-vars
  return rest
}

/**
 * url — адрес API; status — ref статуса сохранения; snapshot() — текущие данные как документ (с updatedAt);
 * normalize(raw) — документ сервера в вид снимка; applyDoc(doc) — записать документ в реактивное состояние;
 * names() — { id: название } для сообщения о конфликте.
 */
export function makeSaver({ url, status, snapshot, normalize, applyDoc, names = () => ({}), beforeSend }) {
  let base = null
  let timer = null
  let running = null

  const sameAsBase = () => !!base && deepEqual(content(snapshot()), content(base))

  /** Данные только что загружены (или сохранены) — запомнить как базу. */
  function setBase(doc) {
    base = clone(doc)
  }

  /** Документ с сервера: свежее базы → применить; при несохранённых правках — объединить. */
  async function receive(raw) {
    if (running) await running
    const remote = normalize(raw)
    if (base && (Number(remote.updatedAt) || 0) <= (Number(base.updatedAt) || 0)) return
    if (!base || sameAsBase()) {
      applyDoc(remote)
      setBase(remote)
      return
    }
    const { merged, conflicts } = merge3(content(base), content(snapshot()), content(remote))
    applyDoc({ ...merged, updatedAt: Date.now() })
    setBase(remote)
    report(conflicts)
    schedule()
  }

  function report(conflicts) {
    if (conflicts.length) {
      notify(`Одновременно с вами эти же места правил кто-то ещё (${describeConflicts(conflicts, names())}) — оставлена ваша правка`)
    }
  }

  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(push, 300)
  }

  function push() {
    if (running) return running.then(() => (sameAsBase() ? undefined : push()))
    running = send().finally(() => (running = null))
    return running
  }

  async function send() {
    try {
      let doc = snapshot()
      beforeSend?.(doc)
      for (let attempt = 0; attempt < 3; attempt++) {
        status.value = 'saving'
        const headers = { 'Content-Type': 'application/json' }
        if (base) headers['X-Base-Updated'] = String(base.updatedAt)
        const r = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(doc) })
        if (r.status === 409) {
          const remote = normalize((await r.json()).current)
          const { merged, conflicts } = merge3(content(base || remote), content(snapshot()), content(remote))
          doc = { ...merged, updatedAt: Date.now() }
          applyDoc(doc)
          setBase(remote)
          report(conflicts)
          continue
        }
        if (!r.ok) {
          status.value = 'offline'
          return
        }
        let updatedAt = doc.updatedAt
        try {
          updatedAt = Number((await r.json()).updatedAt) || updatedAt
        } catch {
          /* ответ без тела — оставляем свой updatedAt */
        }
        setBase({ ...doc, updatedAt })
        status.value = 'saved'
        return
      }
      status.value = 'offline'
      notify('Не удаётся сохранить: данные меняются слишком часто, обновите страницу', true)
    } catch {
      status.value = 'offline'
    }
  }

  /** updatedAt базы: событие сервера новее — стоит забрать данные. */
  const baseUpdated = () => Number(base?.updatedAt) || 0

  return { setBase, receive, schedule, push, baseUpdated }
}
