import { createApp } from 'vue'
import '@fontsource/montserrat/cyrillic-600.css'
import '@fontsource/montserrat/latin-600.css'
import '@fontsource/montserrat/cyrillic-800.css'
import '@fontsource/montserrat/latin-800.css'
import '@fontsource/montserrat/cyrillic-900.css'
import '@fontsource/montserrat/latin-900.css'
import './style.css'
import { startSync } from './store.js'
import { ui } from './ui.js'

// Без роутера: /admin — редактор, всё остальное — экран для зрителей.
// Код редактора грузится отдельным файлом, экрану он не нужен.
const isAdmin = /^\/admin(\/|$)/.test(location.pathname)

async function boot() {
  let App
  if (isAdmin) {
    document.title = '12 Кадр'
    App = (await import('./admin/AdminApp.vue')).default
  } else {
    document.title = 'Экран'
    ui.readonly = true
    App = (await import('./DisplayApp.vue')).default
  }
  // экран перезагружается после перезапуска сервера, чтобы подхватить новую сборку;
  // редактор — нет, чтобы не потерять набранный текст
  startSync({ reloadOnRestart: !isAdmin })
  createApp(App).mount('#app')
}
boot()
