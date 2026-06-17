import { useEffect, useRef } from 'react';
import { TOKEN_KEY } from '../api/client.js';

const SSE_EVENTS = ['prediction', 'result', 'ranking', 'online'];

/**
 * Conecta ao endpoint SSE e chama handlers quando chegam eventos.
 * handlers: { prediction?, result?, ranking? }
 * EventSource reconecta automaticamente em caso de queda.
 */
export function useSSE(handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const es = new EventSource(`/api/sse?token=${encodeURIComponent(token)}`);

    for (const type of SSE_EVENTS) {
      es.addEventListener(type, (e) => {
        const data = e.data ? JSON.parse(e.data) : {};
        ref.current[type]?.(data);
      });
    }

    return () => es.close();
  }, []);
}
