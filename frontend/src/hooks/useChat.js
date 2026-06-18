import { useEffect, useRef, useState, useCallback } from 'react';
import { ChatAPI, TOKEN_KEY } from '../api/client.js';

export function useChat(open) {
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(0);
  const loaded = useRef(false);
  const openRef = useRef(open);

  // Mantém o ref sincronizado sem recriar callbacks
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // addMessage nunca muda → SSE connection fica estável
  const addMessage = useCallback((msg) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      // só incrementa quando a mensagem é de fato nova
      if (!openRef.current) setUnread((n) => n + 1);
      return [...prev, msg];
    });
  }, []);

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

  // SSE estável — só cria uma vez, nunca reconecta por causa do open
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
