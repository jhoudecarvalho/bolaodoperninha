// Exibe os gols de um jogo de forma organizada:
//  1. Gols do tempo normal/prorrogação (com minuto)
//  2. Bloco separado da disputa de pênaltis (quem converteu ✅ / perdeu ❌)
// Recebe arrays já parseados. Serve tanto o card grande quanto o compacto (compact).
function toArr(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

export default function MatchGoals({
  homeScorers,
  awayScorers,
  homeShootout,
  awayShootout,
  compact = false,
}) {
  const hs = toArr(homeScorers);
  const as = toArr(awayScorers);
  const hp = toArr(homeShootout);
  const ap = toArr(awayShootout);

  const hasGoals = hs.length > 0 || as.length > 0;
  const hasPens  = hp.length > 0 || ap.length > 0;
  if (!hasGoals && !hasPens) return null;

  const txt   = compact ? 'text-[10px]' : 'text-xs';
  const label = compact ? 'text-[8px]' : 'text-[9px]';

  return (
    <div className={`mt-2 space-y-1.5 ${txt}`}>
      {hasGoals && (
        <div className="flex justify-between gap-2 text-ink-mut">
          <div className="space-y-0.5">
            {hs.map((s, i) => (
              <div key={i}>⚽ {s.name} <span className="text-gold">{s.minute}'</span></div>
            ))}
          </div>
          <div className="space-y-0.5 text-right">
            {as.map((s, i) => (
              <div key={i}><span className="text-gold">{s.minute}'</span> {s.name} ⚽</div>
            ))}
          </div>
        </div>
      )}

      {hasPens && (
        <div className="rounded-lg border border-gold/20 bg-gold/5 px-2 py-1.5">
          <div className={`mb-1 text-center font-bold uppercase tracking-wide text-gold/80 ${label}`}>
            🥅 Disputa de Pênaltis · {hp.filter((p) => p.scored !== false).length} × {ap.filter((p) => p.scored !== false).length}
          </div>
          <div className="flex justify-between gap-2 text-ink-mut">
            <div className="space-y-0.5">
              {hp.map((p, i) => (
                <div key={i}>{p.scored === false ? '❌' : '✅'} {p.name}</div>
              ))}
            </div>
            <div className="space-y-0.5 text-right">
              {ap.map((p, i) => (
                <div key={i}>{p.name} {p.scored === false ? '❌' : '✅'}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
