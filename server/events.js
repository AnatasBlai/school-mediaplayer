// SSE: экраны и редактор держат соединение /api/events и узнают о правках сразу.

// Метка запуска сервера: если она сменилась, экран понимает, что сервер перезапустили
// (например, после пересборки), и перезагружает страницу.
const BOOT = Date.now().toString(36)
const clients = new Set()

export function openEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  })
  res.write(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({ boot: BOOT })}\n\n`)
  clients.add(res)
  req.on('close', () => clients.delete(res))
}

/** События: data { updatedAt } — изменилось расписание; media {} — изменилась медиатека. */
export function broadcast(event, data = {}) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const c of clients) c.write(msg)
}

// пустой комментарий раз в 25 с, чтобы простаивающее соединение не закрылось
setInterval(() => {
  for (const c of clients) c.write(': ping\n\n')
}, 25_000).unref()
