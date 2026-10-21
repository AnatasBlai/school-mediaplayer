// Перенос плейлиста файлом на стороне редактора: запросы к /api/transfer и флаги окон (их показывает AdminApp).
import { reactive } from 'vue'
import { needLogin } from './auth.js'

export const transfer = reactive({ exportOpen: false, importOpen: false })

async function call(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || `Ошибка сервера (${r.status})`)
  return d
}

const query = (parts, all) => new URLSearchParams({ parts: parts.join(','), all: all ? '1' : '0' })

/** { slides, decks, files, bytes, tooBig } — по тем же правилам, что и выгрузка. */
export const estimateTransfer = (parts, all) => call('GET', '/api/transfer/estimate?' + query(parts, all))
export const exportUrl = (parts, all) => '/api/transfer/export?' + query(parts, all)

/** Отправка выбранного zip на сервер с ходом (XHR, как uploadMedia) → { token, name, manifest, preview }. */
export function uploadTransfer(file, onProgress) {
  const attempt = () =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/transfer/import?' + new URLSearchParams({ name: file.name }))
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
      xhr.onload = () => {
        let d = {}
        try {
          d = JSON.parse(xhr.responseText)
        } catch {
          /* пусто */
        }
        if (xhr.status === 401) return needLogin().then(() => resolve(attempt()))
        if (xhr.status === 200 && d.ok) resolve(d)
        else reject(new Error(d.error || `Ошибка сервера (${xhr.status})`))
      }
      xhr.onerror = () => reject(new Error('Нет связи с сервером'))
      xhr.send(file)
    })
  return attempt()
}

export const applyTransfer = (token, body) => call('POST', `/api/transfer/import/${token}/apply`, body)
export const transferProgress = (token) => call('GET', `/api/transfer/import/${token}`)
export const cancelTransfer = (token) => fetch(`/api/transfer/import/${token}`, { method: 'DELETE', keepalive: true }).catch(() => {})
