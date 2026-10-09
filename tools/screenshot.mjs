// Скриншот страницы для проверки интерфейса (нужен запущенный сервер: start.bat или dev.bat).
// Пример: node tools/screenshot.mjs admin#media shot.png
//         node tools/screenshot.mjs "" shot.png 1920 1080 http://localhost:5173   ("" — экран /)
// Путь пишем без начального «/»: Git Bash превращает «/…» в путь к своей папке.
// Первый раз: npx playwright install chromium
import { chromium } from 'playwright'

const [path = '', out = 'screenshot.png', w = '1600', h = '900', base = 'http://localhost:8080'] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('response', (r) => r.status() >= 400 && !r.url().endsWith('/background.jpg') && errors.push(`${r.status()} ${r.url()}`))
await page.goto(base + '/' + path.replace(/^\/+/, ''))
await page.waitForTimeout(1500)
await page.screenshot({ path: out })
await browser.close()
console.log(out, errors.length ? '\nОшибки:\n' + errors.join('\n') : '— ошибок нет')
