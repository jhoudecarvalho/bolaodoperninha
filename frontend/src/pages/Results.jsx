import { useEffect, useState } from 'react';
import { MatchesAPI, ResultsAPI } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { formatLocal } from '../utils/datetime.js';

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export default function Results() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [group, setGroup] = useState('A');
  const [matches, setMatches] = useState([]);
  const [msg, setMsg] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncingMatches, setSyncingMatches] = useState(false);
  const [acertadores, setAcertadores] = useState({});

  async function load() {
    const [data, acc] = await Promise.all([
      MatchesAPI.list({ group }),
      ResultsAPI.acertadores(group),
    ]);
    setMatches(data);
    setAcertadores(acc);
  }
  useEffect(() => {
    load();
  }, [group]);

  // Auto-refresh a cada 60s enquanto houver jogo ao vivo no grupo
  useEffect(() => {
    const hasLive = matches.some((m) => m.status === 'live');
    if (!hasLive) return;
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [matches, group]);

  async function handleSync() {
    setSyncing(true);
    setMsg(null);
    try {
      const r = await ResultsAPI.sync();
      setMsg({ type: 'ok', text: `Sync: ${r.updated} resultado(s) atualizados.` });
      await load();
    } catch {
      setMsg({ type: 'err', text: 'Falha ao sincronizar com a API.' });
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncMatches() {
    setSyncingMatches(true);
    setMsg(null);
    try {
      const r = await MatchesAPI.sync();
      setMsg({
        type: 'ok',
        text: `Jogos atualizados da API: ${r.updated} atualizados, ${r.inserted} novos.`,
      });
      await load();
    } catch {
      setMsg({ type: 'err', text: 'Falha ao buscar os jogos na API.' });
    } finally {
      setSyncingMatches(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold">📊 Resultados</h1>
        <div className="flex gap-2">
          {isAdmin && (
            <button className="btn-ghost text-sm" onClick={handleSyncMatches} disabled={syncingMatches}>
              {syncingMatches ? 'Atualizando...' : '🗓️ Atualizar jogos (API)'}
            </button>
          )}
          <button className="btn-ghost text-sm" onClick={handleSync} disabled={syncing}>
            {syncing ? 'Sincronizando...' : '📡 Sincronizar placares'}
          </button>
        </div>
      </div>

      <p className="text-sm text-ink-mut">
        Os placares são atualizados automaticamente pela API oficial.
      </p>

      <div className="flex flex-wrap gap-2">
        {GROUPS.map((g) => (
          <button
            key={g}
            onClick={() => setGroup(g)}
            className={`btn h-10 w-10 ${
              group === g ? 'bg-gold text-bg-900' : 'border border-line-light hover:bg-bg-800'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {msg && (
        <p className={`text-sm ${msg.type === 'ok' ? 'text-ok' : 'text-danger'}`}>{msg.text}</p>
      )}

      <div className="space-y-3">
        {matches.map((m) => {
          const isLive = m.status === 'live';
          const hasResult = m.home_score != null && m.away_score != null;
          return (
            <div key={m.id} className={`card p-4 ${isLive ? 'border-ok/50' : ''}`}>
              <div className="mb-2 flex items-center justify-between text-xs text-ink-mut">
                <span>{formatLocal(m.kick_off_utc)}</span>
                {isLive ? (
                  <span className="badge animate-pulse bg-ok/20 text-ok">🟢 AO VIVO</span>
                ) : hasResult ? (
                  <span
                    className={`badge ${
                      m.result_source === 'manual' ? 'bg-gold/20 text-gold' : 'bg-danger/20 text-danger'
                    }`}
                  >
                    {m.result_source === 'manual' ? '✍️ Manual' : '🔴 ENCERRADO'}
                  </span>
                ) : (
                  <span className="badge bg-bg-800 text-ink-dim">⏳ A definir</span>
                )}
              </div>

              {/* Mobile: times em colunas, placar centralizado */}
              <div className="space-y-4 sm:hidden">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
                    <span className="text-3xl leading-none">{m.home_flag}</span>
                    <span className="font-medium leading-snug">{m.home_name}</span>
                  </div>
                  <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
                    <span className="text-3xl leading-none">{m.away_flag}</span>
                    <span className="font-medium leading-snug">{m.away_name}</span>
                  </div>
                </div>

                <div className={`flex items-center justify-center gap-3 text-3xl font-bold ${isLive ? 'text-ok' : ''}`}>
                  <span>{hasResult ? m.home_score : '–'}</span>
                  <span className="text-lg text-ink-dim">×</span>
                  <span>{hasResult ? m.away_score : '–'}</span>
                </div>
              </div>

              {/* Desktop: layout horizontal */}
              <div className="hidden sm:block">
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 items-center justify-end gap-2 text-right">
                    <span className="font-medium">{m.home_name}</span>
                    <span className="text-2xl">{m.home_flag}</span>
                  </div>

                  <div className={`flex items-center gap-3 px-4 text-2xl font-bold ${isLive ? 'text-ok' : ''}`}>
                    <span>{hasResult ? m.home_score : '–'}</span>
                    <span className="text-base text-ink-dim">×</span>
                    <span>{hasResult ? m.away_score : '–'}</span>
                  </div>

                  <div className="flex flex-1 items-center gap-2">
                    <span className="text-2xl">{m.away_flag}</span>
                    <span className="font-medium">{m.away_name}</span>
                  </div>
                </div>
              </div>

              {/* Acertadores / acertando agora */}
              {hasResult && (() => {
                const winners = acertadores[m.id] || [];
                const label = isLive
                  ? `🎯 Acertando agora (${winners.length}):`
                  : `🎯 Acertaram (${winners.length}):`;
                const empty = isLive
                  ? 'Ninguém está acertando o placar parcial.'
                  : 'Ninguém acertou o placar exato.';
                return (
                  <div className="mt-3 border-t border-line-light pt-3 text-sm">
                    {winners.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-medium ${isLive ? 'text-ok' : 'text-ok'}`}>{label}</span>
                        {winners.map((w) => (
                          <span
                            key={w.player_id}
                            className="rounded-full px-2 py-0.5 text-xs font-medium text-bg-900"
                            style={{ backgroundColor: w.avatar_color }}
                          >
                            {w.player_name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-ink-mut">{empty}</span>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
