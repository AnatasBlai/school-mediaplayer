import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import zlib from 'node:zlib'
import { crc32, ZipWriter, openZip } from '../server/zip.js'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tablo-zip-'))
const write = async (file, fn) => {
  const out = fs.createWriteStream(file)
  const zw = new ZipWriter(out)
  await fn(zw)
  await zw.finish()
}

test('crc32: «123456789» = cbf43926, по кускам совпадает', () => {
  assert.equal(crc32(Buffer.from('123456789')).toString(16), 'cbf43926')
  assert.equal(crc32(Buffer.from('6789'), crc32(Buffer.from('12345'))).toString(16), 'cbf43926')
})

test('запись → чтение: кириллица в имени, пустой файл, файл 5 МБ', async () => {
  const file = path.join(tmp, 'a.zip')
  const big = crypto.randomBytes(5 * 1024 ** 2)
  await write(file, async (zw) => {
    await zw.addBuffer('Привет мир.json', '{"a":"б"}')
    await zw.addBuffer('media/empty.jpg', Buffer.alloc(0))
    await zw.addBuffer('media/big.webm', big)
  })
  const zip = await openZip(file)
  assert.deepEqual([...zip.entries.keys()], ['Привет мир.json', 'media/empty.jpg', 'media/big.webm'])
  assert.equal((await zip.read('Привет мир.json')).toString(), '{"a":"б"}')
  assert.equal((await zip.read('media/empty.jpg')).length, 0)
  const dest = path.join(tmp, 'big.out')
  const r = await zip.extract('media/big.webm', dest)
  assert.equal(r.size, big.length)
  assert.equal(r.sha1, crypto.createHash('sha1').update(big).digest('hex'))
  assert.ok(fs.readFileSync(dest).equals(big))
  assert.equal(fs.existsSync(dest + '.part'), false)
})

test('чтение: сжатая запись (метод 8) из чужого архива', async () => {
  // собираем архив вручную: одна запись, deflate
  const data = Buffer.from('сжимаемый текст '.repeat(200))
  const comp = zlib.deflateRawSync(data)
  const name = Buffer.from('t.txt')
  const crc = crc32(data)
  const lh = Buffer.alloc(30)
  lh.writeUInt32LE(0x04034b50, 0)
  lh.writeUInt16LE(20, 4)
  lh.writeUInt16LE(8, 8)
  lh.writeUInt32LE(crc, 14)
  lh.writeUInt32LE(comp.length, 18)
  lh.writeUInt32LE(data.length, 22)
  lh.writeUInt16LE(name.length, 26)
  const cd = Buffer.alloc(46)
  cd.writeUInt32LE(0x02014b50, 0)
  cd.writeUInt16LE(20, 4)
  cd.writeUInt16LE(20, 6)
  cd.writeUInt16LE(8, 10)
  cd.writeUInt32LE(crc, 16)
  cd.writeUInt32LE(comp.length, 20)
  cd.writeUInt32LE(data.length, 24)
  cd.writeUInt16LE(name.length, 28)
  const local = Buffer.concat([lh, name, comp])
  const cdAll = Buffer.concat([cd, name])
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(cdAll.length, 12)
  end.writeUInt32LE(local.length, 16)
  const file = path.join(tmp, 'def.zip')
  fs.writeFileSync(file, Buffer.concat([local, cdAll, end]))
  const zip = await openZip(file)
  assert.ok((await zip.read('t.txt')).equals(data))
})

test('чтение: небезопасные имена отклоняются', async () => {
  for (const name of ['../evil.txt', 'media/../../x', '/abs.txt', 'C:/x.txt', 'a\\b.txt']) {
    const file = path.join(tmp, 'evil.zip')
    await write(file, (zw) => zw.addBuffer(name, 'x'))
    await assert.rejects(openZip(file), /небезопасное имя/, name)
  }
})

test('чтение: обрезанный и посторонний файл → понятная ошибка', async () => {
  const file = path.join(tmp, 'ok.zip')
  await write(file, (zw) => zw.addBuffer('a.txt', 'hello world'))
  const buf = fs.readFileSync(file)
  const cut = path.join(tmp, 'cut.zip')
  fs.writeFileSync(cut, buf.subarray(0, buf.length - 30))
  await assert.rejects(openZip(cut), /повреждён/)
  const junk = path.join(tmp, 'junk.zip')
  fs.writeFileSync(junk, 'просто текст, а не архив, просто текст, а не архив')
  await assert.rejects(openZip(junk), /повреждён/)
  fs.writeFileSync(path.join(tmp, 'tiny.zip'), 'x')
  await assert.rejects(openZip(path.join(tmp, 'tiny.zip')), /повреждён/)
})

test('чтение: испорченные данные → ошибка CRC, недописанного файла нет', async () => {
  const file = path.join(tmp, 'crc.zip')
  await write(file, (zw) => zw.addBuffer('a.bin', Buffer.alloc(100, 7)))
  const buf = fs.readFileSync(file)
  buf[30 + 5 + 10] ^= 0xff // байт внутри данных
  const bad = path.join(tmp, 'crc-bad.zip')
  fs.writeFileSync(bad, buf)
  const zip = await openZip(bad)
  const dest = path.join(tmp, 'crc.out')
  await assert.rejects(zip.extract('a.bin', dest), /повреждён/)
  assert.equal(fs.existsSync(dest), false)
  assert.equal(fs.existsSync(dest + '.part'), false)
})

test('cleanup', () => fs.rmSync(tmp, { recursive: true, force: true }))
