import { useEffect, useRef, useState, useCallback } from 'react';
import { ChatAPI, TOKEN_KEY } from '../api/client.js';

export function useChat(open) {
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(0);
  const loaded = useRef(false);
  const openRef = useRef(open);
  const knownIds = useRef(new Set());

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const addMessage = useCallback((msg) => {
    // Deduplicação via Set — rápida e sem chamar setState dentro de updater
    if (knownIds.current.has(msg.id)) return;
    knownIds.current.add(msg.id);

    setMessages((prev) => [...prev, msg]);

    // setState fora do updater — seguro e confiável
    if (!openRef.current) setUnread((n) => n + 1);
  }, []);

  // Carrega histórico e popula o Set de IDs conhecidos
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    ChatAPI.history()
      .then((msgs) => {
        msgs.forEach((m) => knownIds.current.add(m.id));
        setMessages(msgs);
      })
      .catch(() => {});
  }, []);

  // Zera unread quando abre
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  // SSE estável — criado uma vez, nunca reconecta por causa do open
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
    addMessage(msg);
  }, [addMessage]);

  return { messages, unread, send };
}
