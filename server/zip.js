// Zip без зависимостей — для переноса плейлиста файлом (server/transfer.js).
//   ZipWriter — запись потоком: метод 0 (фото и видео уже сжаты), имена в UTF-8 (бит 11), data descriptor
//               (размер и CRC пишутся после данных, файлы в памяти не держим). Без Zip64: общий размер < 4 ГБ.
//   openZip   — чтение: центральный каталог, методы 0 и 8 (архив, пересжатый архиватором), проверка CRC и размера.
//               Небезопасные имена (.., абсолютные пути, \) — архив отклоняется.
import fs from 'node:fs'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { Readable, Writable, pipeline } from 'node:stream'
import { pipeline as pipelineP } from 'node:stream/promises'

export const ZIP_LIMIT = 0xffffffff // без Zip64
const MAX_CENTRAL = 32 * 1024 ** 2

export class ZipError extends Error {}
const bad = (text = 'Архив повреждён или обрезан') => new ZipError(text)

// ---------- CRC-32 ----------
const TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  TABLE[n] = c >>> 0
}
/** CRC-32 куска данных; prev — результат для предыдущих кусков. */
export function crc32(buf, prev = 0) {
  let c = (prev ^ 0xffffffff) >>> 0
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = (Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

// ---------- запись ----------
export class ZipWriter {
  /** out — любой Writable (ответ HTTP, файл). */
  constructor(out) {
    this.out = out
    this.pos = 0
    this.entries = []
  }

  async _write(buf) {
    const out = this.out
    if (out.destroyed) throw new Error('Соединение закрыто')
    this.pos += buf.length
    if (this.pos > ZIP_LIMIT) throw new Error('Архив больше 4 ГБ')
    if (out.write(buf)) return
    await new Promise((resolve, reject) => {
      const off = () => {
        out.off('drain', ok)
        out.off('close', fail)
        out.off('error', fail)
      }
      const ok = () => (off(), resolve())
      const fail = () => (off(), reject(new Error('Соединение закрыто')))
      out.on('drain', ok)
      out.on('close', fail)
      out.on('error', fail)
    })
  }

  /** source — любой (async) итерируемый набор Buffer: поток файла, массив. */
  async addStream(name, source, mtime = new Date()) {
    const nameBuf = Buffer.from(name, 'utf8')
    const offset = this.pos
    if (this.entries.length >= 0xfffe) throw new Error('Слишком много файлов для архива')
    const { time, date } = dosTime(mtime)
    const h = Buffer.alloc(30)
    h.writeUInt32LE(0x04034b50, 0)
    h.writeUInt16LE(20, 4)
    h.writeUInt16LE(0x0808, 6) // бит 3 — размер после данных, бит 11 — имена в UTF-8
    h.writeUInt16LE(0, 8) // без сжатия
    h.writeUInt16LE(time, 10)
    h.writeUInt16LE(date, 12)
    h.writeUInt16LE(nameBuf.length, 26)
    await this._write(Buffer.concat([h, nameBuf]))

    let crc = 0
    let size = 0
    for await (const chunk of source) {
      crc = crc32(chunk, crc)
      size += chunk.length
      await this._write(chunk)
    }
    const d = Buffer.alloc(16)
    d.writeUInt32LE(0x08074b50, 0)
    d.writeUInt32LE(crc, 4)
    d.writeUInt32LE(size, 8)
    d.writeUInt32LE(size, 12)
    await this._write(d)
    this.entries.push({ nameBuf, crc, size, offset, time, date })
  }

  addBuffer(name, buf, mtime) {
    return this.addStream(name, [Buffer.from(buf)], mtime)
  }

  addFile(name, file, mtime) {
    return this.addStream(name, fs.createReadStream(file), mtime)
  }

  /** Центральный каталог и конец архива; закрывает поток. */
  async finish() {
    const start = this.pos
    for (const e of this.entries) {
      const c = Buffer.alloc(46)
      c.writeUInt32LE(0x02014b50, 0)
      c.writeUInt16LE(20, 4)
      c.writeUInt16LE(20, 6)
      c.writeUInt16LE(0x0808, 8)
      c.writeUInt16LE(0, 10)
      c.writeUInt16LE(e.time, 12)
      c.writeUInt16LE(e.date, 14)
      c.writeUInt32LE(e.crc, 16)
      c.writeUInt32LE(e.size, 20)
      c.writeUInt32LE(e.size, 24)
      c.writeUInt16LE(e.nameBuf.length, 28)
      c.writeUInt32LE(e.offset, 42)
      await this._write(Buffer.concat([c, e.nameBuf]))
    }
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(this.entries.length, 8)
    end.writeUInt16LE(this.entries.length, 10)
    end.writeUInt32LE(this.pos - start, 12)
    end.writeUInt32LE(start, 16)
    await this._write(end)
    await new Promise((resolve, reject) => this.out.end((e) => (e ? reject(e) : resolve())))
  }
}

// ---------- чтение ----------
function safeName(name) {
  if (!name || name.includes('\\') || name.includes('\0') || name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return false
  return !name.split('/').includes('..')
}

/** Открывает zip: { entries: Map имя → { size, csize, method, crc, offset }, read, extract, close }. */
export async function openZip(file) {
  const fh = await fs.promises.open(file, 'r')
  try {
    const total = (await fh.stat()).size
    if (total < 22) throw bad()
    const tailLen = Math.min(total, 22 + 0xffff)
    const tail = Buffer.alloc(tailLen)
    await fh.read(tail, 0, tailLen, total - tailLen)
    const at = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
    if (at < 0 || at + 22 > tail.length) throw bad()
    const count = tail.readUInt16LE(at + 10)
    const cdSize = tail.readUInt32LE(at + 12)
    const cdOffset = tail.readUInt32LE(at + 16)
    if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw bad('Архивы Zip64 не поддерживаются')
    if (cdSize > MAX_CENTRAL || cdOffset + cdSize > total) throw bad()
    const cd = Buffer.alloc(cdSize)
    if (cdSize) await fh.read(cd, 0, cdSize, cdOffset)

    const entries = new Map()
    let p = 0
    for (let i = 0; i < count; i++) {
      if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50) throw bad()
      const flags = cd.readUInt16LE(p + 8)
      const nameLen = cd.readUInt16LE(p + 28)
      const extraLen = cd.readUInt16LE(p + 30)
      const commentLen = cd.readUInt16LE(p + 32)
      const e = {
        flags,
        method: cd.readUInt16LE(p + 10),
        crc: cd.readUInt32LE(p + 16),
        csize: cd.readUInt32LE(p + 20),
        size: cd.readUInt32LE(p + 24),
        offset: cd.readUInt32LE(p + 42),
      }
      if (p + 46 + nameLen > cd.length) throw bad()
      const name = cd.toString('utf8', p + 46, p + 46 + nameLen)
      p += 46 + nameLen + extraLen + commentLen
      if (e.csize === 0xffffffff || e.size === 0xffffffff) throw bad('Архивы Zip64 не поддерживаются')
      if (!safeName(name)) throw bad('В архиве небезопасное имя файла')
      if (name.endsWith('/')) continue // папка
      if (entries.has(name)) throw bad('В архиве повторяются имена файлов')
      entries.set(name, e)
    }
    await fh.close()

    /** Содержимое записи кусками; в конце проверяет размер и CRC. hash — необязательный crypto.Hash, он тоже получает данные. */
    async function* content(name, max, hash) {
      const e = entries.get(name)
      if (!e) throw bad('В архиве нет файла ' + name)
      if (e.flags & 1) throw bad('Архив зашифрован')
      if (e.method !== 0 && e.method !== 8) throw bad('Способ сжатия в архиве не поддерживается')
      if (e.size > max) throw bad('Файл в архиве слишком большой')
      const h = await fs.promises.open(file, 'r')
      let start
      try {
        const lh = Buffer.alloc(30)
        await h.read(lh, 0, 30, e.offset)
        if (lh.readUInt32LE(0) !== 0x04034b50) throw bad()
        start = e.offset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28)
      } finally {
        await h.close()
      }
      if (start + e.csize > total) throw bad()
      let src = e.csize ? fs.createReadStream(file, { start, end: start + e.csize - 1 }) : Readable.from([])
      if (e.method === 8) {
        const inf = zlib.createInflateRaw()
        pipeline(src, inf, () => {})
        src = inf
      }
      let crc = 0
      let size = 0
      try {
        for await (const chunk of src) {
          size += chunk.length
          if (size > e.size) throw bad() // размер больше заявленного — не распаковываем дальше
          crc = crc32(chunk, crc)
          hash?.update(chunk)
          yield chunk
        }
      } catch (err) {
        src.destroy()
        throw err instanceof ZipError ? err : bad()
      }
      if (size !== e.size || crc !== e.crc) throw bad()
    }

    return {
      entries,
      /** Файл целиком в память (json) — не больше max байт. */
      async read(name, max = 20 * 1024 ** 2) {
        const parts = []
        for await (const c of content(name, max)) parts.push(c)
        return Buffer.concat(parts)
      },
      /** Файл на диск через dest.part → rename; возвращает { size, sha1 }. */
      async extract(name, dest, { max = ZIP_LIMIT } = {}) {
        const part = dest + '.part'
        const hash = crypto.createHash('sha1')
        try {
          await pipelineP(Readable.from(content(name, max, hash)), fs.createWriteStream(part))
          fs.renameSync(part, dest)
        } catch (e) {
          fs.rmSync(part, { force: true })
          throw e
        }
        return { size: entries.get(name).size, sha1: hash.digest('hex') }
      },
    }
  } catch (e) {
    await fh.close().catch(() => {})
    throw e instanceof ZipError ? e : bad()
  }
}
