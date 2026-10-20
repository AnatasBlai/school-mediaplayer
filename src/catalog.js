// Допустимые ключи тем, типов слайдов, шаблонов, анимаций и параллелей — один источник для клиента и сервера.
// Без Vue и без импортов (его импортирует server/). Названия и оформление — в src/themes.js и src/playlist.js;
// добавил ключ здесь — добавь и там (расхождение ловит tests/catalog.test.js).
export const THEME_KEYS = ['5', '6', '7', '8', '9', '10', '11', 'changes', 'sea', 'sunset', 'mint', 'graphite', 'lavender', 'royal']
export const BOARD_THEME_KEYS = ['5', '6', '7', '8', '9', '10', '11', 'changes']
export const SLIDE_TYPES = ['schedule', 'changes', 'image', 'video', 'news', 'winners', 'countdown', 'deck']
export const LAYOUTS = ['full', 'panel']
export const NEWS_ANIM_KEYS = ['none', 'zoom', 'drift', 'parallax', 'rise']
export const GRADES = ['5', '6', '7', '8', '9', '10', '11']
