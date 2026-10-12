// Медиатека на стороне редактора: подготовка файлов в браузере и запросы к /api/media.

const W = 1920
const H = 1080
const THUMB = 480 // превью — не больше 480 px по длинной стороне

export const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
export const VIDEO_EXT = ['.mp4', '.m4v', '.webm', '.mov']
export const ACCEPT = [...IMAGE_EXT, ...VIDEO_EXT].join(',')

const extOf = (name) => (name.match(/\.[^.]+$/)?.[0] || '').toLowerCase()
const baseOf = (name) => name.replace(/\.[^.]+$/, '')

import { needLogin } from './auth.js'

export { mediaUrl, thumbUrl } from '../playlist.js'

// ---------- форматирование ----------

export function fmtSize(b) {
  if (!b) return '0 Б'
  const u = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ']
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)))
  return (b / 1024 ** i).toLocaleString('ru-RU', { maximumFractionDigits: i >= 2 ? 1 : 0 }) + ' ' + u[i]
}

export function fmtDuration(sec) {
  const s = Math.round(sec || 0)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

// ---------- подготовка файла ----------

function canvasBlob(source, w, h, type, quality) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d').drawImage(source, 0, 0, w, h)
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось обработать изображение'))), type, quality),
  )
}

function thumbOf(source, w, h) {
  const k = Math.min(1, THUMB / Math.max(w, h))
  return canvasBlob(source, Math.round(w * k), Math.round(h * k), 'image/jpeg', 0.8)
}

async function prepareImage(file, ext) {
  let bmp
  try {
    bmp = await createImageBitmap(file) // поворот по EXIF браузер учитывает сам
  } catch {
    throw new Error('Не удалось открыть изображение')
  }
  const { width: w, height: h } = bmp
  const thumb = await thumbOf(bmp, w, h)

  // GIF не трогаем: при перерисовке пропадёт анимация
  // Остальное уменьшаем так, чтобы фото всё ещё закрывало экран 1920×1080 целиком
  const k = ext === '.gif' ? 1 : Math.min(1, Math.max(W / w, H / h))
  if (k >= 1) {
    bmp.close()
    return { blob: file, name: file.name, w, h, thumb }
  }
  const nw = Math.round(w * k)
  const nh = Math.round(h * k)
  // PNG может быть с прозрачностью — переводим в WebP, он её сохраняет и весит меньше
  const toWebp = ext === '.png' || ext === '.webp'
  const blob = await canvasBlob(bmp, nw, nh, toWebp ? 'image/webp' : 'image/jpeg', 0.9)
  bmp.close()
  return { blob, name: baseOf(file.name) + (toWebp ? '.webp' : '.jpg'), w: nw, h: nh, thumb }
}

function prepareVideo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.muted = true
    v.preload = 'auto'
    const done = (fn, arg) => {
      clearTimeout(timer)
      v.onerror = v.onloadedmetadata = v.onseeked = null
      v.removeAttribute('src')
      v.load()
      URL.revokeObjectURL(url)
      fn(arg)
    }
    const fail = () =>
      done(
        reject,
        new Error('Браузер не может воспроизвести это видео. Сохраните его в MP4 (H.264) — тогда экран его покажет.'),
      )
    const timer = setTimeout(fail, 20000)
    v.onerror = fail
    v.onloadedmetadata = () => {
      // HEVC и некоторые .mov: метаданные читаются, а картинки нет
      if (!v.videoWidth || !v.videoHeight) return fail()
      v.currentTime = Math.min(1, (v.duration || 0) / 3)
    }
    v.onseeked = async () => {
      try {
        const thumb = await thumbOf(v, v.videoWidth, v.videoHeight)
        done(resolve, { blob: file, name: file.name, w: v.videoWidth, h: v.videoHeight, duration: v.duration, thumb })
      } catch (e) {
        done(reject, e)
      }
    }
    v.src = url
  })
}

/** Проверяет файл и готовит его к загрузке: { blob, name, w, h, duration?, thumb } */
export function prepareFile(file) {
  const ext = extOf(file.name)
  if (IMAGE_EXT.includes(ext)) return prepareImage(file, ext)
  if (VIDEO_EXT.includes(ext)) return prepareVideo(file)
  return Promise.reject(new Error(`Формат ${ext || 'без расширения'} не поддерживается. Подходят фото (JPG, PNG, WebP, GIF) и видео (MP4, WebM)`))
}

// ---------- запросы ----------

async function call(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: body instanceof Blob ? {} : { 'Content-Type': 'application/json' },
    body: body instanceof Blob ? body : body && JSON.stringify(body),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || `Ошибка сервера (${r.status})`)
  return d
}

export const listMedia = () => call('GET', '/api/media')
export const patchMedia = (id, data) => call('PATCH', '/api/media/' + id, data)
export const deleteMedia = (id) => call('DELETE', '/api/media/' + id)
export const uploadThumb = (id, blob) => call('PUT', `/api/media/${id}/thumb`, blob)

/** Загрузка с прогрессом (fetch не умеет показывать прогресс отправки, поэтому XHR). */
export function uploadMedia(prepared, category, onProgress) {
  const q = new URLSearchParams({
    name: prepared.name,
    w: prepared.w,
    h: prepared.h,
    duration: prepared.duration || 0,
    category: category || '',
  })
  const attempt = () =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/media?' + q)
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
      xhr.onload = () => {
        let d = {}
        try {
          d = JSON.parse(xhr.responseText)
        } catch {
          /* пусто */
        }
        if (xhr.status === 401) return needLogin().then(() => resolve(attempt())) // вошли — отправляем заново
        if (xhr.status === 200 && d.ok) resolve(d.item)
        else reject(new Error(d.error || `Ошибка сервера (${xhr.status})`))
      }
      xhr.onerror = () => reject(new Error('Нет связи с сервером'))
      xhr.send(prepared.blob)
    })
  return attempt()
}
