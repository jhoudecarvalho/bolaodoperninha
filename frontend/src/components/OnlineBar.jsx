import { useOnlineUsers } from '../hooks/useOnlineUsers.js';

function formatAgo(dateStr) {
  if (!dateStr) return '';
  const ms = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d !== 1 ? 's' : ''}`;
}

function Dot({ color }) {
  return (
    <span
      className="inline-flex h-2 w-2 rounded-full shrink-0"
      style={{ backgroundColor: color }}
    />
  );
}

export default function OnlineBar() {
  const { online, history, ready } = useOnlineUsers();

  const onlineNames = new Set(online.map((u) => u.name));
  // Histórico: quem já foi visto mas não está online agora
  const seen = history.filter((u) => !onlineNames.has(u.name));

  return (
    <div className="border-b border-line bg-bg-900/60 backdrop-blur overflow-x-auto">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-2 min-w-0">

        {/* Online agora */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-ink-dim whitespace-nowrap">online agora</span>
          {!ready ? (
            <span className="text-xs text-ink-dim animate-pulse">…</span>
          ) : online.length === 0 ? (
            <span className="text-xs text-ink-dim">—</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {online.map((u) => (
                <span
                  key={u.name}
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-bg-900"
                  style={{ backgroundColor: u.color }}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-green-300 shrink-0" />
                  {u.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Divisor */}
        {seen.length > 0 && (
          <div className="h-4 w-px bg-line shrink-0" />
        )}

        {/* Histórico */}
        {seen.length > 0 && (
          <div className="flex items-center gap-2 min-w-0 overflow-x-auto">
            <span className="text-xs text-ink-dim whitespace-nowrap shrink-0">visto</span>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {seen.map((u) => (
                <span
                  key={u.name}
                  className="inline-flex items-center gap-1.5 text-xs text-ink-mut whitespace-nowrap"
                >
                  <Dot color={u.color} />
                  {u.name}
                  <span className="text-ink-dim">{formatAgo(u.lastSeenAt)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
