const clients = new Set();

export function addClient(res) {
  clients.add(res);
  return () => clients.delete(res);
}

export function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(msg);
    } catch {
      clients.delete(res);
    }
  }
}
