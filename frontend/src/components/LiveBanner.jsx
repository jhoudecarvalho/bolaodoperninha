import { useEffect, useState } from 'react';
import { PredictionsAPI } from '../api/client.js';
import MatchTimer from './MatchTimer.jsx';

const STAGE_PTS = {
  GROUP_STAGE:    { exact: 3,  outcome: 1 },
  LAST_32:        { exact: 5,  outcome: 3 },
  LAST_16:        { exact: 8,  outcome: 5 },
  QUARTER_FINALS: { exact: 10, outcome: 6 },
  SEMI_FINALS:    { exact: 13, outcome: 8 },
  THIRD_PLACE:    { exact: 10, outcome: 6 },
  FINAL:          { exact: 16, outcome: 10 },
};

function parseScorers(raw) {
  if (!raw) return [];
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return []; }
}

function parseStats(raw) {
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}

function liveOutcome(h, a) {
  return h > a ? 'home' : h < a ? 'away' : 'draw';
}

// Decisão por pênaltis: placar empatado mas há um vencedor (mata-mata). Retorna
// o nome do time que avançou, ou null se não foi nos pênaltis.
function penaltyWinnerName(m) {
  if (m.home_score == null || m.home_score !== m.away_score) return null;
  if (m.winner === 'home') return m.home_name;
  if (m.winner === 'away') return m.away_name;
  return null;
}

export default function LiveBanner({ matches = [] }) {
  const [predsByMatch, setPredsByMatch] = useState({});

  const matchIds = matches.map((m) => m.id).join(',');
  useEffect(() => {
    if (!matches.length) return;
    matches.forEach((m) => {
      PredictionsAPI.byMatch(m.id)
        .then((list) => setPredsByMatch((prev) => ({ ...prev, [m.id]: list })))
        .catch(() => {});
    });
  }, [matchIds]);

  if (!matches.length) return null;

  const allPaused    = matches.every((m) => m.status === 'paused');
  const allFinished  = matches.every((m) => m.status === 'finished');
  const anyLive      = matches.some((m) => m.status === 'live');

  const headerColor = allFinished ? 'text-ink-mut' : allPaused ? 'text-warn' : 'text-ok';
  const borderColor = allFinished ? 'border-ink-dim/30' : 'border-ok/40';
  const bgGradient  = allFinished
    ? 'bg-gradient-to-r from-[#1a1a1a] to-bg-700'
    : 'bg-gradient-to-r from-[#0f2a12] to-bg-700';

  return (
    <div className={`card ${borderColor} ${bgGradient} p-4 animate-fadeIn`}>
      <div className="mb-3 flex items-center gap-2">
        {allFinished ? (
          <span>✅</span>
        ) : allPaused ? (
          <span className="text-warn">⏸</span>
        ) : (
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-ok opacity-75 animate-pulseLive" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-ok" />
          </span>
        )}
        <span className={`font-display text-lg font-bold ${headerColor}`}>
          {allFinished
            ? (matches.length > 1 ? `${matches.length} JOGOS ENCERRADOS` : 'ENCERRADO')
            : allPaused
            ? 'PAUSADO'
            : matches.length > 1
            ? `${matches.length} JOGOS EM ANDAMENTO`
            : 'AO VIVO'}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {matches.map((m) => (
          <div
            key={m.id}
            className="rounded-lg bg-bg-900/60 px-3 py-2 text-sm"
          >
            <div className="flex items-center justify-between">
              <span>{m.home_flag} {m.home_name}</span>
              <span className={`font-bold tabular-nums ${m.status === 'finished' ? 'text-ink' : m.status === 'paused' ? 'text-warn' : 'text-gold'}`}>
                {m.home_score ?? 0} × {m.away_score ?? 0}
              </span>
              <span>{m.away_name} {m.away_flag}</span>
            </div>
            <div className="mt-1 text-center text-xs">
              <MatchTimer
                kickoffUtc={m.kick_off_utc}
                status={m.status}
                liveMinute={m.live_minute}
                liveInjuryTime={m.live_injury_time}
              />
            </div>
            {/* Selo de pênaltis */}
            {penaltyWinnerName(m) && (
              <div className="mt-1 text-center">
                <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold">
                  🥅 {penaltyWinnerName(m)} venceu nos pênaltis
                </span>
              </div>
            )}
            {/* Goleadores */}
            {(() => {
              const hs = parseScorers(m.home_scorers);
              const as = parseScorers(m.away_scorers);
              if (!hs.length && !as.length) return null;
              return (
                <div className="mt-2 flex justify-between text-xs text-ink-mut gap-2">
                  <div className="flex flex-col gap-0.5">
                    {hs.map((s, i) => (
                      <span key={i}>⚽ {s.name} {s.minute}'</span>
                    ))}
                  </div>
                  <div className="flex flex-col gap-0.5 text-right">
                    {as.map((s, i) => (
                      <span key={i}>{s.minute}' {s.name} ⚽</span>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Apostas ao vivo */}
            {(() => {
              const preds = (predsByMatch[m.id] || []).filter((p) => p.home_score != null);
              if (!preds.length) return null;

              const liveH = m.home_score ?? 0;
              const liveA = m.away_score ?? 0;
              // Encerrado nos pênaltis: placar empatado mas alguém avançou → usa `winner`
              const curOutcome =
                m.winner === 'home' ? 'home' :
                m.winner === 'away' ? 'away' :
                liveOutcome(liveH, liveA);

              const sp = STAGE_PTS[m.stage] ?? STAGE_PTS.GROUP_STAGE;

              const exact   = preds.filter((p) => p.home_score === liveH && p.away_score === liveA);
              const ahead   = preds.filter((p) => {
                if (p.home_score === liveH && p.away_score === liveA) return false;
                return liveOutcome(p.home_score, p.away_score) === curOutcome;
              });
              const losing  = preds.filter((p) => {
                if (p.home_score === liveH && p.away_score === liveA) return false;
                return liveOutcome(p.home_score, p.away_score) !== curOutcome;
              });

              return (
                <div className="mt-2 border-t border-white/10 pt-2 space-y-1">
                  {exact.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {exact.map((p) => (
                        <span key={p.player_id} className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-xs font-medium text-gold ring-1 ring-gold/40">
                          🥇 {p.player_name}
                          <b className="tabular-nums">{p.home_score}×{p.away_score}</b>
                          <b>+{sp.exact}</b>
                        </span>
                      ))}
                    </div>
                  )}
                  {ahead.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {ahead.map((p) => (
                        <span key={p.player_id} className="inline-flex items-center gap-1 rounded-full bg-yellow-400/15 px-2 py-0.5 text-xs text-yellow-300 ring-1 ring-yellow-400/30">
                          🟡 {p.player_name}
                          <b className="tabular-nums">{p.home_score}×{p.away_score}</b>
                          <b>+{sp.outcome}</b>
                        </span>
                      ))}
                    </div>
                  )}
                  {losing.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {losing.map((p) => (
                        <span key={p.player_id} className="inline-flex items-center gap-1 rounded-full bg-bg-900/80 px-2 py-0.5 text-xs text-ink-dim">
                          ❌ {p.player_name}
                          <b className="tabular-nums">{p.home_score}×{p.away_score}</b>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Estádio, público e estatísticas completas */}
            {(() => {
              const hs = parseStats(m.home_stats);
              const as = parseStats(m.away_stats);
              const hasStats = hs || as;
              if (!m.venue && !m.attendance && !hasStats) return null;
              const ROWS = [
                { label: 'Posse (%)',   hv: hs?.possession,    av: as?.possession },
                { label: 'Chutes',      hv: hs?.shots,         av: as?.shots },
                { label: 'No gol',      hv: hs?.shotsOnTarget, av: as?.shotsOnTarget },
                { label: 'Escanteios', hv: hs?.corners,       av: as?.corners },
                { label: 'Faltas',      hv: hs?.fouls,         av: as?.fouls },
              ].filter((r) => r.hv != null || r.av != null);
              return (
                <div className="mt-3 border-t border-white/10 pt-2 space-y-1.5">
                  {(m.venue || m.attendance) && (
                    <div className="text-center text-xs text-ink-dim">
                      📍 {m.venue}
                      {m.attendance && (
                        <span className="ml-2">· 👥 {Number(m.attendance).toLocaleString('pt-BR')}</span>
                      )}
                    </div>
                  )}
                  {ROWS.map(({ label, hv, av }) => {
                    const h = hv ?? 0;
                    const a = av ?? 0;
                    const total = h + a || 1;
                    const homePct = (h / total) * 100;
                    return (
                      <div key={label} className="grid grid-cols-[2.5rem_1fr_4.5rem_1fr_2.5rem] items-center gap-1.5 text-xs">
                        <span className="text-right tabular-nums font-semibold text-ink">{hv ?? '–'}</span>
                        <div className="flex h-1.5 overflow-hidden rounded-full bg-black/30 justify-end">
                          <div className="h-full rounded-full bg-gold transition-all duration-500" style={{ width: `${homePct}%` }} />
                        </div>
                        <span className="text-center text-ink-dim">{label}</span>
                        <div className="h-1.5 overflow-hidden rounded-full bg-black/30">
                          <div className="h-full rounded-full bg-ink-dim transition-all duration-500" style={{ width: `${100 - homePct}%` }} />
                        </div>
                        <span className="tabular-nums font-semibold text-ink">{av ?? '–'}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}
