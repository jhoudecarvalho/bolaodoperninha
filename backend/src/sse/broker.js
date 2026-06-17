// userId → { name, color, conns: Set<res> }
const clients = new Map();

export function addClient(user, res) {
  const id = user.sub;
  if (!clients.has(id)) {
    clients.set(id, { name: user.name, color: user.color ?? '#c8aa6e', conns: new Set() });
  }
  clients.get(id).conns.add(res);
  broadcastOnline();

  return () => {
    const entry = clients.get(id);
    if (!entry) return;
    entry.conns.delete(res);
    if (entry.conns.size === 0) clients.delete(id);
    broadcastOnline();
  };
}

export function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const { conns } of clients.values()) {
    for (const res of conns) {
      try {
        res.write(msg);
      } catch {
        conns.delete(res);
      }
    }
  }
}

export function getOnlineUsers() {
  return [...clients.values()].map(({ name, color }) => ({ name, color }));
}

function broadcastOnline() {
  broadcast('online', { users: getOnlineUsers() });
}
