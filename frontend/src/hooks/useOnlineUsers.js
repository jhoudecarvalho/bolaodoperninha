import { useEffect, useRef, useState, useCallback } from 'react';
import { TOKEN_KEY } from '../api/client.js';
import api from '../api/client.js';

const POLL_MS = 60_000; // re-busca o histórico a cada 1 min

export function useOnlineUsers() {
  const [online, setOnline] = useState([]);    // [{ name, color }] — via SSE, tempo real
  const [history, setHistory] = useState([]);  // [{ name, color, lastSeenAt, online }] — via API
  const [ready, setReady] = useState(false);
  const prevOnline = useRef([]);

  const fetchHistory = useCallback(async () => {
    try {
      const { data } = await api.get('/seen');
      setHistory(data);
    } catch { /* ignora */ }
  }, []);

  useEffect(() => {
    fetchHistory();
    const poll = setInterval(fetchHistory, POLL_MS);

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return () => clearInterval(poll);

    const es = new EventSource(`/api/sse?token=${encodeURIComponent(token)}`);

    es.addEventListener('online', (e) => {
      const { users } = JSON.parse(e.data);
      setOnline(users);
      prevOnline.current = users;
      setReady(true);
      // Atualiza o histórico quando o estado online muda
      fetchHistory();
    });

    return () => {
      es.close();
      clearInterval(poll);
    };
  }, [fetchHistory]);

  return { online, history, ready };
}
