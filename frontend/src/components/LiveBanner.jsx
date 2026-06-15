import { useEffect, useState } from 'react';
import { PredictionsAPI } from '../api/client.js';
import MatchTimer from './MatchTimer.jsx';

function parseScorers(raw) {
  if (!raw) return [];
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return []; }
}

function liveOutcome(h, a) {
  return h > a ? 'home' : h < a ? 'away' : 'draw';
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

  const allPaused = matches.every((m) => m.status === 'paused');

  return (
    <div className="card border-ok/40 bg-gradient-to-r from-[#0f2a12] to-bg-700 p-4 animate-fadeIn">
      <div className="mb-3 flex items-center gap-2">
        {allPaused ? (
          <span className="text-warn">⏸</span>
        ) : (
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-ok opacity-75 animate-pulseLive" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-ok" />
          </span>
        )}
        <span className={`font-display text-lg font-bold ${allPaused ? 'text-warn' : 'text-ok'}`}>
          {allPaused ? 'PAUSADO' : 'AO VIVO'}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {matches.map((m) => (
          <div
            key={m.id}
            className="rounded-lg bg-bg-900/60 px-3 py-2 text-sm"
          >
            <div className="flex items-center justify-between">
              <span>{m.home_flag} {m.home_name}</span>
              <span className={`font-bold tabular-nums ${m.status === 'paused' ? 'text-warn' : 'text-gold'}`}>
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
              const curOutcome = liveOutcome(liveH, liveA);

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
                          <b>+3</b>
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
                          <b>+1</b>
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
          </div>
        ))}
      </div>
    </div>
  );
}
