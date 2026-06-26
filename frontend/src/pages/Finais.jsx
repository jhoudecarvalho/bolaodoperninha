import { useCallback, useEffect, useRef, useState } from 'react';
import { KnockoutAPI, PredictionsAPI } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSSE } from '../hooks/useSSE.js';

// ─── Dimensões do bracket (visual only) ──────────────────────────────────────
const R32H = 42;
const MH   = 84;   // = 2 × R32H
const CW   = 84;
const CN   = 18;
const FW   = 108;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fill(arr, n) {
  return [...arr, ...Array(Math.max(0, n - arr.length)).fill(null)];
}
function shortCode(name) {
  if (!name) return '';
  if (name.length <= 10) return name;
  return name.slice(0, 9) + '…';
}
function shortFull(name) {
  if (!name) return '';
  if (name.length <= 13) return name;
  return name.slice(0, 12) + '…';
}
function fmtDate(utc) {
  if (!utc) return null;
  return new Date(utc).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
}
function fmtTime(utc) {
  if (!utc) return null;
  return new Date(utc).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

const STAGE_LABEL = {
  LAST_32:        'Rodada de 32',
  LAST_16:        'Oitavas de Final',
  QUARTER_FINALS: 'Quartas de Final',
  SEMI_FINALS:    'Semifinal',
  THIRD_PLACE:    '3º Lugar',
  FINAL:          'Final',
};
const STAGE_COLOR = {
  LAST_32:        '#6366f1',
  LAST_16:        '#8b5cf6',
  QUARTER_FINALS: '#d97706',
  SEMI_FINALS:    '#ef4444',
  THIRD_PLACE:    '#64748b',
  FINAL:          '#c8aa6e',
};
const STAGE_PTS = {
  LAST_32:        { exact: 5,  outcome: 3 },
  LAST_16:        { exact: 8,  outcome: 5 },
  QUARTER_FINALS: { exact: 10, outcome: 6 },
  SEMI_FINALS:    { exact: 13, outcome: 8 },
  THIRD_PLACE:    { exact: 10, outcome: 6 },
  FINAL:          { exact: 16, outcome: 10 },
};

// ─── Card de palpite da lista ─────────────────────────────────────────────────
function PredictCard({ match, playerId, stageKey, matchPredictions, onSaved }) {
  const existing = match.myPrediction;
  const [h, setH]         = useState(existing != null ? String(existing.home) : '');
  const [a, setA]         = useState(existing != null ? String(existing.away) : '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(!!existing);
  const [err, setErr]       = useState('');

  useEffect(() => {
    if (match.myPrediction) {
      setH(String(match.myPrediction.home));
      setA(String(match.myPrediction.away));
      setSaved(true);
    }
  }, [match.myPrediction]);

  const isLive     = match.status === 'IN_PLAY' || match.status === 'live' || match.status === 'PAUSED' || match.status === 'paused';
  const isFinished = match.status === 'FINISHED' || match.status === 'finished';
  const homeWon    = match.winner === 'HOME_TEAM' || (isFinished && match.homeScore != null && match.homeScore > match.awayScore);
  const awayWon    = match.winner === 'AWAY_TEAM' || (isFinished && match.awayScore != null && match.awayScore > match.homeScore);
  const hasScore   = match.homeScore != null;
  const locked     = match.locked || isFinished;
  const liveMin    = match.liveMinute != null ? `${match.liveMinute}${match.liveInjury ? '+'+match.liveInjury : ''}'` : null;

  const accent = STAGE_COLOR[stageKey] ?? '#c8aa6e';

  async function save() {
    if (h === '' || a === '') { setErr('Preencha o placar'); return; }
    setSaving(true); setErr('');
    try {
      await PredictionsAPI.save({
        player_id:  playerId,
        match_id:   match.dbMatchId,
        home_score: Number(h),
        away_score: Number(a),
      });
      setSaved(true);
      onSaved?.();
    } catch (e) {
      setErr(e?.response?.data?.error || 'Erro ao salvar');
    }
    setSaving(false);
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${accent}30` }}>
      {/* Header da fase + data */}
      <div className="flex items-center justify-between px-3 py-1.5"
        style={{ background: `${accent}18`, borderBottom: `1px solid ${accent}25` }}>
        {isLive && (
          <div className="flex items-center gap-1 mr-2">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-[10px] font-bold text-red-400">AO VIVO{liveMin ? ` · ${liveMin}` : ''}</span>
          </div>
        )}
        <span className="text-[10px] font-semibold" style={{ color: accent }}>
          {STAGE_LABEL[stageKey] ?? stageKey}
        </span>
        <div className="ml-auto text-right">
          {match.utcDate && (
            <div className="text-[10px] text-ink-dim">
              {fmtDate(match.utcDate)} · {fmtTime(match.utcDate)}
            </div>
          )}
          {match.venue && (
            <div className="text-[9px] text-ink-dim/60">📍 {match.venue}</div>
          )}
        </div>
      </div>

      {/* Times + placar oficial */}
      <div className="px-4 py-3 bg-bg-800/60">
        <div className="flex items-center gap-3">
          {/* Casa */}
          <div className={`flex flex-col items-center gap-1 flex-1 ${isFinished && awayWon ? 'opacity-40' : ''}`}>
            <span className="text-3xl leading-none">{match.home?.flag ?? '🏳️'}</span>
            <span className={`text-xs font-semibold text-center leading-tight ${homeWon ? 'text-gold' : 'text-ink'}`}>
              {match.home?.name ?? 'A definir'}
            </span>
            {match.homeLabel && (
              <span className="text-[9px] text-center leading-tight" style={{ color: match.isProjection ? '#818cf8' : '#94a3b8' }}>{match.homeLabel}</span>
            )}
          </div>

          {/* Placar oficial / VS */}
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            {hasScore ? (
              <div className="text-2xl font-display font-bold tabular-nums text-gold">
                {match.homeScore} × {match.awayScore}
              </div>
            ) : (
              <div className="text-sm font-bold text-ink-dim">VS</div>
            )}
            {match.utcDate && !hasScore && (
              <div className="text-[10px] text-ink-dim">{fmtTime(match.utcDate)}</div>
            )}
            {match.isProjection && (
              <div className="text-[9px] mt-0.5 font-semibold" style={{ color: '#818cf8' }}>📊 projeção</div>
            )}
          </div>

          {/* Visitante */}
          <div className={`flex flex-col items-center gap-1 flex-1 ${isFinished && homeWon ? 'opacity-40' : ''}`}>
            <span className="text-3xl leading-none">{match.away?.flag ?? '🏳️'}</span>
            <span className={`text-xs font-semibold text-center leading-tight ${awayWon ? 'text-gold' : 'text-ink'}`}>
              {match.away?.name ?? 'A definir'}
            </span>
            {match.awayLabel && (
              <span className="text-[9px] text-center leading-tight" style={{ color: match.isProjection ? '#818cf8' : '#94a3b8' }}>{match.awayLabel}</span>
            )}
          </div>
        </div>

        {/* Goleadores */}
        {hasScore && ((match.homeScorers?.length > 0) || (match.awayScorers?.length > 0)) && (
          <div className="flex justify-between mt-2 text-[10px] text-ink-dim">
            <div className="space-y-0.5">
              {(match.homeScorers ?? []).map((s, i) => (
                <div key={i}>⚽ {s.name} <span className="text-gold">{s.minute}'</span></div>
              ))}
            </div>
            <div className="space-y-0.5 text-right">
              {(match.awayScorers ?? []).map((s, i) => (
                <div key={i}><span className="text-gold">{s.minute}'</span> {s.name} ⚽</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Seção de palpite */}
      <div className="px-4 pb-3 pt-2 bg-bg-800/40" style={{ borderTop: `1px solid ${accent}20` }}>
        {/* Times ainda não definidos (placeholder ESPN ou projeção) */}
        {(!match.home || !match.away) ? (
          <p className="text-center text-xs text-ink-dim py-0.5">
            {match.isProjection
              ? <span style={{ color: '#a5b4fc' }}>📊 Palpites abrem quando os times forem confirmados</span>
              : <span>⏳ Palpites abrem quando as seleções forem confirmadas</span>}
          </p>
        ) : locked ? (
          <p className="text-center text-xs text-ink-dim">
            {isFinished ? '✓ Encerrado' : '🔒 Palpites encerrados'}
            {saved && <span className="ml-2 text-ok">· Seu palpite: <strong>{h}×{a}</strong></span>}
          </p>
        ) : playerId ? (
          <div className="space-y-2">
            {saved && (
              <p className="text-center text-[11px] text-ok">
                ✓ Palpite salvo: <strong>{h}×{a}</strong> — pode alterar antes do jogo
              </p>
            )}
            <div className="flex items-center justify-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-dim">{match.home?.name?.split(' ')[0] ?? 'Casa'}</span>
                <input
                  type="number" min="0" max="99" inputMode="numeric"
                  value={h} onChange={e => { setH(e.target.value); setSaved(false); }}
                  className="w-12 h-10 text-center text-lg font-bold rounded-lg text-ink"
                  style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${accent}50`, outline: 'none', fontSize: 16 }}
                />
              </div>
              <span className="text-lg font-bold text-ink-dim">×</span>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="0" max="99" inputMode="numeric"
                  value={a} onChange={e => { setA(e.target.value); setSaved(false); }}
                  className="w-12 h-10 text-center text-lg font-bold rounded-lg text-ink"
                  style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${accent}50`, outline: 'none', fontSize: 16 }}
                />
                <span className="text-xs text-ink-dim">{match.away?.name?.split(' ')[0] ?? 'Fora'}</span>
              </div>
              <button
                onClick={save}
                disabled={saving || h === '' || a === ''}
                style={{ touchAction: 'manipulation' }}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                  saved
                    ? 'bg-ok/20 text-ok border border-ok/30'
                    : 'bg-gold/20 text-gold border border-gold/30'
                } disabled:opacity-40`}
              >
                {saving ? '…' : saved ? '✓ Salvo' : '💾 Salvar'}
              </button>
            </div>
            {err && <p className="text-center text-xs text-danger">{err}</p>}
          </div>
        ) : (
          <p className="text-center text-xs text-ink-dim">Faça login para dar seu palpite</p>
        )}
      </div>

      {/* Lista de quem já apostou */}
      {matchPredictions != null && match.home && match.away && (
        <div className="px-4 pb-3 pt-2" style={{ borderTop: `1px solid ${accent}15` }}>
          {matchPredictions.length === 0 ? (
            <p className="text-xs text-ink-dim">Nenhum palpite ainda.</p>
          ) : (
            <>
              <p className="mb-1.5 flex items-center justify-between text-xs text-ink-dim">
                <span>Palpites ({matchPredictions.length})</span>
                {!locked && <span className="opacity-60">🔒 placares revelados no início</span>}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {matchPredictions.map((p) => {
                  const revealed = p.revealed !== false && p.home_score != null;
                  const o = (h, a) => h > a ? 'home' : h < a ? 'away' : 'draw';
                  const sp = STAGE_PTS[stageKey] ?? { exact: 3, outcome: 1 };
                  const exact = revealed && hasScore && p.home_score === match.homeScore && p.away_score === match.awayScore;
                  const correctOutcome = revealed && hasScore && !exact && o(p.home_score, p.away_score) === o(match.homeScore, match.awayScore);
                  const pts = revealed && hasScore ? (exact ? sp.exact : correctOutcome ? sp.outcome : 0) : null;
                  return (
                    <span
                      key={p.id}
                      className={`badge bg-bg-900 ${exact ? 'text-ok ring-1 ring-ok/40' : 'text-ink'}`}
                      title={p.player_name}
                    >
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: p.avatar_color || accent }} />
                      {p.player_name}
                      {revealed
                        ? <b className="tabular-nums">{p.home_score}×{p.away_score}</b>
                        : <span className="text-ok">✔</span>}
                      {pts !== null && (
                        <span className={exact ? 'font-bold text-gold' : correctOutcome ? 'font-bold text-yellow-400' : 'text-ink-dim'}>
                          {pts > 0 ? `+${pts}` : '0'}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Lista de palpites por fase ───────────────────────────────────────────────
function PredictList({ stages, projection, playerId, predsByMatch, onSaved }) {
  // Mescla projeção nos jogos da R32 que ainda têm times null
  const projMatches = projection?.matches ?? [];

  const byStage = stages.map(s => {
    const matches = s.matches.map((m, i) => {
      if (s.key === 'LAST_32' && !m.home && !m.away && projMatches[i]) {
        const p = projMatches[i];
        return { ...m, home: p.home, homeLabel: p.homeLabel, away: p.away, awayLabel: p.awayLabel, isProjection: true };
      }
      return m;
    });
    return { key: s.key, matches };
  }).filter(s => s.matches.length > 0);

  const totalMatches = byStage.reduce((acc, s) => acc + s.matches.length, 0);
  const totalBets    = byStage.reduce((acc, s) => acc + s.matches.filter(m => m.myPrediction != null).length, 0);

  return (
    <div className="space-y-6">
      {playerId && totalMatches > 0 && (
        <div className="text-center text-xs text-ink-dim">
          <span className={totalBets === totalMatches ? 'text-ok font-semibold' : ''}>
            {totalBets === totalMatches
              ? `✓ Todas as apostas feitas (${totalBets}/${totalMatches})`
              : `${totalBets} de ${totalMatches} apostas feitas`}
          </span>
        </div>
      )}
      {byStage.map(({ key, matches }) => {
        const stageBets = matches.filter(m => m.myPrediction != null).length;
        const allBet    = stageBets === matches.length;
        const accent    = STAGE_COLOR[key] ?? '#555';
        return (
          <div key={key}>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1" style={{ background: `${accent}40` }} />
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: `${accent}20`, color: accent }}>
                  {STAGE_LABEL[key] ?? key}
                </span>
                {playerId && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{
                      background: allBet ? 'rgba(34,197,94,0.15)' : `${accent}15`,
                      color: allBet ? '#4ade80' : `${accent}cc`,
                    }}>
                    {allBet ? `✓ ${stageBets}/${matches.length}` : `${stageBets}/${matches.length}`}
                  </span>
                )}
              </div>
              <div className="h-px flex-1" style={{ background: `${accent}40` }} />
            </div>
            <div className="space-y-3">
              {matches.map((m, i) => (
                <PredictCard
                  key={m.id ?? i}
                  match={m}
                  playerId={playerId}
                  stageKey={key}
                  matchPredictions={predsByMatch?.[m.dbMatchId]}
                  onSaved={onSaved}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Cards compactos do bracket (só visual, sem palpite) ──────────────────────
function R32Card({ match }) {
  const isProj    = match?.isProjection;
  const isLive    = match?.status === 'IN_PLAY' || match?.status === 'PAUSED';
  const isFinished = match?.status === 'FINISHED';
  const homeWon   = match?.winner === 'HOME_TEAM';
  const awayWon   = match?.winner === 'AWAY_TEAM';
  const hasScore  = match?.homeScore != null;

  const border = isLive ? 'rgba(239,68,68,0.7)'
    : isProj    ? 'rgba(99,102,241,0.45)'
    : match?.dbMatchId ? 'rgba(200,170,110,0.3)'
    : 'rgba(40,40,70,0.8)';

  const bg = isLive ? 'rgba(239,68,68,0.05)'
    : isProj  ? 'rgba(99,102,241,0.05)'
    : 'rgba(10,10,28,0.9)';

  if (!match) {
    return (
      <div style={{ height: R32H, border: '1px solid rgba(25,25,50,0.8)', background: 'rgba(7,7,18,0.7)', borderRadius: 5, margin: '1px 2px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div className="flex items-center gap-1 px-1.5"><span className="opacity-10 text-xs">⬜</span><span className="text-[8px] text-ink-dim italic">A definir</span></div>
        <div style={{ borderTop: '1px solid rgba(25,25,50,0.7)', margin: '1px 5px' }} />
        <div className="flex items-center gap-1 px-1.5"><span className="opacity-10 text-xs">⬜</span><span className="text-[8px] text-ink-dim italic">A definir</span></div>
      </div>
    );
  }

  return (
    <div style={{ height: R32H, border: `1px solid ${border}`, background: bg, borderRadius: 5, margin: '1px 2px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className={`flex items-center gap-1 px-1.5 flex-1 ${isFinished && awayWon ? 'opacity-40' : ''}`}>
        {match.home
          ? <><span className="text-xs leading-none shrink-0">{match.home.flag}</span>
              <span className={`text-[10px] font-semibold truncate flex-1 ${homeWon ? 'text-gold' : 'text-ink'}`}>{shortCode(match.home.name)}</span>
              {hasScore && <span className={`text-[10px] font-bold tabular-nums ${homeWon ? 'text-gold' : 'text-ink-mut'}`}>{match.homeScore}</span>}
            </>
          : <span className="text-[8px] text-ink-dim italic flex-1">{match.homeLabel ?? 'A definir'}</span>
        }
      </div>
      <div style={{ borderTop: '1px solid rgba(30,30,55,0.8)', margin: '0 5px' }} />
      <div className={`flex items-center gap-1 px-1.5 flex-1 ${isFinished && homeWon ? 'opacity-40' : ''}`}>
        {match.away
          ? <><span className="text-xs leading-none shrink-0">{match.away.flag}</span>
              <span className={`text-[10px] font-semibold truncate flex-1 ${awayWon ? 'text-gold' : 'text-ink'}`}>{shortCode(match.away.name)}</span>
              {hasScore && <span className={`text-[10px] font-bold tabular-nums ${awayWon ? 'text-gold' : 'text-ink-mut'}`}>{match.awayScore}</span>}
            </>
          : <span className="text-[8px] text-ink-dim italic flex-1">{match.awayLabel ?? 'A definir'}</span>
        }
      </div>
    </div>
  );
}

function PhaseCard({ match, slotH }) {
  if (!match) {
    return (
      <div style={{ height: slotH, display: 'flex', alignItems: 'center' }}>
        <div style={{ height: R32H * 2 - 4, border: '1px solid rgba(25,25,50,0.8)', background: 'rgba(7,7,18,0.7)', borderRadius: 5, margin: '0 2px', width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="flex items-center gap-1 px-1.5 py-0.5"><span className="opacity-10 text-xs">⬜</span><span className="text-[9px] text-ink-dim italic">A definir</span></div>
          <div style={{ borderTop: '1px solid rgba(25,25,50,0.7)', margin: '1px 5px' }} />
          <div className="flex items-center gap-1 px-1.5 py-0.5"><span className="opacity-10 text-xs">⬜</span><span className="text-[9px] text-ink-dim italic">A definir</span></div>
        </div>
      </div>
    );
  }

  const isFinal   = false; // tratado externamente
  const isLive    = match.status === 'IN_PLAY' || match.status === 'PAUSED';
  const isFinished = match.status === 'FINISHED';
  const homeWon   = match.winner === 'HOME_TEAM';
  const awayWon   = match.winner === 'AWAY_TEAM';
  const hasScore  = match.homeScore != null;

  const border = isLive ? 'rgba(239,68,68,0.7)'
    : match.dbMatchId ? 'rgba(200,170,110,0.3)'
    : 'rgba(35,35,60,0.9)';
  const bg = isLive ? 'rgba(239,68,68,0.05)' : 'rgba(10,10,28,0.88)';

  return (
    <div style={{ height: slotH, display: 'flex', alignItems: 'center' }}>
      <div style={{ border: `1px solid ${border}`, background: bg, borderRadius: 5, margin: '0 2px', width: '100%', overflow: 'hidden' }}>
        {isLive && (
          <div className="flex items-center justify-center gap-1 py-0.5" style={{ background: 'rgba(239,68,68,0.15)' }}>
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-[8px] font-bold text-red-400">AO VIVO</span>
          </div>
        )}
        <div className={`flex items-center gap-1.5 px-2 py-1 ${isFinished && awayWon ? 'opacity-40' : ''}`}>
          {match.home
            ? <><span className="text-sm leading-none shrink-0">{match.home.flag}</span>
                <span className={`text-[11px] font-semibold truncate flex-1 ${homeWon ? 'text-gold' : 'text-ink'}`}>{shortFull(match.home.name)}</span>
                {hasScore && <span className={`text-sm font-bold tabular-nums ${homeWon ? 'text-gold' : 'text-ink-mut'}`}>{match.homeScore}</span>}</>
            : <span className="text-[9px] text-ink-dim italic truncate flex-1">{match.homeLabel ?? 'A definir'}</span>
          }
        </div>
        <div style={{ borderTop: '1px solid rgba(30,30,55,0.8)', margin: '0 6px' }} />
        <div className={`flex items-center gap-1.5 px-2 py-1 ${isFinished && homeWon ? 'opacity-40' : ''}`}>
          {match.away
            ? <><span className="text-sm leading-none shrink-0">{match.away.flag}</span>
                <span className={`text-[11px] font-semibold truncate flex-1 ${awayWon ? 'text-gold' : 'text-ink'}`}>{shortFull(match.away.name)}</span>
                {hasScore && <span className={`text-sm font-bold tabular-nums ${awayWon ? 'text-gold' : 'text-ink-mut'}`}>{match.awayScore}</span>}</>
            : <span className="text-[9px] text-ink-dim italic truncate flex-1">{match.awayLabel ?? 'A definir'}</span>
          }
        </div>
        {!isLive && fmtDate(match.utcDate) && (
          <div className="text-center text-[9px] text-ink-dim pb-0.5 leading-tight">
            {fmtDate(match.utcDate)}
            {match.venue && <div className="text-[8px] opacity-50 truncate px-1">📍 {match.venue}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function FinalCard({ match }) {
  const isLive     = match?.status === 'IN_PLAY' || match?.status === 'PAUSED';
  const isFinished = match?.status === 'FINISHED';
  const homeWon    = match?.winner === 'HOME_TEAM';
  const awayWon    = match?.winner === 'AWAY_TEAM';
  const hasScore   = match?.homeScore != null;
  const isPreview  = match && !match.home && !match.away;
  const slotH      = MH * 2;

  if (!match) {
    return (
      <div style={{ height: slotH, display: 'flex', alignItems: 'center' }}>
        <div style={{ border: '1px solid rgba(200,170,110,0.3)', background: 'rgba(200,170,110,0.04)', borderRadius: 5, margin: '0 2px', width: '100%', overflow: 'hidden' }}>
          <div className="flex items-center gap-1.5 px-2 py-1"><span className="opacity-20">🏳️</span><span className="text-[9px] text-ink-dim italic">A definir</span></div>
          <div style={{ borderTop: '1px solid rgba(200,170,110,0.15)', margin: '0 6px' }} />
          <div className="flex items-center gap-1.5 px-2 py-1"><span className="opacity-20">🏳️</span><span className="text-[9px] text-ink-dim italic">A definir</span></div>
        </div>
      </div>
    );
  }

  const borderColor = isPreview ? 'rgba(200,170,110,0.2)' : 'rgba(200,170,110,0.7)';
  const bgColor     = isPreview ? 'rgba(200,170,110,0.03)' : 'rgba(200,170,110,0.08)';

  return (
    <div style={{ height: slotH, display: 'flex', alignItems: 'center' }}>
      <div style={{ border: `1px solid ${borderColor}`, background: bgColor, borderRadius: 5, margin: '0 2px', width: '100%', overflow: 'hidden' }}>
        {isLive && (
          <div className="flex items-center justify-center gap-1 py-0.5" style={{ background: 'rgba(239,68,68,0.15)' }}>
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-[8px] font-bold text-red-400">AO VIVO</span>
          </div>
        )}
        <div className={`flex items-center gap-1.5 px-2 py-1 ${isFinished && awayWon ? 'opacity-40' : ''}`}>
          {match.home
            ? <><span className="text-sm leading-none">{match.home.flag}</span>
                <span className={`text-[11px] font-semibold truncate flex-1 ${homeWon ? 'text-gold' : 'text-ink'}`}>{shortFull(match.home.name)}</span>
                {hasScore && <span className="text-sm font-bold tabular-nums text-gold">{match.homeScore}</span>}</>
            : <span className="text-[9px] text-ink-dim italic truncate flex-1">{match.homeLabel ?? 'A definir'}</span>
          }
        </div>
        <div style={{ borderTop: `1px solid ${isPreview ? 'rgba(200,170,110,0.1)' : 'rgba(200,170,110,0.25)'}`, margin: '0 6px' }} />
        <div className={`flex items-center gap-1.5 px-2 py-1 ${isFinished && homeWon ? 'opacity-40' : ''}`}>
          {match.away
            ? <><span className="text-sm leading-none">{match.away.flag}</span>
                <span className={`text-[11px] font-semibold truncate flex-1 ${awayWon ? 'text-gold' : 'text-ink'}`}>{shortFull(match.away.name)}</span>
                {hasScore && <span className="text-sm font-bold tabular-nums text-gold">{match.awayScore}</span>}</>
            : <span className="text-[9px] text-ink-dim italic truncate flex-1">{match.awayLabel ?? 'A definir'}</span>
          }
        </div>
        {!isLive && fmtDate(match.utcDate) && (
          <div className={`text-center text-[9px] pb-0.5 leading-tight ${isPreview ? 'text-ink-dim' : 'text-gold/70'}`}>
            {fmtDate(match.utcDate)}
            {match.venue && <div className="text-[8px] opacity-50 truncate px-1">📍 {match.venue}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SVG Conectores ───────────────────────────────────────────────────────────
function Connector({ pairCount, matchH, mirrored }) {
  const c = '#18182e';
  const lines = [];
  for (let i = 0; i < pairCount; i++) {
    const by = i * 2 * matchH, mx = CN / 2;
    const m1y = by + matchH / 2, m2y = by + matchH * 3 / 2, mdy = by + matchH;
    const sx = mirrored ? CN : 0, dx = mirrored ? 0 : CN;
    lines.push(
      <path key={`a${i}`} d={`M${sx} ${m1y}H${mx}`}  stroke={c} strokeWidth="1.5" fill="none" />,
      <path key={`b${i}`} d={`M${mx} ${m1y}V${m2y}`} stroke={c} strokeWidth="1.5" fill="none" />,
      <path key={`c${i}`} d={`M${sx} ${m2y}H${mx}`}  stroke={c} strokeWidth="1.5" fill="none" />,
      <path key={`d${i}`} d={`M${mx} ${mdy}H${dx}`}  stroke={c} strokeWidth="1.5" fill="none" />,
    );
  }
  return <svg width={CN} height={pairCount * 2 * matchH} style={{ display: 'block', flexShrink: 0 }}>{lines}</svg>;
}

function HorzLine({ totalH, mirrored }) {
  const sx = mirrored ? CN : 0, dx = mirrored ? 0 : CN;
  return (
    <svg width={CN} height={totalH} style={{ display: 'block', flexShrink: 0 }}>
      <path d={`M${sx} ${totalH / 2}H${dx}`} stroke="#18182e" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function ColLabel({ label, width, highlight, sub }) {
  return (
    <div style={{ width, flexShrink: 0 }} className="text-center pb-1">
      <div className={`text-[9px] font-bold uppercase tracking-wide ${highlight ? 'text-gold' : 'text-ink-dim'}`}>{label}</div>
      {sub && <div className="text-[8px] text-ink-dim opacity-50">{sub}</div>}
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function Finais() {
  const { user }                    = useAuth();
  const playerId                    = user?.player_id ?? null;
  const [data, setData]             = useState(null);
  const [projection, setProjection] = useState(null);
  const [predsByMatch, setPredsByMatch] = useState({});
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const scrollRef                   = useRef(null);
  const timerRef                    = useRef(null);

  async function load() {
    try {
      const [d, proj] = await Promise.all([KnockoutAPI.get(), KnockoutAPI.projection()]);
      setData(d);
      const r32 = (d.stages ?? []).find(s => s.key === 'LAST_32')?.matches ?? [];
      setProjection(r32.some(m => m.home || m.away) ? null : proj);
      setError(null);
      const ids = (d.stages ?? []).flatMap(s => s.matches.map(m => m.dbMatchId)).filter(Boolean);
      if (ids.length) {
        const all = await PredictionsAPI.byMatches(ids).catch(() => []);
        const map = {};
        for (const p of all) {
          if (!map[p.match_id]) map[p.match_id] = [];
          map[p.match_id].push(p);
        }
        setPredsByMatch(map);
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const reloadSilent = useCallback(async () => {
    try {
      const [d, proj] = await Promise.all([KnockoutAPI.get(), KnockoutAPI.projection()]);
      setData(d);
      const r32 = (d.stages ?? []).find(s => s.key === 'LAST_32')?.matches ?? [];
      setProjection(r32.some(m => m.home || m.away) ? null : proj);
      const ids = (d.stages ?? []).flatMap(s => s.matches.map(m => m.dbMatchId)).filter(Boolean);
      if (ids.length) {
        const all = await PredictionsAPI.byMatches(ids).catch(() => []);
        const map = {};
        for (const p of all) {
          if (!map[p.match_id]) map[p.match_id] = [];
          map[p.match_id].push(p);
        }
        setPredsByMatch(map);
      }
    } catch {}
  }, []);

  // SSE: atualiza instantaneamente quando scoresFetcher grava placar no banco
  useSSE({ result: reloadSilent, ranking: reloadSilent });

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 120_000); // fallback a cada 2min
    return () => clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (!scrollRef.current || loading) return;
    const el = scrollRef.current;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [loading]);

  if (loading) return <div className="flex items-center justify-center py-20"><span className="text-3xl animate-spin">⚽</span></div>;
  if (error)   return (
    <div className="text-center py-12 space-y-3">
      <p className="text-4xl">😕</p><p className="text-ink-dim text-sm">{error}</p>
      <button onClick={load} className="px-4 py-2 rounded-lg bg-gold text-bg-900 text-sm font-semibold">Tentar novamente</button>
    </div>
  );

  const stages = data?.stages ?? [];
  const getMs  = (key) => stages.find(s => s.key === key)?.matches ?? [];

  const officialR32    = getMs('LAST_32');
  const hasOfficialR32 = officialR32.some(m => m.home || m.away);
  const rawR32         = hasOfficialR32 ? officialR32 : (projection?.matches ?? []);
  const isProj         = !hasOfficialR32 && !!projection;

  const r32L = fill(rawR32.slice(0, 8), 8);
  const r32R = fill(rawR32.slice(8),    8);
  const r16L = fill(getMs('LAST_16').slice(0, 4), 4);
  const r16R = fill(getMs('LAST_16').slice(4),    4);
  const qfL  = fill(getMs('QUARTER_FINALS').slice(0, 2), 2);
  const qfR  = fill(getMs('QUARTER_FINALS').slice(2),    2);
  const sfL  = fill(getMs('SEMI_FINALS').slice(0, 1), 1);
  const sfR  = fill(getMs('SEMI_FINALS').slice(1),    1);
  const fin  = getMs('FINAL')[0] ?? null;
  const tp   = getMs('THIRD_PLACE')[0] ?? null;

  const TOTAL_H = 8 * R32H;
  const TOTAL_W = 4 * CW + 4 * CN + FW + 4 * CN + 4 * CW;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-xl font-bold text-gold font-display">🏆 Mata-Mata · Copa 2026</h1>
        <p className="text-xs text-ink-dim mt-0.5">Palpite nos jogos abaixo · O chaveamento atualiza automaticamente</p>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SEÇÃO 1 — PALPITES
          ══════════════════════════════════════════════════════════════════ */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="h-px flex-1 bg-line" />
          <span className="text-sm font-bold text-ink">🎯 Seus Palpites</span>
          <div className="h-px flex-1 bg-line" />
        </div>
        <PredictList stages={stages} projection={projection} playerId={playerId} predsByMatch={predsByMatch} onSaved={reloadSilent} />
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SEÇÃO 2 — CHAVEAMENTO (só visual)
          ══════════════════════════════════════════════════════════════════ */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <div className="h-px flex-1 bg-line" />
          <span className="text-sm font-bold text-ink">📊 Chaveamento</span>
          <div className="h-px flex-1 bg-line" />
        </div>

        {isProj && (
          <p className="text-center text-[11px] mb-3" style={{ color: '#a5b4fc' }}>
            📊 Prévia não oficial baseada na classificação atual · Times e chaveamento confirmam automaticamente ao final dos grupos
          </p>
        )}

        <div ref={scrollRef} className="overflow-x-auto rounded-xl"
          style={{ WebkitOverflowScrolling: 'touch', background: 'rgba(6,6,18,0.95)', padding: '12px 6px 10px' }}>
          <div style={{ minWidth: TOTAL_W }}>
            {/* Labels */}
            <div className="flex mb-2">
              <ColLabel width={CW} label={isProj ? 'R32 📊' : 'Rodada 32'} sub="28 jun" />
              <div style={{ width: CN, flexShrink: 0 }} />
              <ColLabel width={CW} label="Oitavas" sub="4 jul" />
              <div style={{ width: CN, flexShrink: 0 }} />
              <ColLabel width={CW} label="Quartas" sub="11 jul" />
              <div style={{ width: CN, flexShrink: 0 }} />
              <ColLabel width={CW} label="Semifinal" sub="15 jul" />
              <div style={{ width: CN, flexShrink: 0 }} />
              <ColLabel width={FW} label="✦ FINAL ✦" sub="19 jul" highlight />
              <div style={{ width: CN, flexShrink: 0 }} />
              <ColLabel width={CW} label="Semifinal" sub="15 jul" />
              <div style={{ width: CN, flexShrink: 0 }} />
              <ColLabel width={CW} label="Quartas" sub="11 jul" />
              <div style={{ width: CN, flexShrink: 0 }} />
              <ColLabel width={CW} label="Oitavas" sub="4 jul" />
              <div style={{ width: CN, flexShrink: 0 }} />
              <ColLabel width={CW} label={isProj ? 'R32 📊' : 'Rodada 32'} sub="28 jun" />
            </div>

            {/* Bracket */}
            <div style={{ display: 'flex', height: TOTAL_H }}>
              {/* ─ Lado Esquerdo ─ */}
              <div style={{ width: CW, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                {r32L.map((m, i) => <R32Card key={i} match={m} />)}
              </div>
              <Connector pairCount={4} matchH={R32H} />
              <div style={{ width: CW, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                {r16L.map((m, i) => <PhaseCard key={i} match={m} slotH={MH} />)}
              </div>
              <Connector pairCount={2} matchH={MH} />
              <div style={{ width: CW, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                {qfL.map((m, i) => <PhaseCard key={i} match={m} slotH={MH * 2} />)}
              </div>
              <Connector pairCount={1} matchH={MH * 2} />
              <div style={{ width: CW, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                {sfL.map((m, i) => <PhaseCard key={i} match={m} slotH={MH * 4} />)}
              </div>
              <HorzLine totalH={TOTAL_H} />

              {/* ─ Final ─ */}
              <div style={{ width: FW, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                <FinalCard match={fin} />
              </div>

              <HorzLine totalH={TOTAL_H} mirrored />
              {/* ─ Lado Direito ─ */}
              <div style={{ width: CW, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                {sfR.map((m, i) => <PhaseCard key={i} match={m} slotH={MH * 4} />)}
              </div>
              <Connector pairCount={1} matchH={MH * 2} mirrored />
              <div style={{ width: CW, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                {qfR.map((m, i) => <PhaseCard key={i} match={m} slotH={MH * 2} />)}
              </div>
              <Connector pairCount={2} matchH={MH} mirrored />
              <div style={{ width: CW, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                {r16R.map((m, i) => <PhaseCard key={i} match={m} slotH={MH} />)}
              </div>
              <Connector pairCount={4} matchH={R32H} mirrored />
              <div style={{ width: CW, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                {r32R.map((m, i) => <R32Card key={i} match={m} />)}
              </div>
            </div>
          </div>
          <p className="text-center text-[9px] text-ink-dim mt-2 select-none opacity-50">← deslize para ver o chaveamento completo →</p>
        </div>

        {/* 3º lugar */}
        {tp && (
          <div className="mt-3 rounded-xl border border-line p-3 bg-bg-800/40">
            <p className="text-center text-[11px] font-bold text-ink-dim mb-2">🥉 Disputa de 3º Lugar</p>
            <div style={{ maxWidth: 160, margin: '0 auto' }}>
              <PhaseCard match={tp} slotH={MH} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
