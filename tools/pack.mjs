// Пакет для установки на школьный ПК: release/tablo-<версия>/ и release/tablo-<версия>.zip.
// В пакет попадает только то, что нужно для работы: собранный сайт (dist/), сервер, bat-файлы, скрипты киоска
// и стартовые данные. node_modules и исходники не нужны — на ПК достаточно Node.js (start.bat поставит его сам).
//   node tools/pack.mjs           — с данными: расписание, колоды, плейлист без фото/видео, пустая медиатека
//   node tools/pack.mjs --update  — без папки data/: для обновления уже работающего табло (данные школы не трогаем)
// Перед упаковкой нужен свежий dist/ (pack.bat сам запускает сборку).
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const update = process.argv.includes('--update')
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const name = `tablo-${version}${update ? '-update' : ''}`
const OUT = path.join(ROOT, 'release', name)
const ZIP = OUT + '.zip'

// что копируем как есть
const FILES = [
  'server.js',
  'api.js',
  'package.json',
  'README.md',
  'start.bat',
  'kiosk.bat',
  'kiosk-stop.bat',
  'autostart-install.bat',
  'autostart-remove.bat',
  'tools/kiosk.ps1',
  'tools/autostart.ps1',
  'src/deckText.js', // его импортирует server/decks.js
  'src/catalog.js', // его импортируют server/playlist.js и server/decks.js
  'src/dataDiff.js', // его импортирует server/journal.js
]
const DIRS = ['server', 'dist']
// kiosk-settings.txt — настройки конкретного ПК: при обновлении не затираем
if (!update) FILES.push('kiosk-settings.txt')

if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  console.error('Нет dist/ — сначала соберите сайт (build.bat).')
  process.exit(1)
}

fs.rmSync(OUT, { recursive: true, force: true })
fs.rmSync(ZIP, { force: true })
fs.mkdirSync(OUT, { recursive: true })
for (const f of FILES) {
  fs.mkdirSync(path.dirname(path.join(OUT, f)), { recursive: true })
  fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f))
}
// своё копирование: fs.cpSync в Node 22/24 на Windows падает на путях с кириллицей («Самат Булатович»)
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const a = path.join(src, e.name)
    const b = path.join(dst, e.name)
    if (e.isDirectory()) copyDir(a, b)
    else fs.copyFileSync(a, b)
  }
}
for (const d of DIRS) copyDir(path.join(ROOT, d), path.join(OUT, d))

// ---------- стартовые данные ----------
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'))
const writeJson = (f, d) => fs.writeFileSync(path.join(OUT, 'data', f), JSON.stringify(d, null, 2), 'utf8')
let summary = []
if (!update) {
  fs.mkdirSync(path.join(OUT, 'data'), { recursive: true })
  const now = Date.now()

  // расписание — как есть
  const schedule = readJson('schedule.json')
  schedule.updatedAt = now
  writeJson('schedule.json', schedule)

  // медиатека пустая: фото и видео не переносим
  writeJson('media.json', { version: 1, items: [] })

  // колоды — текущие (сейчас это стартовый набор), без картинок из медиатеки
  let decks
  try {
    decks = readJson('decks.json')
  } catch {
    const { readDecks } = await import('../server/decks.js')
    decks = readDecks()
  }
  for (const d of decks.decks) for (const c of d.cards) delete c.media
  decks.updatedAt = now
  writeJson('decks.json', decks)

  // плейлист: расписание, изменения, новости (без фото) и все колоды; слайды с фото/видео не переносим
  let old = { layout: 'panel', blank: { on: false, periods: [] }, items: [] }
  try {
    old = readJson('playlist.json')
  } catch {
    /* плейлиста нет — соберём с нуля */
  }
  const id = (s) => 'pack' + s
  const items = [
    { id: id('schedule'), type: 'schedule', on: true, duration: 15, grades: [] },
    { id: id('changes'), type: 'changes', on: true, duration: 20, skipEmpty: true },
  ]
  for (const it of old.items || []) {
    if (it.type !== 'news' || !it.on) continue
    const n = { ...it }
    delete n.media
    items.push(n)
  }
  for (const d of decks.decks) {
    items.push({ id: id(d.id).slice(0, 32), type: 'deck', on: true, deck: d.id, mode: d.id === 'starterword' ? 'daily' : 'next' })
  }
  writeJson('playlist.json', {
    version: 1,
    updatedAt: now,
    layout: old.layout === 'full' ? 'full' : 'panel',
    blank: old.blank || { on: false, periods: [] },
    items,
  })
  summary = [
    `  расписание: ${Object.keys(schedule.schedule || {}).length} параллелей`,
    `  колоды: ${decks.decks.map((d) => `${d.name} (${d.cards.length})`).join(', ')}`,
    `  плейлист: ${items.map((i) => i.type).join(', ')}`,
  ]
}

// ---------- инструкция ----------
const INSTALL = update
  ? `ОБНОВЛЕНИЕ ТАБЛО до версии ${version}
==========================================

В этом архиве нет папки data — данные школы (расписание, плейлист, колоды, медиатека) останутся как есть.

1. Остановите сервер:
   - если включён автозапуск — запустите autostart-remove.bat;
   - иначе закройте окно start.bat.
2. Скопируйте ВСЁ содержимое архива в папку табло с заменой файлов.
   Папки data и media и файл kiosk-settings.txt не трогайте.
3. Запустите сервер снова: autostart-install.bat (если был автозапуск) или start.bat.
   Экраны перезагрузятся сами и покажут новую версию.
`
  : `УСТАНОВКА ТАБЛО (версия ${version})
=================================

1. Распакуйте архив в постоянную папку, например C:\\Tablo
   (не на Рабочий стол и не во «Временные файлы»).

2. Запустите start.bat.
   - Если Node.js не установлен, start.bat поставит его сам (нужен интернет) —
     после установки закройте окно и запустите start.bat ещё раз.
   - Windows спросит разрешение для Node.js в брандмауэре — разрешите для частных сетей,
     иначе редактор не откроется с других компьютеров.
   - В окне появятся адреса: экран http://localhost:8080, редактор http://localhost:8080/admin

3. Проверьте в браузере: откройте http://localhost:8080/admin — там расписание, колоды
   и плейлист. Фото и видео загрузите заново в разделе «Медиатека».

4. Табло на телевизоре (киоск-режим):
   - откройте kiosk-settings.txt Блокнотом: x = 1920 — телевизор справа от монитора,
     x = -1280 — слева;
   - закройте окно start.bat и запустите kiosk.bat — проверьте, что табло на телевизоре.

5. Автозапуск: запустите autostart-install.bat (попросит права администратора).
   Сервер будет запускаться при включении компьютера, табло — при входе в Windows.
   Окно start.bat после этого больше не нужно.

6. В редакторе: «Медиатека» → «Резервная копия» — укажите папку на другом диске или флешке
   и частоту копий.

Подробности — в README.md.
`
fs.writeFileSync(path.join(OUT, update ? 'ОБНОВЛЕНИЕ.txt' : 'УСТАНОВКА.txt'), '\ufeff' + INSTALL.replace(/\n/g, '\r\n'), 'utf8')

// ---------- архив ----------
// .NET ZipFile помечает русские имена как UTF-8 — Проводник распакует их правильно (tar.exe этого не делает).
// Пути передаём через переменные окружения, чтобы не возиться с кавычками и кириллицей в командной строке.
if (process.platform === 'win32') {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      // записи добавляем сами: CreateFromDirectory в старом .NET пишет пути через обратный слеш, а не «/»
      'Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem; ' +
        '$base = Split-Path $env:PACK_SRC -Parent; ' +
        "$zip = [IO.Compression.ZipFile]::Open($env:PACK_ZIP, 'Create'); " +
        'Get-ChildItem $env:PACK_SRC -Recurse -File | ForEach-Object { ' +
        "$rel = $_.FullName.Substring($base.Length + 1).Replace([string][char]92, '/'); " +
        "[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, 'Optimal') | Out-Null }; " +
        '$zip.Dispose()',
    ],
    { stdio: 'inherit', env: { ...process.env, PACK_SRC: OUT, PACK_ZIP: ZIP } },
  )
} else {
  execFileSync('zip', ['-qr', ZIP, name], { cwd: path.dirname(OUT), stdio: 'inherit' })
}

const size = fs.statSync(ZIP).size
console.log(`\nГотово: ${path.relative(ROOT, ZIP)} (${(size / 1e6).toFixed(1)} МБ)`)
console.log(update ? '  без data/ — для обновления' : summary.join('\n'))
