// Допустимые ключи тем, типов слайдов, шаблонов, анимаций и параллелей — один источник для клиента и сервера.
// Без Vue и без импортов (его импортирует server/). Названия и оформление — в src/themes.js и src/playlist.js;
// добавил ключ здесь — добавь и там (расхождение ловит tests/catalog.test.js).
export const THEME_KEYS = ['5', '6', '7', '8', '9', '10', '11', 'changes', 'sea', 'sunset', 'mint', 'graphite', 'lavender', 'royal']
export const BOARD_THEME_KEYS = ['5', '6', '7', '8', '9', '10', '11', 'changes']
export const SLIDE_TYPES = ['schedule', 'changes', 'image', 'video', 'news', 'winners', 'countdown', 'menu', 'birthdays', 'deck']
export const LAYOUTS = ['full', 'panel']
export const NEWS_ANIM_KEYS = ['none', 'zoom', 'drift', 'parallax', 'rise']
// ключи дней слайда «Меню»: 1–6 = Пн–Сб, 8–13 = Пн–Сб второй недели (при twoWeeks)
export const MENU_DAY_KEYS = ['1', '2', '3', '4', '5', '6']
export const MENU_DAY_KEYS_2 = ['8', '9', '10', '11', '12', '13']
export const GRADES = ['5', '6', '7', '8', '9', '10', '11']
