// Доступ к редактору только с компьютеров учителей (по адресу в сети). Экраны (/) не затрагиваются.
//   data/access.json { on, allow: [{ net: '192.168.1.25' | '192.168.1.0/24', note }] } ≤ 50; нет файла — ограничения нет
//   Сам сервер (127.0.0.1, ::1) разрешён всегда. IPv4 и подсети разбираем сами; IPv6 — только ::1.
// С неразрешённого адреса: страница /admin → простая страница (код редактора не грузится), записи в API и /api/auth* → 403.
// Открыты всем: чтение, SSE, POST /api/screens, POST /api/decks/<id>/take.
// API (только «Администратор» — правило в auth.js): GET /api/access → { on, allow, me }, PUT /api/access { on, allow }.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { logEvent } from './journal.js'

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'access.json')
const MAX_ITEMS = 50
export const DENIED = 'Доступ к редактору с этого компьютера закрыт'

/** Адрес из сокета: «::ffff:192.168.1.5» → «192.168.1.5». */
export const ipOf = (req) => String(req?.socket?.remoteAddress || '').replace(/^::ffff:/, '')
export const isLocalIp = (ip) => ip === '127.0.0.1' || ip === '::1'

const OCTET = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
const IP4 = new RegExp(`^${OCTET}\\.${OCTET}\\.${OCTET}\\.${OCTET}$`)
const toNum = (ip) => ip.split('.').reduce((n, o) => n * 256 + Number(o), 0)

/** '192.168.1.0/24' | '192.168.1.25' | '::1' → { base, mask } (IPv4) | { v6: '::1' } | null, если мусор. */
export function parseNet(text) {
  const s = String(text ?? '').trim()
  if (s === '::1') return { v6: s }
  const [addr, bits, extra] = s.split('/')
  if (extra !== undefined || !IP4.test(addr)) return null
  let n = 32
  if (bits !== undefined) {
    if (!/^\d{1,2}$/.test(bits) || Number(bits) > 32) return null
    n = Number(bits)
  }
  const mask = n === 0 ? 0 : (0xffffffff << (32 - n)) >>> 0
  return { base: (toNum(addr) & mask) >>> 0, mask }
}

/** Входит ли адрес в список адресов и подсетей (строк); мусор в списке пропускается. */
export function ipInList(ip, list) {
  const a = String(ip ?? '').replace(/^::ffff:/, '')
  const isV4 = IP4.test(a)
  if (!isV4 && a !== '::1') return false
  const n = isV4 ? toNum(a) : 0
  for (const item of Array.isArray(list) ? list : []) {
    const net = parseNet(item)
    if (!net) continue
    if (net.v6) {
      if (!isV4 && a === net.v6) return true
    } else if (isV4 && ((n & net.mask) >>> 0) === net.base) return true
  }
  return false
}

/** Приводит присланное к виду файла; ошибка — строкой. */
export function cleanAccess(b) {
  const allow = []
  for (const x of Array.isArray(b?.allow) ? b.allow : []) {
    const net = String(x?.net ?? '').trim()
    if (!net) continue
    if (!parseNet(net)) return { error: `Адрес «${net.slice(0, 40)}» записан неверно. Пример: 192.168.1.25 или 192.168.1.0/24` }
    allow.push({ net, note: String(x?.note ?? '').trim().slice(0, 60) })
  }
  if (allow.length > MAX_ITEMS) return { error: `Не больше ${MAX_ITEMS} адресов` }
  return { on: !!b?.on, allow }
}

export function readAccess() {
  try {
    const f = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    const c = cleanAccess(f)
    return c.error ? { on: false, allow: [] } : c
  } catch {
    return { on: false, allow: [] }
  }
}

/** С этого компьютера можно открывать редактор? */
export function editorAllowed(req) {
  const ip = ipOf(req)
  if (isLocalIp(ip)) return true
  const a = readAccess()
  return !a.on || ipInList(ip, a.allow.map((x) => x.net))
}

// записи, которые экраны шлют без входа
const SCREEN_WRITES = [/^\/api\/screens$/, /^\/api\/decks\/[^/]+\/take$/]
/** Закрыт ли этот запрос к API для компьютера (чтение открыто, кроме /api/auth*). */
export function apiBlocked(req) {
  const url = (req.url || '').split('?')[0]
  if (!url.startsWith('/api/')) return false
  const read = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS'
  if (!url.startsWith('/api/auth') && (read || SCREEN_WRITES.some((re) => re.test(url)))) return false
  return !editorAllowed(req)
}

const PAGE = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Редактор закрыт</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1d1f24;color:#f2f2f2;font:20px/1.5 system-ui,sans-serif}
div{max-width:560px;padding:32px}h1{font-size:26px;margin:0 0 12px}p{margin:0;color:#aeb4bf}</style></head><body><div>
<h1>Редактор табло закрыт</h1><p>Редактор табло открывается только с компьютеров учителей. Обратитесь к администратору табло.</p></div></body></html>`

/** Страница /admin с неразрешённого компьютера: отдаёт заглушку, true — запрос обработан. */
export function guardAdminPage(req, res) {
  const url = (req.url || '').split('?')[0]
  if (url !== '/admin' && url !== '/admin/') return false
  if (editorAllowed(req)) return false
  res.statusCode = 403
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(PAGE)
  return true
}

// ---------- API ----------
function send(res, code, obj) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(obj))
}

export function handleAccess(req, res) {
  const url = (req.url || '').split('?')[0]
  if (url !== '/api/access') return false
  const me = ipOf(req)

  if (req.method === 'GET') {
    send(res, 200, { ...readAccess(), me })
    return true
  }
  if (req.method === 'PUT') {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (c) => {
      body += c
      if (body.length > 50_000) req.destroy()
    })
    req.on('end', () => {
      let b = {}
      try {
        b = JSON.parse(body || '{}') || {}
      } catch {
        /* пусто — ниже ответим ошибкой */
      }
      const c = cleanAccess(b)
      if (c.error) return send(res, 400, { ok: false, error: c.error })
      // защита от «запереть себя»: свой адрес должен быть в списке (сам сервер разрешён всегда)
      if (c.on && !isLocalIp(me) && !ipInList(me, c.allow.map((x) => x.net)))
        return send(res, 400, { ok: false, error: 'Сначала добавьте этот компьютер, иначе вы потеряете доступ' })
      const before = readAccess()
      fs.mkdirSync(path.dirname(FILE), { recursive: true })
      fs.writeFileSync(FILE + '.tmp', JSON.stringify(c, null, 2), 'utf8')
      fs.renameSync(FILE + '.tmp', FILE)
      const nets = (l) => l.map((x) => x.net).join(', ')
      const lines = []
      if (before.on !== c.on) lines.push(c.on ? 'Доступ к редактору: только с выбранных компьютеров' : 'Доступ к редактору: с любых компьютеров')
      if (nets(before.allow) !== nets(c.allow)) lines.push(`Компьютеры редактора: ${nets(c.allow) || 'список пуст'}`)
      if (lines.length) logEvent(req, 'system', lines)
      send(res, 200, { ok: true, ...c, me })
    })
    return true
  }
  send(res, 405, { ok: false })
  return true
}
