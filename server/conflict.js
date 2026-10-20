// Защита от затирания чужих правок: клиент шлёт X-Base-Updated — updatedAt версии, на которой строил свои правки.
// Если в файле версия новее — запись не принимается (409 с текущими данными), клиент объединяет и повторяет.
// Нет заголовка (старая вкладка) — пишем как раньше.

/** true, если в файле лежит версия новее той, на которой построена правка. */
export function baseConflict(req, currentUpdatedAt) {
  const h = req.headers['x-base-updated']
  if (h === undefined || h === '') return false
  return (Number(currentUpdatedAt) || 0) > (Number(h) || 0)
}

/** updatedAt для записи: не меньше, чем в файле + 1, чтобы версия росла при любых часах клиентов. */
export function nextUpdated(sent, currentUpdatedAt) {
  const cur = Number(currentUpdatedAt) || 0
  const n = Number(sent) || Date.now()
  return n > cur ? n : cur + 1
}
