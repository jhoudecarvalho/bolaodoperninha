import { useOnlineUsers } from '../hooks/useOnlineUsers.js';

function formatAgo(dateStr) {
  if (!dateStr) return '';
  const ms = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default function OnlineBar() {
  const { online, history, ready } = useOnlineUsers();

  const onlineNames = new Set(online.map((u) => u.name));
  const seen = history.filter((u) => !onlineNames.has(u.name));

  return (
    <div className="border-b border-line bg-bg-900/60 backdrop-blur">
      {/* Linha única, scroll horizontal em telas pequenas */}
      <div className="flex items-center gap-3 px-4 py-2 overflow-x-auto scrollbar-none">

        {/* Online agora */}
        <span className="text-xs text-ink-dim whitespace-nowrap shrink-0">online</span>

        {!ready ? (
          <span className="text-xs text-ink-dim animate-pulse shrink-0">…</span>
        ) : online.length === 0 ? (
          <span className="text-xs text-ink-dim shrink-0">—</span>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            {online.map((u) => (
              <span
                key={u.name}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold text-bg-900 whitespace-nowrap shrink-0"
                style={{ backgroundColor: u.color }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-green-300" />
                {u.name}
              </span>
            ))}
          </div>
        )}

        {/* Divisor */}
        {seen.length > 0 && (
          <div className="h-4 w-px bg-line shrink-0" />
        )}

        {/* Histórico — scroll horizontal, nunca quebra linha */}
        {seen.length > 0 && (
          <>
            <span className="text-xs text-ink-dim whitespace-nowrap shrink-0">visto</span>
            <div className="flex items-center gap-3">
              {seen.map((u) => (
                <span
                  key={u.name}
                  className="inline-flex items-center gap-1.5 text-xs text-ink-mut whitespace-nowrap shrink-0"
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: u.color, opacity: 0.7 }}
                  />
                  {u.name}
                  <span className="text-ink-dim">{formatAgo(u.lastSeenAt)}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
