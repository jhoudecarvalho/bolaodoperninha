import { useEffect, useMemo, useState } from 'react';
import { MatchesAPI, ResultsAPI } from '../api/client.js';
import { formatLocal } from '../utils/datetime.js';

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export default function Results() {
  const [group, setGroup] = useState('A');
  const [matches, setMatches] = useState([]);
  const [edits, setEdits] = useState({}); // match_id -> { home, away }
  const [msg, setMsg] = useState(null);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    const data = await MatchesAPI.list({ group });
    setMatches(data);
    setEdits({});
  }
  useEffect(() => {
    load();
  }, [group]);

  async function handleSave(matchId) {
    const e = edits[matchId];
    if (!e || e.home === '' || e.away === '') {
      setMsg({ type: 'err', text: 'Preencha o placar.' });
      return;
    }
    try {
      await ResultsAPI.setManual(matchId, {
        home_score: Number(e.home),
        away_score: Number(e.away),
      });
      setMsg({ type: 'ok', text: 'Resultado salvo! ✓' });
      await load();
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.error || 'Erro ao salvar' });
    }
  }

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">📊 Resultados</h1>
        <button className="btn-ghost text-sm" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Sincronizando...' : '📡 Sincronizar API'}
        </button>
      </div>

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
          const hasResult = m.home_score != null && m.away_score != null;
          const e = edits[m.id] || {};
          return (
            <div key={m.id} className="card p-4">
              <div className="mb-2 flex items-center justify-between text-xs text-ink-mut">
                <span>{formatLocal(m.kick_off_utc)}</span>
                {hasResult && (
                  <span
                    className={`badge ${
                      m.result_source === 'api' ? 'bg-api/20 text-api' : 'bg-gold/20 text-gold'
                    }`}
                  >
                    {m.result_source === 'api' ? '📡 API' : '✍️ Manual'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center justify-end gap-2 text-right">
                  <span className="font-medium">{m.home_name}</span>
                  <span className="text-2xl">{m.home_flag}</span>
                </div>

                <div className="flex items-center gap-2 px-2">
                  <input
                    type="number"
                    min="0"
                    className="score-input"
                    placeholder={hasResult ? m.home_score : '-'}
                    value={e.home ?? ''}
                    onChange={(ev) =>
                      setEdits((p) => ({ ...p, [m.id]: { ...p[m.id], home: ev.target.value } }))
                    }
                  />
                  <span className="text-ink-dim">×</span>
                  <input
                    type="number"
                    min="0"
                    className="score-input"
                    placeholder={hasResult ? m.away_score : '-'}
                    value={e.away ?? ''}
                    onChange={(ev) =>
                      setEdits((p) => ({ ...p, [m.id]: { ...p[m.id], away: ev.target.value } }))
                    }
                  />
                </div>

                <div className="flex flex-1 items-center gap-2">
                  <span className="text-2xl">{m.away_flag}</span>
                  <span className="font-medium">{m.away_name}</span>
                </div>

                <button className="btn-gold ml-2" onClick={() => handleSave(m.id)}>
                  💾
                </button>
              </div>

              {hasResult && (
                <p className="mt-2 text-center text-sm text-gold">
                  Placar oficial: {m.home_score} × {m.away_score}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
