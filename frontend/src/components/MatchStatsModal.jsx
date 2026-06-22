import { useEffect } from 'react';
import { formatLocal } from '../utils/datetime.js';

function parseStats(raw) {
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}

function StatRow({ label, home, away }) {
  if (home == null && away == null) return null;
  const h = home ?? 0;
  const a = away ?? 0;
  const total = h + a || 1;
  const homePct = (h / total) * 100;
  return (
    <div className="grid grid-cols-[3rem_1fr_6rem_1fr_3rem] items-center gap-2 text-sm">
      <span className="text-right tabular-nums font-semibold text-ink">{home ?? '–'}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg-900 flex justify-end">
        <div className="h-full rounded-full bg-gold" style={{ width: `${homePct}%` }} />
      </div>
      <span className="text-center text-xs text-ink-mut">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg-900">
        <div className="h-full rounded-full bg-ink-dim" style={{ width: `${100 - homePct}%` }} />
      </div>
      <span className="tabular-nums font-semibold text-ink">{away ?? '–'}</span>
    </div>
  );
}

export default function MatchStatsModal({ match, onClose }) {
  const hs = parseStats(match.home_stats);
  const as = parseStats(match.away_stats);
  const hasStats = hs || as;

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md space-y-4 p-5 animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="text-xs text-ink-mut">
            {match.group_id ? `Grupo ${match.group_id}` : match.stage} · {formatLocal(match.kick_off_utc)}
          </div>
          <button className="text-ink-dim hover:text-ink text-lg leading-none" onClick={onClose}>✕</button>
        </div>

        {/* Placar */}
        <div className="flex items-center justify-between gap-3 text-center">
          <div className="flex flex-1 flex-col items-center gap-1">
            <span className="text-4xl">{match.home_flag}</span>
            <span className="text-sm font-medium">{match.home_name}</span>
          </div>
          <div className="font-display text-3xl font-black text-gold tabular-nums">
            {match.home_score ?? '–'} × {match.away_score ?? '–'}
          </div>
          <div className="flex flex-1 flex-col items-center gap-1">
            <span className="text-4xl">{match.away_flag}</span>
            <span className="text-sm font-medium">{match.away_name}</span>
          </div>
        </div>

        {/* Venue + público */}
        {(match.venue || match.attendance) && (
          <div className="text-center text-xs text-ink-dim space-y-0.5">
            {match.venue && <div>📍 {match.venue}</div>}
            {match.attendance && (
              <div>👥 {Number(match.attendance).toLocaleString('pt-BR')} pessoas</div>
            )}
          </div>
        )}

        {/* Estatísticas */}
        {hasStats ? (
          <div className="space-y-2.5 border-t border-line pt-4">
            <div className="grid grid-cols-[3rem_1fr_6rem_1fr_3rem] text-center text-xs text-ink-dim mb-1">
              <span>{match.home_flag}</span>
              <span />
              <span>Estatística</span>
              <span />
              <span>{match.away_flag}</span>
            </div>
            <StatRow label="Posse (%)"    home={hs?.possession}    away={as?.possession} />
            <StatRow label="Chutes"       home={hs?.shots}         away={as?.shots} />
            <StatRow label="No Gol"       home={hs?.shotsOnTarget} away={as?.shotsOnTarget} />
            <StatRow label="Escanteios"   home={hs?.corners}       away={as?.corners} />
            <StatRow label="Faltas"       home={hs?.fouls}         away={as?.fouls} />
          </div>
        ) : (
          <p className="text-center text-xs text-ink-dim border-t border-line pt-4">
            Estatísticas ainda não disponíveis para este jogo.
          </p>
        )}
      </div>
    </div>
  );
}
