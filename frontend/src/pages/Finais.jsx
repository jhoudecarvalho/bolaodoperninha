import { useEffect, useRef, useState } from 'react';
import { KnockoutAPI } from '../api/client.js';

// ─── Dimensões do bracket ────────────────────────────────────────────────────
const MH = 80;   // altura do slot em LAST_16
const CW = 94;   // largura de cada coluna de fase
const CN = 22;   // largura dos conectores
const FW = 116;  // largura da coluna da Final

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fill(arr, n) {
  return [...arr, ...Array(Math.max(0, n - arr.length)).fill(null)];
}

function shortName(name) {
  if (!name) return '';
  if (name.length <= 11) return name;
  return name.slice(0, 10) + '…';
}

function formatDate(utc) {
  if (!utc) return null;
  const d = new Date(utc);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

// ─── Componentes do bracket ───────────────────────────────────────────────────

function TeamRow({ team, label, score, won, dim, isProj }) {
  return (
    <div className={`flex items-center gap-1.5 px-1.5 py-1 ${dim ? 'opacity-40' : ''}`}>
      {team ? (
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm leading-none shrink-0">{team.flag}</span>
            <span className={`text-[11px] font-semibold truncate ${won ? 'text-gold' : 'text-ink'}`}>
              {shortName(team.name)}
            </span>
            {score != null && (
              <span className={`text-sm font-bold tabular-nums ml-auto shrink-0 ${won ? 'text-gold' : 'text-ink-mut'}`}>
                {score}
              </span>
            )}
          </div>
          {isProj && label && (
            <div className="text-[9px] text-ink-dim leading-none mt-0.5 pl-5">{label}</div>
          )}
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm leading-none shrink-0 opacity-20">⬜</span>
            <span className="text-[10px] text-ink-dim italic">{label ?? 'A definir'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MatchSlot({ match, slotH, isFinal }) {
  if (!match) {
    return (
      <div style={{ height: slotH, display: 'flex', alignItems: 'center' }}>
        <div
          className="w-full rounded overflow-hidden"
          style={{ border: '1px solid rgba(40,40,70,0.8)', background: 'rgba(10,10,28,0.7)', margin: '0 2px' }}
        >
          <div className="flex items-center gap-1 px-1.5 py-1">
            <span className="text-sm opacity-20">⬜</span>
            <span className="text-[10px] text-ink-dim italic">A definir</span>
          </div>
          <div style={{ borderTop: '1px solid rgba(40,40,70,0.8)', margin: '0 6px' }} />
          <div className="flex items-center gap-1 px-1.5 py-1">
            <span className="text-sm opacity-20">⬜</span>
            <span className="text-[10px] text-ink-dim italic">A definir</span>
          </div>
        </div>
      </div>
    );
  }

  const isProj     = match.isProjection;
  const isLive     = match.status === 'IN_PLAY' || match.status === 'PAUSED';
  const isFinished = match.status === 'FINISHED';
  const homeWon    = match.winner === 'HOME_TEAM';
  const awayWon    = match.winner === 'AWAY_TEAM';
  const hasScore   = match.homeScore != null;
  const date       = formatDate(match.utcDate);

  const borderColor = isFinal
    ? 'rgba(200,170,110,0.7)'
    : isLive
    ? 'rgba(239,68,68,0.7)'
    : isProj
    ? 'rgba(99,102,241,0.5)'
    : 'rgba(40,40,70,0.9)';

  const bg = isFinal
    ? 'rgba(200,170,110,0.08)'
    : isLive
    ? 'rgba(239,68,68,0.05)'
    : isProj
    ? 'rgba(99,102,241,0.04)'
    : 'rgba(10,10,28,0.85)';

  return (
    <div style={{ height: slotH, display: 'flex', alignItems: 'center' }}>
      <div
        className="w-full rounded overflow-hidden"
        style={{ border: `1px solid ${borderColor}`, background: bg, margin: '0 2px' }}
      >
        {isLive && (
          <div className="flex items-center justify-center gap-1 py-0.5" style={{ background: 'rgba(239,68,68,0.15)' }}>
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-[9px] font-bold text-red-400 tracking-wide">AO VIVO</span>
          </div>
        )}
        {isProj && (
          <div className="flex items-center justify-center py-0.5" style={{ background: 'rgba(99,102,241,0.12)' }}>
            <span className="text-[9px] font-semibold" style={{ color: '#a5b4fc' }}>📊 PROJEÇÃO</span>
          </div>
        )}
        <TeamRow
          team={match.home}
          label={match.homeLabel}
          score={hasScore ? match.homeScore : undefined}
          won={homeWon}
          dim={isFinished && awayWon}
          isProj={isProj}
        />
        <div style={{ borderTop: '1px solid rgba(40,40,70,0.8)', margin: '0 6px' }} />
        <TeamRow
          team={match.away}
          label={match.awayLabel}
          score={hasScore ? match.awayScore : undefined}
          won={awayWon}
          dim={isFinished && homeWon}
          isProj={isProj}
        />
        {!isLive && !isProj && date && (
          <div className="text-center text-[9px] text-ink-dim pb-0.5">{date}</div>
        )}
      </div>
    </div>
  );
}

// Conectores SVG entre colunas
function Connector({ pairCount, matchH, mirrored }) {
  const color = '#252540';
  const lines = [];
  for (let i = 0; i < pairCount; i++) {
    const baseY = i * 2 * matchH;
    const m1y   = baseY + matchH / 2;
    const m2y   = baseY + matchH * 3 / 2;
    const midY  = baseY + matchH;
    const midX  = CN / 2;
    const srcX  = mirrored ? CN : 0;
    const dstX  = mirrored ? 0 : CN;
    lines.push(
      <path key={`a${i}`} d={`M${srcX} ${m1y}H${midX}`} stroke={color} strokeWidth="1.5" fill="none" />,
      <path key={`b${i}`} d={`M${midX} ${m1y}V${m2y}`} stroke={color} strokeWidth="1.5" fill="none" />,
      <path key={`c${i}`} d={`M${srcX} ${m2y}H${midX}`} stroke={color} strokeWidth="1.5" fill="none" />,
      <path key={`d${i}`} d={`M${midX} ${midY}H${dstX}`} stroke={color} strokeWidth="1.5" fill="none" />,
    );
  }
  return (
    <svg width={CN} height={pairCount * 2 * matchH} style={{ display: 'block', flexShrink: 0 }}>
      {lines}
    </svg>
  );
}

function HorzLine({ totalH, mirrored }) {
  const midY = totalH / 2;
  const srcX = mirrored ? CN : 0;
  const dstX = mirrored ? 0 : CN;
  return (
    <svg width={CN} height={totalH} style={{ display: 'block', flexShrink: 0 }}>
      <path d={`M${srcX} ${midY}H${dstX}`} stroke="#252540" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function ColLabel({ label, width, highlight }) {
  return (
    <div
      style={{ width, flexShrink: 0 }}
      className={`text-center text-[10px] font-bold uppercase tracking-wide pb-2 ${highlight ? 'text-gold' : 'text-ink-dim'}`}
    >
      {label}
    </div>
  );
}

// ─── Seção LAST_32 colapsável ─────────────────────────────────────────────────
function R32Section({ matches, isProjection }) {
  const [open, setOpen] = useState(true);
  if (!matches.length) return null;

  return (
    <div className="rounded-xl border border-line overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-bg-800 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-ink">Rodada de 32</span>
          {isProjection
            ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>📊 projeção</span>
            : <span className="text-[10px] text-ink-dim">· dados oficiais</span>
          }
        </div>
        <span className="text-ink-dim text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="grid grid-cols-2 gap-2 p-3 bg-bg-900/50">
          {matches.map((m, i) => (
            <div
              key={m?.id ?? i}
              className="rounded overflow-hidden"
              style={{
                border: m?.isProjection ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(40,40,70,0.8)',
                background: m?.isProjection ? 'rgba(99,102,241,0.04)' : 'rgba(10,10,28,0.85)',
              }}
            >
              {m ? (
                <>
                  {m.isProjection && (
                    <div className="text-center py-0.5 text-[9px] font-semibold" style={{ color: '#818cf8', background: 'rgba(99,102,241,0.1)' }}>
                      📊 PROJEÇÃO
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    {m.home ? (
                      <>
                        <span className="text-sm">{m.home.flag}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium text-ink truncate">{shortName(m.home.name)}</div>
                          {m.isProjection && m.homeLabel && <div className="text-[9px] text-ink-dim">{m.homeLabel}</div>}
                        </div>
                        {m.homeScore != null && <span className="text-xs font-bold text-gold">{m.homeScore}</span>}
                      </>
                    ) : (
                      <span className="text-[10px] text-ink-dim italic">{m.homeLabel ?? 'A definir'}</span>
                    )}
                  </div>
                  <div style={{ borderTop: '1px solid rgba(40,40,70,0.8)', margin: '0 6px' }} />
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    {m.away ? (
                      <>
                        <span className="text-sm">{m.away.flag}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium text-ink truncate">{shortName(m.away.name)}</div>
                          {m.isProjection && m.awayLabel && <div className="text-[9px] text-ink-dim">{m.awayLabel}</div>}
                        </div>
                        {m.awayScore != null && <span className="text-xs font-bold text-gold">{m.awayScore}</span>}
                      </>
                    ) : (
                      <span className="text-[10px] text-ink-dim italic">{m.awayLabel ?? 'A definir'}</span>
                    )}
                  </div>
                  {!m.isProjection && formatDate(m.utcDate) && (
                    <div className="text-center text-[9px] text-ink-dim pb-1">{formatDate(m.utcDate)}</div>
                  )}
                </>
              ) : (
                <div className="px-2 py-3 text-[10px] text-ink-dim text-center italic">A definir</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Finais() {
  const [data, setData]             = useState(null);
  const [projection, setProjection] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const scrollRef                   = useRef(null);
  const timerRef                    = useRef(null);

  async function load() {
    try {
      const d = await KnockoutAPI.get();
      setData(d);

      // Busca projeção enquanto LAST_32 não tiver times oficiais
      const r32 = (d.stages ?? []).find(s => s.key === 'LAST_32')?.matches ?? [];
      const hasOfficialTeams = r32.some(m => m.home || m.away);
      if (!hasOfficialTeams) {
        const proj = await KnockoutAPI.projection();
        setProjection(proj);
      } else {
        setProjection(null); // dados oficiais chegaram → descarta projeção
      }

      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 60_000);
    return () => clearInterval(timerRef.current);
  }, []);

  // Centraliza scroll na Final ao carregar
  useEffect(() => {
    if (!scrollRef.current || loading) return;
    const el = scrollRef.current;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [loading]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <span className="text-3xl animate-spin">⚽</span>
    </div>
  );

  if (error) return (
    <div className="text-center py-12 space-y-3">
      <p className="text-4xl">😕</p>
      <p className="text-ink-dim text-sm">{error}</p>
      <button onClick={load} className="px-4 py-2 rounded-lg bg-gold text-bg-900 text-sm font-semibold">
        Tentar novamente
      </button>
    </div>
  );

  const getMatches = (key) =>
    (data?.stages ?? []).find(s => s.key === key)?.matches ?? [];

  const officialR32      = getMatches('LAST_32');
  const hasOfficialR32   = officialR32.some(m => m.home || m.away);
  const r32Matches       = hasOfficialR32 ? officialR32 : (projection?.matches ?? []);
  const r32IsProjection  = !hasOfficialR32 && !!projection;

  const r16 = getMatches('LAST_16');
  const qf  = getMatches('QUARTER_FINALS');
  const sf  = getMatches('SEMI_FINALS');
  const fin = getMatches('FINAL')[0] ?? null;
  const tp  = getMatches('THIRD_PLACE')[0] ?? null;

  const r16L = fill(r16.slice(0, 4), 4);
  const r16R = fill(r16.slice(4),    4);
  const qfL  = fill(qf.slice(0, 2),  2);
  const qfR  = fill(qf.slice(2),     2);
  const sfL  = fill(sf.slice(0, 1),  1);
  const sfR  = fill(sf.slice(1),     1);

  const bracketH = 4 * MH;
  const bracketW = 3 * CW + 3 * CN + FW + 3 * CN + 3 * CW;

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-xl font-bold text-gold font-display">🏆 Mata-Mata · Copa 2026</h1>
        <p className="text-xs text-ink-dim mt-0.5">Times definidos conforme avançam nos grupos</p>
      </div>

      {/* Aviso de projeção */}
      {r32IsProjection && (
        <div
          className="rounded-xl px-4 py-2.5 text-sm text-center"
          style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}
        >
          📊 <strong>Projeção</strong> — baseada na classificação atual dos grupos. Os times oficiais chegam automaticamente quando os grupos terminarem.
        </div>
      )}

      {/* Rodada de 32 */}
      <R32Section matches={r32Matches} isProjection={r32IsProjection} />

      {/* Bracket principal (LAST_16 → FINAL) */}
      <div
        ref={scrollRef}
        className="overflow-x-auto rounded-xl"
        style={{ WebkitOverflowScrolling: 'touch', background: 'rgba(8,8,24,0.85)', padding: '14px 6px 10px' }}
      >
        <div style={{ minWidth: bracketW }}>
          {/* Labels das fases */}
          <div className="flex mb-1">
            <ColLabel label="Oitavas"   width={CW} />
            <div style={{ width: CN, flexShrink: 0 }} />
            <ColLabel label="Quartas"   width={CW} />
            <div style={{ width: CN, flexShrink: 0 }} />
            <ColLabel label="Semifinal" width={CW} />
            <div style={{ width: CN, flexShrink: 0 }} />
            <ColLabel label="✦ FINAL ✦" width={FW} highlight />
            <div style={{ width: CN, flexShrink: 0 }} />
            <ColLabel label="Semifinal" width={CW} />
            <div style={{ width: CN, flexShrink: 0 }} />
            <ColLabel label="Quartas"   width={CW} />
            <div style={{ width: CN, flexShrink: 0 }} />
            <ColLabel label="Oitavas"   width={CW} />
          </div>

          {/* Bracket */}
          <div style={{ display: 'flex', height: bracketH }}>
            {/* ── Lado Esquerdo ───────────────────────── */}
            <div style={{ width: CW, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              {r16L.map((m, i) => <MatchSlot key={i} match={m} slotH={MH} />)}
            </div>
            <Connector pairCount={2} matchH={MH} />
            <div style={{ width: CW, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              {qfL.map((m, i) => <MatchSlot key={i} match={m} slotH={MH * 2} />)}
            </div>
            <Connector pairCount={1} matchH={MH * 2} />
            <div style={{ width: CW, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              {sfL.map((m, i) => <MatchSlot key={i} match={m} slotH={MH * 4} />)}
            </div>
            <HorzLine totalH={bracketH} />

            {/* ── Final ───────────────────────────────── */}
            <div style={{ width: FW, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
              <MatchSlot match={fin} slotH={MH * 2} isFinal />
            </div>

            <HorzLine totalH={bracketH} mirrored />
            {/* ── Lado Direito (espelho) ───────────────── */}
            <div style={{ width: CW, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              {sfR.map((m, i) => <MatchSlot key={i} match={m} slotH={MH * 4} />)}
            </div>
            <Connector pairCount={1} matchH={MH * 2} mirrored />
            <div style={{ width: CW, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              {qfR.map((m, i) => <MatchSlot key={i} match={m} slotH={MH * 2} />)}
            </div>
            <Connector pairCount={2} matchH={MH} mirrored />
            <div style={{ width: CW, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              {r16R.map((m, i) => <MatchSlot key={i} match={m} slotH={MH} />)}
            </div>
          </div>
        </div>

        <p className="text-center text-[10px] text-ink-dim mt-2 select-none">
          ← deslize para ver o bracket completo →
        </p>
      </div>

      {/* 3º lugar */}
      {tp && (
        <div className="rounded-xl border border-line p-3 bg-bg-800/50">
          <p className="text-center text-[11px] font-bold text-ink-dim mb-2">🥉 Disputa de 3º Lugar</p>
          <div style={{ maxWidth: CW + 20, margin: '0 auto' }}>
            <MatchSlot match={tp} slotH={MH} />
          </div>
        </div>
      )}
    </div>
  );
}
