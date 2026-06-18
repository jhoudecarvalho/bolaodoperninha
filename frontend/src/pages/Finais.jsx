import { useEffect, useRef, useState } from 'react';
import { KnockoutAPI } from '../api/client.js';

const STAGE_STYLE = {
  LAST_32:        { color: '#6366f1', bg: 'rgba(99,102,241,0.1)',  emoji: '32' },
  LAST_16:        { color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',  emoji: '16' },
  QUARTER_FINALS: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  emoji: '⚔️' },
  SEMI_FINALS:    { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    emoji: '🔥' },
  THIRD_PLACE:    { color: '#6b7280', bg: 'rgba(107,114,128,0.1)', emoji: '🥉' },
  FINAL:          { color: '#c8aa6e', bg: 'rgba(200,170,110,0.15)', emoji: '🏆' },
};

function formatDate(utcDate) {
  const d = new Date(utcDate);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', weekday: 'short' });
}

function formatTime(utcDate) {
  const d = new Date(utcDate);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatCountdown(utcDate) {
  const diff = new Date(utcDate) - Date.now();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return `em ${d}d ${h}h`;
  if (h > 0) return `em ${h}h ${m}m`;
  return `em ${m}min`;
}

function TeamSlot({ team, score, isWinner, pending }) {
  return (
    <div className={`flex items-center gap-2 flex-1 ${isWinner ? 'opacity-100' : score != null ? 'opacity-50' : 'opacity-100'}`}>
      {team ? (
        <>
          <span className="text-xl leading-none">{team.flag}</span>
          <span className={`text-sm font-semibold truncate ${isWinner ? 'text-gold' : 'text-ink'}`}>
            {team.name}
          </span>
        </>
      ) : (
        <>
          <span className="h-6 w-6 rounded-full bg-bg-700 border border-line flex items-center justify-center text-[10px] text-ink-dim">?</span>
          <span className="text-sm text-ink-dim italic">A definir</span>
        </>
      )}
    </div>
  );
}

function MatchCard({ match, stageKey }) {
  const style = STAGE_STYLE[stageKey] ?? STAGE_STYLE.LAST_32;
  const isFinal = stageKey === 'FINAL';
  const isLive = match.status === 'IN_PLAY' || match.status === 'PAUSED';
  const isFinished = match.status === 'FINISHED';
  const hasScore = match.homeScore != null && match.awayScore != null;
  const countdown = !isFinished && !isLive ? formatCountdown(match.utcDate) : null;

  const homeWon = match.winner === 'HOME_TEAM';
  const awayWon = match.winner === 'AWAY_TEAM';

  return (
    <div
      className={`rounded-xl border overflow-hidden ${isFinal ? 'shadow-lg' : ''}`}
      style={{
        borderColor: isLive ? style.color : 'var(--color-line, #1a1a30)',
        background: isLive ? style.bg : isFinal ? style.bg : 'var(--color-bg-800, #111128)',
        boxShadow: isLive ? `0 0 0 1px ${style.color}40` : undefined,
      }}
    >
      {/* Data/status header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b"
        style={{ borderColor: 'var(--color-line, #1a1a30)' }}>
        <span className="text-[11px] text-ink-dim">
          {formatDate(match.utcDate)} · {formatTime(match.utcDate)}
        </span>
        {isLive && (
          <span className="flex items-center gap-1 text-[11px] font-bold text-red-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            AO VIVO
          </span>
        )}
        {isFinished && <span className="text-[11px] text-ink-dim">Encerrado</span>}
        {countdown && <span className="text-[11px] text-ink-dim">{countdown}</span>}
      </div>

      {/* Confronto */}
      <div className="px-3 py-3 flex items-center gap-2">
        <TeamSlot team={match.home} score={match.homeScore} isWinner={homeWon} />

        {/* Placar ou VS */}
        <div className="flex flex-col items-center shrink-0 min-w-[48px]">
          {hasScore ? (
            <div className="flex items-center gap-1">
              <span className={`text-xl font-bold tabular-nums ${homeWon ? 'text-gold' : 'text-ink'}`}>
                {match.homeScore}
              </span>
              <span className="text-ink-dim text-sm">×</span>
              <span className={`text-xl font-bold tabular-nums ${awayWon ? 'text-gold' : 'text-ink'}`}>
                {match.awayScore}
              </span>
            </div>
          ) : (
            <span className="text-sm font-bold text-ink-dim">×</span>
          )}
          {isFinished && match.winner === 'DRAW' && (
            <span className="text-[10px] text-ink-dim mt-0.5">Prorrogação</span>
          )}
        </div>

        {/* Away — invertido (flag à direita) */}
        <div className={`flex items-center gap-2 flex-1 justify-end ${awayWon ? 'opacity-100' : hasScore ? 'opacity-50' : 'opacity-100'}`}>
          {match.away ? (
            <>
              <span className={`text-sm font-semibold truncate text-right ${awayWon ? 'text-gold' : 'text-ink'}`}>
                {match.away.name}
              </span>
              <span className="text-xl leading-none">{match.away.flag}</span>
            </>
          ) : (
            <>
              <span className="text-sm text-ink-dim italic">A definir</span>
              <span className="h-6 w-6 rounded-full bg-bg-700 border border-line flex items-center justify-center text-[10px] text-ink-dim">?</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StageSection({ stage, isActive, onSelect }) {
  const style = STAGE_STYLE[stage.key] ?? STAGE_STYLE.LAST_32;
  const defined = stage.matches.filter((m) => m.home || m.away).length;
  const finished = stage.matches.filter((m) => m.status === 'FINISHED').length;
  const total = stage.matches.length;

  return (
    <section>
      {/* Stage header — clicável para fechar/abrir */}
      <button
        onClick={onSelect}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl mb-3 text-left"
        style={{ background: style.bg, border: `1px solid ${style.color}40` }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{style.emoji}</span>
          <div>
            <p className="font-bold text-sm" style={{ color: style.color }}>{stage.label}</p>
            <p className="text-[11px] text-ink-dim">
              {defined === 0
                ? `${total} jogos · Times a definir`
                : `${finished}/${total} jogos`}
            </p>
          </div>
        </div>
        <span className="text-ink-dim text-lg">{isActive ? '▲' : '▼'}</span>
      </button>

      {isActive && (
        <div className="space-y-2 mb-6">
          {stage.matches.length === 0 ? (
            <p className="text-center text-ink-dim text-sm py-4">Jogos ainda não definidos</p>
          ) : (
            stage.matches.map((m) => (
              <MatchCard key={m.id} match={m} stageKey={stage.key} />
            ))
          )}
        </div>
      )}
    </section>
  );
}

export default function Finais() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeStages, setActiveStages] = useState(new Set());
  const timerRef = useRef(null);

  async function load() {
    try {
      const d = await KnockoutAPI.get();
      setData(d);
      setError(null);

      // Abre automaticamente fases com jogos ao vivo ou próximos
      const now = Date.now();
      const toOpen = new Set();
      for (const s of d.stages ?? []) {
        const hasLive = s.matches.some((m) => m.status === 'IN_PLAY' || m.status === 'PAUSED');
        const hasUpcoming = s.matches.some((m) => {
          const diff = new Date(m.utcDate) - now;
          return diff > 0 && diff < 7 * 86400_000; // próximos 7 dias
        });
        const allFinished = s.matches.length > 0 && s.matches.every((m) => m.status === 'FINISHED');
        if (hasLive || hasUpcoming) toOpen.add(s.key);
        // Mantém aberta a fase mais avançada com algum jogo
        if (s.matches.some((m) => m.home || m.away) && !allFinished) toOpen.add(s.key);
      }
      // Se nada aberto, abre a primeira fase
      if (toOpen.size === 0 && d.stages?.length) toOpen.add(d.stages[0].key);
      setActiveStages((prev) => prev.size === 0 ? toOpen : prev);
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

  function toggleStage(key) {
    setActiveStages((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-2xl animate-spin">⚽</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-3">😕</p>
        <p className="text-ink-dim text-sm">{error}</p>
        <button onClick={load} className="mt-4 px-4 py-2 rounded-lg bg-gold text-bg-900 text-sm font-semibold">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1 max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-gold font-display">🏆 Mata-Mata</h1>
        <p className="text-xs text-ink-dim mt-1">
          Times definidos conforme avançam na fase de grupos
        </p>
      </div>

      {/* Fases */}
      {(data?.stages ?? []).map((stage) => (
        <StageSection
          key={stage.key}
          stage={stage}
          isActive={activeStages.has(stage.key)}
          onSelect={() => toggleStage(stage.key)}
        />
      ))}
    </div>
  );
}
