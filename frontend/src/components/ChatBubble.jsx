import { useEffect, useRef, useState } from 'react';
import { useChat } from '../hooks/useChat.js';

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatBubble() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const { messages, unread, send } = useChat(open);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Scroll para o fim quando chegam mensagens novas e o painel está aberto
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  // Foca o input ao abrir
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    try {
      await send(text);
    } catch {
      setInput(text); // restaura se falhou
    } finally {
      setSending(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {/* Painel */}
      {open && (
        <div className="flex flex-col w-80 h-96 rounded-xl border border-line bg-bg-800 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-bg-900">
            <span className="text-sm font-semibold text-ink">💬 Chat do bolão</span>
            <button
              onClick={() => setOpen(false)}
              className="text-ink-dim hover:text-ink text-lg leading-none"
            >
              ×
            </button>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-xs text-ink-dim text-center pt-8">
                Nenhuma mensagem ainda. Seja o primeiro!
              </p>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className="flex gap-2 items-start">
                <span
                  className="mt-0.5 h-6 w-6 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-bg-900"
                  style={{ backgroundColor: msg.avatar_color }}
                >
                  {msg.player_name.charAt(0).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-ink">{msg.player_name}</span>
                    <span className="text-[10px] text-ink-dim">{formatTime(msg.created_at)}</span>
                  </div>
                  <p className="text-sm text-ink-mut break-words">{msg.message}</p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-line px-3 py-2 flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              maxLength={500}
              placeholder="Mensagem..."
              className="flex-1 bg-bg-900 border border-line rounded-lg px-3 py-1.5 text-base text-ink placeholder-ink-dim focus:outline-none focus:border-gold min-w-0"
              style={{ fontSize: 16 }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="px-3 py-1.5 rounded-lg bg-gold text-bg-900 text-sm font-semibold disabled:opacity-40 hover:brightness-110 transition"
            >
              ➤
            </button>
          </div>
        </div>
      )}

      {/* Botão flutuante */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative h-13 w-13 rounded-full bg-gold text-bg-900 shadow-lg hover:brightness-110 transition flex items-center justify-center text-xl"
        style={{ width: 52, height: 52, touchAction: 'manipulation' }}
        aria-label="Abrir chat"
      >
        💬
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}
