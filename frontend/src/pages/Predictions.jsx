import { useEffect, useMemo, useState } from 'react';
import { MatchesAPI, PlayersAPI, PredictionsAPI } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import PlayerSelector from '../components/PlayerSelector.jsx';
import ScoreInput from '../components/ScoreInput.jsx';
import CountdownTimer from '../components/CountdownTimer.jsx';
import { formatLocal, isToday } from '../utils/datetime.js';

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export default function Predictions() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [players, setPlayers] = useState([]);
  const [playerId, setPlayerId] = useState(null);
  const [group, setGroup] = useState('A');
  const [matches, setMatches] = useState([]);
  const [preds, setPreds] = useState({}); // match_id -> { home, away }
  const [saved, setSaved] = useState({}); // match_id -> { home, away } (no servidor)
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  // Carrega jogadores e pré-seleciona o player vinculado ao usuário logado
  useEffect(() => {
    PlayersAPI.list().then((pl) => {
      setPlayers(pl);
      if (user?.player_id && pl.some((p) => p.id === user.player_id)) {
        setPlayerId(user.player_id);
      } else if (pl.length === 1) {
        setPlayerId(pl[0].id);
      }
    });
  }, [user?.player_id]);

  // Carrega jogos do grupo
  useEffect(() => {
    MatchesAPI.list({ group }).then(setMatches);
  }, [group]);

  // Carrega palpites do jogador
  useEffect(() => {
    if (!playerId) {
      setPreds({});
      setSaved({});
      return;
    }
    PredictionsAPI.byPlayer(playerId).then((list) => {
      const map = {};
      for (const p of list) map[p.match_id] = { home: p.home_score, away: p.away_score };
      setPreds(map);
      setSaved(map);
    });
  }, [playerId]);

  const stats = useMemo(() => {
    let done = 0;
    let open = 0;
    let locked = 0;
    for (const m of matches) {
      if (saved[m.id]) done++;
      if (m.locked) locked++;
      else open++;
    }
    return { done, open, locked, total: matches.length };
  }, [matches, saved]);

  function setScore(matchId, side, value) {
    setPreds((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], [side]: value },
    }));
  }

  async function handleSaveAll() {
    if (!playerId) return;
    // Monta apenas palpites válidos de jogos abertos com ambos os placares preenchidos
    const toSave = [];
    for (const m of matches) {
      if (m.locked) continue;
      const p = preds[m.id];
      if (!p || p.home === '' || p.home == null || p.away === '' || p.away == null) continue;
      toSave.push({ match_id: m.id, home_score: Number(p.home), away_score: Number(p.away) });
    }
    if (!toSave.length) {
      setMsg({ type: 'err', text: 'Nenhum palpite preenchido para salvar.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await PredictionsAPI.saveBulk({ player_id: playerId, predictions: toSave });
      const fresh = await PredictionsAPI.byPlayer(playerId);
      const map = {};
      for (const p of fresh) map[p.match_id] = { home: p.home_score, away: p.away_score };
      setPreds(map);
      setSaved(map);
      setMsg({ type: 'ok', text: `${toSave.length} palpite(s) salvos! ✓` });
    } catch (err) {
      setMsg({
        type: 'err',
        text: err.response?.data?.message || err.response?.data?.error || 'Erro ao salvar',
      });
    } finally {
      setSaving(false);
    }
  }

  if (isAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold">🎯 Palpites</h1>
        <p className="rounded-lg border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
          🛡️ Você está logado como <b>administrador</b>. O administrador não dá palpites —
          apenas cadastra jogadores e acompanha resultados e ranking.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">🎯 Palpites</h1>

      {players.length === 0 ? (
        <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          Cadastre jogadores primeiro na aba 👥 Jogadores.
        </p>
      ) : (
        <>
          {/* Seleção de jogador */}
          <div className="card p-4">
            <h2 className="mb-2 text-sm text-ink-mut">Selecione o jogador</h2>
            <PlayerSelector players={players} value={playerId} onChange={setPlayerId} />
          </div>

          {/* Seleção de grupo */}
          <div className="card p-4">
            <h2 className="mb-2 text-sm text-ink-mut">Selecione o grupo</h2>
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
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-mut">
              <span>✅ {stats.done}/{stats.total} feitos</span>
              <span className="text-ok">🟢 {stats.open} abertos</span>
              <span className="text-danger">🔒 {stats.locked} bloqueados</span>
            </div>
          </div>

          {!playerId && (
            <p className="text-sm text-warn">Selecione um jogador para palpitar.</p>
          )}

          {/* Formulário por grupo */}
          {playerId && (
            <div className="space-y-3">
              {matches.map((m) => {
                const p = preds[m.id] || {};
                const hasResult = m.home_score != null && m.away_score != null;
                const savedPred = saved[m.id];
                const exact =
                  hasResult &&
                  savedPred &&
                  savedPred.home === m.home_score &&
                  savedPred.away === m.away_score;
                const today = isToday(m.kick_off_utc);

                return (
                  <div
                    key={m.id}
                    className={`card p-4 ${
                      m.locked ? 'border-danger/40' : today ? 'border-gold/50' : 'border-ok-dark/40'
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between text-xs text-ink-mut">
                      <span>
                        {formatLocal(m.kick_off_utc)}
                        {today && <span className="ml-1 text-gold">· Hoje</span>}
                      </span>
                      {m.locked ? (
                        <span className="text-danger">
                          {m.status === 'live' ? '🔴 AO VIVO' : '🔒 BLOQUEADO'}
                        </span>
                      ) : (
                        <CountdownTimer kickoff={m.kick_off_utc} />
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex flex-1 items-center justify-end gap-2 text-right">
                        <span className="font-medium">{m.home_name}</span>
                        <span className="text-2xl">{m.home_flag}</span>
                      </div>

                      <ScoreInput
                        home={p.home ?? ''}
                        away={p.away ?? ''}
                        onHome={(v) => setScore(m.id, 'home', v)}
                        onAway={(v) => setScore(m.id, 'away', v)}
                        disabled={m.locked}
                      />

                      <div className="flex flex-1 items-center gap-2">
                        <span className="text-2xl">{m.away_flag}</span>
                        <span className="font-medium">{m.away_name}</span>
                      </div>
                    </div>

                    {hasResult && (
                      <div className="mt-2 text-center text-sm">
                        <span className="text-ink-mut">
                          Real: {m.home_score} × {m.away_score}
                        </span>{' '}
                        {savedPred &&
                          (exact ? (
                            <span className="text-ok font-bold">✓ +3</span>
                          ) : (
                            <span className="text-danger font-bold">✗</span>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="sticky bottom-4 z-10 flex items-center justify-between rounded-xl border border-line bg-bg-800/95 p-3 backdrop-blur">
                {msg ? (
                  <span className={`text-sm ${msg.type === 'ok' ? 'text-ok' : 'text-danger'}`}>
                    {msg.text}
                  </span>
                ) : (
                  <span className="text-xs text-ink-mut">
                    Preencha os placares dos jogos abertos e salve.
                  </span>
                )}
                <button className="btn-gold" onClick={handleSaveAll} disabled={saving}>
                  {saving ? 'Salvando...' : '💾 Salvar grupo'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
