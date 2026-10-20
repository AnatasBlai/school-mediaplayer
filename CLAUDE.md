# Школьное табло: расписание и медиаплеер

Сайт-табло МБОУ Башкирский лицей №1 (Учалы). Стационарный ПК раздаёт сайт; браузер в киоск-режиме показывает `/`
на телевизорах (HDMI), редактор `/admin` открывают с любого компьютера школьной сети.
Владелец — учитель информатики. **Общаемся по-русски, комментарии в коде и сообщения коммитов — по-русски.**
Этот файл — правила для исполнителя. Держи его **не длиннее 400 строк**: дописывая, сжимай старое. История — `docs/history.md`.

## Главные правила

1. Делай ровно то, что просят в задаче. Не переделывай соседний код «заодно», не меняй оформление без просьбы.
2. **Рабочие данные школы** (`data/`, `media/`) не перезаписывать, не «чистить», не удалять. Тесты — на копии (см. «Проверка»).
3. Каждая правка заканчивается полным циклом из раздела «Порядок работы» — без пропусков.
4. Если в задаче что-то неясно или противоречит этому файлу — спроси владельца, а не угадывай.
5. Новое поле данных → сразу в три места: клиент (создание/нормализация), **сервер (`clean…` в server/*.js — иначе
   сервер молча выбросит поле)**, раздел «Данные» этого файла.
6. **Все записи — только после входа**: новый POST/PUT/PATCH/DELETE в API автоматически закрыт паролем (`isAllowed` в
   server/auth.js); открытым без входа делай только если это отчёт/действие экрана — и впиши исключение туда.
7. Экран (`/`) не должен грузить код редактора: всё админское — только через динамический import (`src/main.js`).

## Стек и запуск

- Vue 3 (`<script setup>`, Composition API) + Vite 6. Без TypeScript, роутера, Pinia. Сервер — Node без зависимостей.
- Шрифт Montserrat 600/800/900 локально (`@fontsource`). Интернет табло не нужен.
- Windows, bat-файлы (UTF-8, `chcp 65001`; CRLF ставит git по .gitattributes):
  - `start.bat` → `node server.js` — боевой сервер, порт **8080**: `/` экран, `/admin` редактор;
  - `dev.bat` → Vite, порт 5173; `build.bat` → `npm run build` (**после правок кода пересобрать `dist/`**);
  - `pack.bat` → сборка + `tools/pack.mjs`: `release/tablo-<версия>.zip` (установка: dist, server, bat, ps1, данные без
    фото/видео) и `…-update.zip` (обновление: без `data/` и `kiosk-settings.txt`). Архив — .NET ZipFile через PowerShell;
  - `kiosk.bat` / `kiosk-stop.bat` (tools/kiosk.ps1, настройки `kiosk-settings.txt`) — Яндекс.Браузер в киоск-режиме;
  - `autostart-install.bat` / `autostart-remove.bat` (tools/autostart.ps1) — задания планировщика «Tablo - server»
    (SYSTEM, при включении ПК) и «Tablo - kiosk» (при входе пользователя).
- Git: ветка `main`, копия — приватный GitLab `origin` https://git.a2-dev.ru/Samat/school-mediaplayer (CI/runner
  не включать: runner на чужом хостинге). Не в git: `node_modules/ dist/ data/ media/ release/ *.zip`.

## Порядок работы (каждая правка)

1. Прочитай задачу и нужные файлы. Найди все места, где используется то, что меняешь (grep), — включая сервер.
2. Сделай правку. Стиль — как в соседнем коде: те же имена, плотность комментариев, русские комментарии.
3. `npm run build` — без ошибок; `npm test` — все тесты зелёные (упал — разберись, не подгоняй тест).
4. Проверка в браузере (Playwright) на **изолированной копии сервера**: скриншоты экрана и редактора, журнал ошибок
   консоли (404 на `/background.jpg` — норма). Посмотри скриншоты сам, а не только счётчики.
5. Обнови этот файл (карта файлов, данные, подводные камни — кратко) и `README.md`, если поменялось для пользователя.
6. Перезапусти боевой сервер 8080: `Get-NetTCPConnection -LocalPort 8080 -State Listen` → `Stop-Process`,
   затем `node server.js` в фоне. Экраны перезагрузятся сами (сменился `boot` в SSE `hello`).
7. Версия: поднять в `package.json`, коммит по-русски («Табло: мигающее двоеточие в часах (v0.8.3)»), тег.
   Коммитить и ставить теги владелец разрешил. **Версия**: `v0.<этап>.<правка>`; этап — по задаче (папка
   `docs/prompts/09-…` → 9, файлы в корне `docs/prompts/` → 8, задача без файла — этап последнего тега), правка —
   последний тег этого этапа + 1 (`git tag --sort=-v:refname`), первая задача этапа — `.0`.
   Затем `git push && git push origin --tags` — копия в GitLab (вход запомнен в Windows; ошибка → сказать владельцу).
8. Коротко отчитайся владельцу: что сделано, как проверено, что осталось непроверенным.

## Проверка в браузере

- **Сначала `npm run smoke`** (`-- --data` — на копии рабочих данных, `-- --out <папка>` — куда класть скриншоты): сама
  поднимает копию сервера, обходит экран (1920×1080, 1280×720) и 4 раздела редактора, падает на ошибках консоли.
  Проверки, которые пишут данные, — вручную на копии сервера, как ниже.
- Playwright в devDependencies, Chromium установлен. Скриншот: `node tools/screenshot.mjs admin#media out.png`
  (путь без начального «/», `""` — экран; 3–5 аргументы: ширина, высота, адрес сервера).
- Одноразовые скрипты и скриншоты — в scratchpad, не в проект. Скрипт вне проекта подключает playwright так:
  `createRequire('<путь проекта>/package.json')('playwright')`.
- **Изолированная копия сервера** (обязательно для всего, что пишет данные): скопировать в scratchpad `api.js server.js
  package.json server/ dist/ data/ src/deckText.js src/catalog.js` и картинки из `media/` (без видео), запустить там
  `PORT=8090 node server.js`. Так тест не трогает рабочие данные и не виден живым экранам школы.
  Или подменять ответы API в браузере: `page.route('**/api/playlist', r => r.fulfill({ json }))`.
  POST `/api/screens` в тестах тоже подменяй — иначе тестовый «экран» появится в «Сейчас на экране».
- Экран удобно проверять опросом раз в 250 мс `.slide.active` — получается журнал смены слайдов.
- Проверяй и «неудобные» случаи: выходной/день без уроков, пустые изменения, длинный текст, экран 1280×720
  (телевизоры школы), шаблон «с панелью справа».

## Подводные камни (уже наступали)

- Chromium из Playwright **не играет MP4/H.264**. Видео для тестов — WebM (canvas + MediaRecorder в браузере).
- `page.keyboard.type('кириллица')` не шлёт keydown — редактор ячеек его не видит. Печатать латиницей, `fill()` работает.
- **`fs.cpSync` в Node 22/24 на Windows молча падает** (0xC0000409) на путях с кириллицей — а путь проекта
  `C:\Users\Самат Булатович\…`. Копировать папки своей рекурсией (`readdirSync` + `copyFileSync`), как в tools/pack.mjs.
- `tar.exe` пишет zip без флага UTF-8 — русские имена файлов ломаются. Zip делать .NET ZipFile (см. tools/pack.mjs).
- `.ps1` хранить в **UTF-8 с BOM** (Windows PowerShell 5.1 иначе ломает кириллицу). Python на Windows пишет CRLF —
  после правок скриптом проверь окончания строк (в репозитории LF, кроме .bat).
- **Не запускать** на ПК разработки `kiosk.bat` (развернёт браузер на второй монитор) и `autostart-install.bat`
  (создаст задания планировщика). Проверять: `tools\kiosk.ps1 -DryRun`, `tools\autostart.ps1 -DryRun`, разбор
  `[System.Management.Automation.Language.Parser]::ParseFile`.
- Списки допустимых тем, типов слайдов, шаблонов, анимаций и параллелей — **в `src/catalog.js`** (его импортирует и сервер).
  Добавил ключ — добавь в catalog.js и в `src/themes.js`/`NEWS_ANIMS`/`SLIDE_TITLES` (расхождение ловит `npm test`).
- `ScheduleBoard` рисует фоны **всех** тем из `THEMES` стопкой. Не добавляй туда темы, не нужные табло, — слабый ПК.

## Архитектура

```
server.js          раздаёт dist/ + API + /media/*; пути без расширения (/, /admin) → index.html; запускает расписание копий
api.js             роутер API (общий для server.js и Vite-плагина) + GET/PUT /api/data → data/schedule.json (атомарно .tmp)
server/
  events.js        SSE /api/events: hello { boot }; broadcast(data|media|playlist|decks|screens|backup); ping 25 с
  playlist.js      GET/PUT /api/playlist; cleanItem/cleanWhen/cleanBlank/cleanLayout;
                   removeMediaFromPlaylist(id) (фото/видео-слайд удаляется, у новости и победителей пропадает только фото)
  decks.js         GET/PUT /api/decks (нет файла → STARTER_DECKS из starterDecks.js), POST /api/decks/<id>/take → { n }
                   (общий счётчик, data/deck-state.json); cleanDeck/cleanCard; removeMediaFromDecks(id)
  media.js         медиатека: GET/POST /api/media (сырое тело потоком → .part → rename), PATCH/DELETE, /thumb, Range
  backup.js        резервные копии: GET/PUT /api/backup, /drives, /check, /run, /restore { name, files? } (частичный возврат; зеркало media/ копируется, только если среди files media.json),
                   GET /snapshot/<имя>/<файл>.json и /mirror (после входа — правило в auth.js `isAllowed`; имя и файл по regex, иначе 400); расписание раз в 10 мин
  auth.js          пароль на редактор: isAllowed(req) (api.js вызывает до всех обработчиков; без входа запись → 401, GET открыт;
                   исключения: POST /api/screens, POST /api/decks/<id>/take), /api/auth*, scrypt + сессии 30 дней (cookie tablo_session)
  status.js        GET /api/status — версия, время работы, диск (diskSpace из backup.js), объём data/media, backupSummary(), пароль; без секретов
  screens.js       POST/GET /api/screens — что показывают экраны (в памяти)
src/
  main.js          /admin → admin/AdminApp.vue, иначе DisplayApp.vue (динамический import); startSync()
  store.js         расписание: reactive state, debounce 300 мс → PUT, SSE; onServerEvent(type, fn) → отписка;
                   getLessons/setLessonField, getChanges/setChangeField, changesActive(now) / hasChanges(now) (учитывают
                   changesDate; экран читает изменения только через них), clearChanges (сбрасывает и дату), maxLessonOfDay, isBreak(now) (kind 'break' у bellStatus); saveStatus, connected
  merge.js         merge3(base, mine, theirs) → { merged, conflicts }, describeConflicts — без Vue; saver.js — сохранение с базой и 409 (syncNotice)
  playlist.js      стор плейлиста (как store.js) + медиатека (media, mediaById, mediaUrl, thumbUrl); makeSlide,
                   slideTitle, SLIDE_TITLES, LAYOUT_TITLES, hasLayout, layoutOf, usesOfMedia; startPlaylist()
  decks.js         стор колод; makeDeck/makeCard, cardSeconds, avgCardSeconds, dayNumber, takeCard; startDecks()
  scheduleImport.js разбор таблицы из Excel (parseScheduleTable, без Vue); окно — admin/ScheduleImport.vue (кнопка в шапке AdminApp)
  winners.js       победители без Vue: parseLine «8А ФИО», podiumOf, winnerScreens(item, cols) — экраны (≤5 под
                   пьедесталом, остальное — «продолжение» поровну по cols×11), listCols; в playlist.js winnerScreensOf(it)
  catalog.js       ключи тем, типов слайдов, шаблонов, анимаций, параллелей (клиент и сервер, без Vue)
  dataDiff.js      diffSchedule/diffPlaylist/diffDecks/diffMedia(a=текущее, b=снимок) → строки по-человечески, limitLines (≤30); без Vue — для окна admin/RestorePreview.vue (возврат из копии) и будущего журнала правок
  deckText.js      формат «вставить списком» (parseCards/cardsToText) — общий с сервером, без Vue
  rules.js         ruleState(when, now, isBreak) (when.breaks → isBreak из store.js), rulesText, hasRules, isBlanked(blank, now), DAY_SHORT — чистые функции
  themes.js        THEMES (5…11, changes — для табло) и EXTRA_THEMES (sea, sunset, mint, graphite, lavender, royal — только новости
                   и колоды); ALL_THEMES = оба; поля: bg-градиенты, base, accent, shadow, outline, tabText; themeBackground(t)
  bells.js         звонки: parseBells, bellsForDay, bellStatus (kind: none|before|lesson|break|after), fmt, plural
  fit.js           директива v-fit="мин.размер": уменьшает шрифт, пока текст не влезет в ширину
  defaultData.js   данные по умолчанию; ui.js — выделение ячейки в редакторе
  display/         ЭКРАН
    Player.vue     движок: плейлист по кругу; слоты active / leaving (~1 с под новым) / next (невидим, грузится);
                   schedule+changes — одно табло (ключ 'board'); неподходящие слайды пропускаются; нет ни одного —
                   FALLBACK (расписание). Гашение экрана (blank). Ticker.vue — бегущая строка поверх (z 4, под гашением) Отчёт POST /api/screens (slide.urgent). Срочный режим (`urgentItem`): `following()` всегда отдаёт этот слайд без on/«Когда», `blanked` не действует, смена режима → `advance()`. now — раз в 10 с
    MediaSlide.vue фото/видео (fit cover|contain, звук, layout full|panel)
    CountdownSlide.vue  обратный отсчёт (число + слово через plural; < суток — «Уже сегодня!» / «Осталось 5 ч 20 мин»); состояние — countdownState в rules.js
    NewsSlide.vue  новость на SlideStage: фото слева + стеклянная панель; размер шрифта по длине текста
    WinnersSlide.vue победители: рамка/фото/анимации скопированы из NewsSlide (её не трогали); экраны групп по очереди,
                   пьедестал 2–1–3, список призёров (шрифт 48→30 по замеру, под пьедесталом ≤ 36); превью — проп group
    DeckSlide.vue  логика колоды (выбор карточки, фазы вопрос→ответ); DeckCard.vue — отрисовка карточки
    InfoPanel.vue  панель справа (шаблон 'panel'): день, дата, часы, звонок, изменения; inStage — внутри SlideStage
  admin/           РЕДАКТОР (ui.css — общие классы a-btn, a-input, a-seg, a-modal, a-switch, a-chips, a-link, a-check…)
    auth.js + AuthModals.vue  вход: window.fetch оборачивается (при 401 окно входа и повтор запроса), needLogin() для XHR
                   (mediaApi.uploadMedia); кнопки «🔒 Пароль» / «Выйти» в шапке AdminApp
    AdminApp.vue   разделы schedule | playlist | decks | media (раздел в hash), статус сохранения
    PlaylistEditor.vue  две колонки 30/70: слева AddSlideMenu.vue (меню «＋ Добавить слайд»), сводка «Настройки экрана»
                   (→ ScreenSettings.vue: окно-вкладки шаблон / гашение / бегущая строка), NowOnScreen; справа итог и
                   компактные строки (сводка, вкл, ⚙ ⚠ ✕). ⚙ → SlideSettings.vue: время, вид, шаблон, «Когда», копия,
                   удаление (окно держит id слайда, не объект). < 1100 px — колонки стопкой
    NewsEditor.vue окно новости с живым превью; WinnersEditor.vue — окно победителей (вкладки классов); CountdownEditor.vue — окно отсчёта; DeckEditor.vue — раздел «Колоды»
    MediaLibrary.vue медиатека (+ «Не используются», кнопка «Резервная копия» → BackupPanel.vue)
    SystemStatus.vue + systemStatus.js — окно «Состояние» (кнопка с цветной точкой в шапке, пересчёт раз в 5 мин): строки-проверки и уровень ok/warn/bad
    NowOnScreen.vue + screens.js — «Сейчас на экране» («Убрать из списка» у экрана без связи), silentList → жёлтая плашка в шапке AdminApp (логика — src/screenAlerts.js: >5 мин без связи, учебное время `inSchoolHours` из bells.js, был на связи сегодня/в прошлый учебный день); MediaPicker.vue, ThemeSwatches.vue; mediaApi.js
  components/
    ScheduleBoard.vue табло 1920×1080: вкладки 5…11 + «Изм.», колонки, звонки, клавиатура редактора. Пропсы editable,
                   tabs, seconds, run, playing; emit done/tab. dayKey: Вс → Пн; на экране день без уроков → ближайший
                   учебный; после последнего звонка (bell.kind 'after') — тоже следующий учебный день (shiftNote)
    SlideStage.vue сцена 1920×1080 с фоном темы для новостей и карточек; CalendarPanel.vue — день/часы/календарь; Clock.vue — «ЧЧ:ММ» с мигающим двоеточием
                   справа на табло; BellWidget.vue; EditColumn.vue — колонка строк; SettingsModal.vue (только редактор)
tests/             автотесты чистых функций и clean… сервера (`node:test`, `npm test`); в архивы pack.mjs не входят
tools/             pack.mjs, kiosk.ps1, autostart.ps1, screenshot.mjs, smoke.mjs (npm run smoke — обход экрана и редактора)
```

## Данные (`data/`) — рабочие данные школы

**schedule.json** — правится через сайт (PUT целиком):
```js
{ version: 1, updatedAt,                     // по updatedAt клиенты понимают, что данные новее
  settings: { lessonsCount /* строк, 9 */, changesDate /* 'ГГГГ-ММ-ДД' | '' — на какой день изменения; после него экран их не показывает */, letters: { "5": ["А","Б"…] … }, changesCols, bells: [{ name, days, text }] },
  schedule: { "<параллель>": { "<день 1..6>": { "<буква>": [ { s: предмет, r: кабинет } ] } } },
  changes:  { ch0: [ { c: класс, t: текст, r: кабинет } ], ch1, ch2 } }
```
День 1 = Пн … 6 = Сб; индекс урока = номер − 1; пустые места `{ s: "", r: "" }`, пустой хвост обрезается.
Буквы классов кириллические заглавные. Новые поля — в `createDefaultData()` (normalize подмешивает их к старым файлам).

**playlist.json** — PUT целиком из редактора; при удалении файла правит сервер:
```js
{ version: 1, updatedAt, layout: 'full'|'panel', urgent: { on, id } /* срочный режим: id слайда из items, нет такого — off; cleanUrgent */, blank: { on, periods: [{ timeFrom, timeTo, days }] },
  ticker: { on, speed: 'slow'|'normal', items: [{ text ≤200, until: 'ГГГГ-ММ-ДД'|'' }] },   // ≤10; cleanTicker; rules.js → tickerTexts
  items: [                                   // порядок = порядок показа
    { id, type: 'schedule', on, duration /* с на параллель */, grades: [] /* [] — все */ },
    { id, type: 'changes',  on, duration, skipEmpty },
    { id, type: 'image',    on, media, fit: 'cover'|'contain', duration },
    { id, type: 'video',    on, media, fit, sound },            // до конца
    { id, type: 'countdown', on, title ≤60, date: 'ГГГГ-ММ-ДД' /* обязательна, иначе сервер выбросит */, time: 'ЧЧ:ММ'|'', note ≤120, theme, duration },
    { id, type: 'news',     on, label, title, text, date, media?, fit, theme, anim /* none|zoom|drift|parallax|rise, нет → none */, duration },
    { id, type: 'deck',     on, deck, mode: 'next'|'daily' },   // длительность из колоды
    { id, type: 'winners',  on, label, title, date, media?, fit, theme, anim, duration /* с на экран */, groups: [ ≤20
      { name, places: [[{ name, cls }] ×1..3 /* 1, 2, 3 место */], others: 'строки «8А ФИО»' } ] },  // cleanGroup
  ] }
// у image/video/news/winners/countdown/deck — layout? (свой шаблон); у любого слайда — when? { dateFrom, dateTo, timeFrom, timeTo, days, breaks? /* true — только на переменах */ }
```
id слайда `[a-z0-9]{4,32}` (иначе сервер выдаст новый). Дни в `when`/`blank`: 1 = Пн … 7 = Вс. Время [from, to),
from > to — через полночь. Нет файла → плейлист по умолчанию (`updatedAt: 0`).

**decks.json** — колоды (PUT целиком); нет файла → стартовый набор, на диск при первой правке:
```js
{ version: 1, updatedAt, decks: [ { id, name, theme, factTime, qTime, aTime, cards: [
  { id, type: 'fact', title, text, media? } | { id, type: 'choice', text, options: [2..4], correct, explain, media? }
  | { id, type: 'open', text, answer, explain, media? } ] } ] }
```
**media.json** + папка `media/` — только через API медиатеки: `{ items: [{ id, file, type: 'image'|'video', name,
category, size, w, h, duration?, thumb, addedAt }] }`. **deck-state.json** — счётчики показов колод.
**auth.json** `{ salt, hash }` (нет файла — пароля нет) и **sessions.json** `{ токен: expiresAt }` — пароль и входы; не в снимках копий
(`isDataFile`) и не в архивах pack.mjs. **screens.json** `{ items: [{ id, name, ip, seen, w, h }] }` — запомненные экраны (там же не в снимках). **backup.json** — настройки копий `{ dir, period: off|day|week|month, lastAt, last }` (в снимки не попадает).

## Поведение, которое легко сломать

- **Экран и редактор**: на `/` ничего не редактируется (`ui.readonly`, `CalendarPanel interactive=false`, нет ⚙).
- **Редактор ячеек**: 1-й клик — выделение, 2-й клик / Enter / F2 / ввод — правка; Enter/✓ сохраняет, Esc отменяет,
  Del очищает, стрелки и Tab ходят. Клавиши — `onKey()` в ScheduleBoard. В редакторе вкладки сами не листаются.
- **Слоты Player**: ключ 'board' у табло, `<id>#<seq>` у остальных; DOM-порядок постоянный (по seq), иначе Vue
  переставит элементы и видео остановится. `done` принимается только от активного слота.
- **Звонки** — по часам ПК с экраном. Учитываются уроки ≤ `maxLessonOfDay(день)` плюс нулевой (Пн/Чт 8:00–8:25,
  строки в таблице у него нет). Подсветка урока — только когда показан именно сегодняшний день.
- **Сцена** фиксирована 1920×1080 и масштабируется целиком: размеры в px этого холста, не в vw/vh. Исключение —
  InfoPanel поверх фото/видео: ширина `calc(100vh * 440 / 1080)`.
- Подписи «5А» — обводка SVG-фильтром `#outline`, не `-webkit-text-stroke` (у Montserrat артефакты).
- Длинный текст в ячейках ужимает `v-fit`; текст изменений — максимум 2 строки.
- **Слабый ПК**: без тяжёлых `filter: blur` на больших слоях и бесконечных анимаций на многих элементах; анимировать
  только `transform` и `opacity`.
- **Синхронизация**: правка → PUT → SSE (`data`/`playlist`/`decks` с updatedAt) → клиенты со старым updatedAt делают GET.
  **Правки вдвоём**: `src/saver.js` (makeSaver, общий для store/playlist/decks) помнит базу — документ, который клиент
  последним получил или отправил; PUT идёт с `X-Base-Updated: <updatedAt базы>`. Сервер (`server/conflict.js`:
  `baseConflict`, `nextUpdated`; в api.js, playlist.js, decks.js) при более новом файле отвечает **409** `{ conflict, current }`
  и ничего не пишет; без заголовка пишет как раньше; `updatedAt` на сервере всегда растёт (+1 к файлу). Клиент на 409 делает
  `merge3(base, mine, theirs)` (src/merge.js) и повторяет (до 3 раз, потом ошибка в плашке); SSE/GET при несохранённых
  правках тоже идут через merge3 (`saver.receive`). Своя правка побеждает, место → `conflicts` → плашка `syncNotice` в AdminApp.
  Новое поле данных, которое хранится на клиенте иначе, чем на сервере, — учти в `normalize` стора.
  После обрыва EventSource переподключается сам и по `hello` догружает. Сменился `boot` → **экран** делает reload
  (так получает новую сборку). Восстанавливая данные «из прошлого», ставь свежий updatedAt — иначе клиенты не загрузят.
- **Тесты с паролем**: на копии сервера задать пароль (`PUT /api/auth/password {current:"",next:"…"}` с cookie-jar), в
  Playwright войти через окно или `POST /api/auth/login`. Лимит 5 неверных попыток/IP — в памяти, сброс перезапуском сервера.
- Видео со звуком без клика — только с флагом браузера `--autoplay-policy=no-user-gesture-required` (есть в kiosk.ps1).
- Резервные копии делает только `server.js` (не Vite). Сервер при автозапуске работает от SYSTEM.

## Оформление

Стеклянные панели (полупрозрачный белый, скругления 40–64 px, `border: 1px solid var(--glass-border)`), белый текст
с тенью `var(--shadow-text)`, акцент `var(--accent)` из темы. Заголовки и предметы — заглавными, Montserrat 800/900.
Темы табло: 5 янтарь, 6 голубой, 7 зелёный+жёлтый, 8 красный+чёрный, 9 киберпанк (сетка), 10 розовый,
11 фиолетовая «магия» (звёзды), changes — коричневый+зелёный. Ещё 6 тем только для новостей и колод (`EXTRA_THEMES`,
выбор — второй ряд «Ещё цвета» в ThemeSwatches): морская волна, закат, мята, графит, лаванда, королевская. Редактор — тёмный интерфейс (#1d1f24, кнопки #3b404a,
акцент #3d7be0). Подписи и сообщения для пользователя — простым русским языком, без технических терминов.

## План

Этапы 0–7 готовы (подробно — `docs/history.md`). Задачи — в `docs/prompts/` (одна на сессию; оглавление и порядок —
`docs/prompts/README.md`): этап 8 — файлы в корне (осталось 07, 15, 16, 17), этап 9 надёжность — `09-reliability/`,
10 удобство — `10-convenience/`, 11 содержимое — `11-content/`, 12 безопасность — `12-security/`. Сделанную задачу
отметь здесь: номер, версия, одна строка (для этапов 9–12 — заведи строку «Сделано в этапе N:»).

Сделано в этапе 8:
- v0.8.0 — CLAUDE.md переписан под исполнителя, задачи в docs/prompts/.
- v0.8.1 — длинный день недели в боковых панелях (InfoPanel, CalendarPanel) ужимается `v-fit="30"`.
- v0.8.2 — в блоке «Изменения» боковой панели убрана надпись «N строк».
- v0.8.3 — двоеточие в часах обеих боковых панелей мигает (общий Clock.vue, анимация opacity 1 с).
- v0.8.4 — у двоеточия в часах добавлен отступ по бокам (Clock.vue), цифры не прижаты.

- v0.8.5 — кнопка «⧉» копирует слайд под исходным (`cloneSlide` в src/playlist.js: JSON-копия, новый id, `on: true`); у новости сразу открывается NewsEditor.
- v0.8.6 — 6 новых тем для новостей и колод (`EXTRA_THEMES`/`ALL_THEMES`, server/themes.js); табло их не рисует.
- v0.8.7 — анимация новости `anim` (NewsSlide: класс `run` ставится при active и не снимается; `preview` — по кругу; `NEWS_ANIMS` дублируется в server/playlist.js).
- v0.8.8 — дата у изменений `settings.changesDate`: поле «Изменения на» + «сегодня/завтра» в редакторе, заголовок «ИЗМЕНЕНИЯ НА 14 ОКТЯБРЯ», после дня экран не показывает (плашка «Очистить» в редакторе). fit.js: замер ширины у flex-элементов с базой 0.

- v0.8.9 — предупреждение «текст не помещается»: проп `measure` + emit `overflow` у NewsSlide/DeckCard (только превью редактора; допуск 0,4 строки — у заголовка край букв выше строки), плашка `.a-warn` в NewsEditor/DeckEditor, ⚠ у карточки в списке (запоминается по просмотренным).

- v0.8.10 — бегущая строка `playlist.ticker` (display/Ticker.vue: два куска на -50%, скорость px/с от высоты экрана; полоса в PlaylistEditor). Табло перекрыто снизу на ~40 px — допустимо. v0.8.11: у каждого объявления в редакторе метка «показывается / уже не показывается», подсказка про «без даты» только если такие есть.

- v0.8.12 — слайд «Обратный отсчёт» (`countdown`): CountdownSlide/CountdownEditor, `countdownState` в rules.js; без времени идёт весь день события, потом пропускается в `playable()`, в редакторе метка «событие прошло».
- v0.8.13 — срочный режим `playlist.urgent`: кнопка ⚠ в строке слайда, красная плашка в «Плейлисте» и шапке, «Срочный режим» в «Сейчас на экране»; слайд удалён → режим сам выключается (клиент и `cleanUrgent` на сервере).
- v0.8.14 — редизайн «Плейлиста»: инструменты слева (меню добавления, окно «Настройки экрана»), очередь справа, все настройки слайда в окне ⚙; ↑↓ убраны.
- v0.8.15 — «Вставить из Excel» (src/scheduleImport.js + admin/ScheduleImport.vue): таблица одного дня → классы, предпросмотр, «Добавить букву», «Отменить» (копия в памяти окна; добавленные буквы остаются).
- v0.8.16 — пароль на редактор (server/auth.js, admin/auth.js + AuthModals.vue): записи без входа → 401, экран без пароля.
- v0.8.17 — «Когда» → «Звонки: только во время перемены» (`when.breaks`, `isBreak` в store.js по звонкам и maxLessonOfDay; до 1-го урока и после последнего — не перемена).

- v0.8.18 — слайд «Победители» (`winners`): как новость, но классы по очереди — пьедестал 1–2–3 (пустое место тусклое, до 3 человек на место) и призёры; лишние — экраны «продолжение».
- v0.8.19 — после последнего звонка экран показывает расписание на следующий учебный день с подписью «Уроки закончились — расписание на среду» (ScheduleBoard: `afterLessons`).
- v0.8.20 — надпись «Уроки закончились — расписание на СРЕДУ» — крупная плашка над колонками (`.after-note`, день цветом акцента): календарь справа всё ещё показывает сегодня.
- v0.8.21 — с плашкой «Уроки закончились» строки и подписи классов ужимаются (`sizes`: высота 560 вместо 610, подпись ≤ 92 px), подписи не вылезают из колонок.
- v0.8.22 — автотесты `tests/*.test.js` (bells, rules, scheduleImport, winners, deckText, cleanItem/cleanDeck — экспортированы); `npm test`.

- v0.8.23 — `npm run smoke` (tools/smoke.mjs): копия сервера во временной папке, обход экрана и редактора в Chromium, итоговая таблица, код выхода 0/1.

- v0.8.24 — общие списки ключей в `src/catalog.js` (server/themes.js удалён), тест `tests/catalog.test.js`; catalog.js в pack.mjs и smoke.mjs.

Сделано в этапе 9:
- v0.9.0 — окно «Состояние системы» (`/api/status`, server/status.js; SystemStatus.vue): диск, копии, экраны, часы, пароль, точка в шапке.
- v0.9.1 — экраны помнятся в `data/screens.json`, кнопка «Убрать из списка», жёлтая плашка «Экран не отвечает» в шапке редактора (только в учебное время), строка «Экраны» в «Состоянии» учитывает то же правило.
- v0.9.2 — «Посмотреть» у снимка копии: окно RestorePreview.vue с разницей по разделам и частичным возвратом (`restore { files }`), src/dataDiff.js, чтение снимков только после входа.
- v0.9.3 — правки вдвоём: заголовок `X-Base-Updated`, 409 с текущими данными, `merge3` на клиенте (src/merge.js, src/saver.js), плашка при совпавших местах; тесты tests/merge.test.js.

Этап 13 — квесты: отложены (телефоны учеников не достают до сервера), не начинать без владельца.
