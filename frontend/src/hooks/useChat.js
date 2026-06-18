import { useEffect, useRef, useState, useCallback } from 'react';
import { ChatAPI } from '../api/client.js';
import { TOKEN_KEY } from '../api/client.js';

export function useChat(open) {
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(0);
  const loaded = useRef(false);

  const addMessage = useCallback((msg) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    if (!open) setUnread((n) => n + 1);
  }, [open]);

  // Carrega histórico uma vez
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    ChatAPI.history().then(setMessages).catch(() => {});
  }, []);

  // Zera unread quando abre
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  // SSE — escuta evento chat
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const es = new EventSource(`/api/sse?token=${encodeURIComponent(token)}`);
    es.addEventListener('chat', (e) => {
      addMessage(JSON.parse(e.data));
    });

    return () => es.close();
  }, [addMessage]);

  const send = useCallback(async (text) => {
    const msg = await ChatAPI.send(text);
    // O broadcast SSE já vai adicionar, mas garantimos localmente
    addMessage(msg);
  }, [addMessage]);

  return { messages, unread, send };
}
