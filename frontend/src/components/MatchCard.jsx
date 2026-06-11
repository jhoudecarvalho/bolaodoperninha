import { useEffect, useState } from 'react';
import { PredictionsAPI } from '../api/client.js';
import { formatLocal, isToday } from '../utils/datetime.js';
import CountdownTimer from './CountdownTimer.jsx';
import MatchTimer from './MatchTimer.jsx';
import ScoreInput from './ScoreInput.jsx';

function StatusBadge({ match }) {
  if (match.status === 'live') {
    return (
      <span className="badge bg-ok/20 text-ok">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-ok opacity-75 animate-pulseLive" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
        </span>
        AO VIVO
      </span>
    );
  }
  if (match.status === 'paused') {
    return <span className="badge bg-warn/20 text-warn">⏸ PAUSADO</span>;
  }
  if (match.locked && match.status !== 'finished') {
    return <span className="badge bg-danger/15 text-danger">🔒 BLOQUEADO</span>;
  }
  if (match.status === 'finished') {
    return <span className="badge bg-ok-dark/30 text-ok">✓ ENCERRADO</span>;
  }
  return <span className="badge bg-ok-dark/20 text-ok">🟢 ABERTO PALPITE</span>;
}

/**
 * Card de jogo reutilizável.
 *  - showQuickPredict: habilita o fluxo de palpite rápido inline (Home)
 *  - showPredictions: exibe a lista de palpites já feitos para o jogo
 *  - playerId / playerName: o jogador do usuário logado (palpita por si)
 *  - onSaved: callback após salvar
 */
export default function MatchCard({
  match,
  playerId = null,
  playerName = '',
  showQuickPredict = false,
  showPredictions = false,
  onSaved,
}) {
  const [predictions, setPredictions] = useState([]);
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [myPred, setMyPred] = useState(null); // palpite do próprio jogador (com placar)

  const locked = match.locked;
  const hasResult = match.home_score != null && match.away_score != null;
  const today = isToday(match.kick_off_utc);

  // Carrega palpites de todos (admin) ou só quando o card precisa exibi-los
  useEffect(() => {
    if (!showPredictions) return;
    PredictionsAPI.byMatch(match.id).then(setPredictions).catch(() => {});
  }, [showPredictions, match.id]);

  // Pré-preenche inputs com o palpite do usuário logado (via byPlayer,
  // que sempre traz o placar — o byMatch oculta antes do início).
  useEffect(() => {
    if (!showQuickPredict || !playerId) {
      setMyPred(null);
      setHome('');
      setAway('');
      return;
    }
    PredictionsAPI.byPlayer(playerId)
      .then((list) => {
        const mine = list.find((p) => p.match_id === match.id) || null;
        setMyPred(mine);
        setHome(mine ? mine.home_score : '');
        setAway(mine ? mine.away_score : '');
      })
      .catch(() => {});
  }, [showQuickPredict, playerId, match.id]);

  async function handleSave() {
    if (!playerId) {
      setMsg({ type: 'err', text: 'Sem jogador vinculado. Faça login novamente.' });
      return;
    }
    if (home === '' || away === '') {
      setMsg({ type: 'err', text: 'Preencha o placar' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await PredictionsAPI.save({
        player_id: playerId,
        match_id: match.id,
        home_score: Number(home),
        away_score: Number(away),
      });
      setMsg({ type: 'ok', text: 'Palpite salvo! ✓' });
      setMyPred({ match_id: match.id, home_score: Number(home), away_score: Number(away) });
      const fresh = await PredictionsAPI.byMatch(match.id);
      setPredictions(fresh);
      onSaved?.();
    } catch (err) {
      setMsg({
        type: 'err',
        text: err.response?.data?.message || err.response?.data?.error || 'Erro ao salvar',
      });
    } finally {
      setSaving(false);
    }
  }

  const borderClass = locked
    ? 'border-danger/40'
    : today
    ? 'border-gold/50'
    : 'border-line';

  return (
    <div className={`card ${borderClass} p-4 animate-slideUp`}>
      <div className="mb-2 flex items-center justify-between text-xs text-ink-mut">
        <span>
          Grupo {match.group_id} · {formatLocal(match.kick_off_utc)}
          {today && <span className="ml-1 text-gold">· Hoje</span>}
        </span>
        <div className="flex items-center gap-2">
          {(match.status === 'live' || match.status === 'paused') && (
            <MatchTimer
              kickoffUtc={match.kick_off_utc}
              status={match.status}
              liveMinute={match.live_minute}
              liveInjuryTime={match.live_injury_time}
            />
          )}
          <StatusBadge match={match} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-2">
          <span className="text-2xl">{match.home_flag}</span>
          <span className="font-medium">{match.home_name}</span>
        </div>

        <div className="px-3 text-center">
          {hasResult ? (
            <div className="font-display text-xl font-bold text-gold tabular-nums">
              {match.home_score} × {match.away_score}
            </div>
          ) : (
            <CountdownTimer kickoff={match.kick_off_utc} className="text-sm text-ink-mut" />
          )}
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          <span className="font-medium">{match.away_name}</span>
          <span className="text-2xl">{match.away_flag}</span>
        </div>
      </div>

      {hasResult && (match.home_scorers?.length > 0 || match.away_scorers?.length > 0) && (
        <div className="mt-2 flex justify-between text-xs text-ink-mut">
          <div className="space-y-0.5">
            {(match.home_scorers || []).map((s, i) => (
              <div key={i}>⚽ {s.name} <span className="text-gold">{s.minute}'</span></div>
            ))}
          </div>
          <div className="space-y-0.5 text-right">
            {(match.away_scorers || []).map((s, i) => (
              <div key={i}><span className="text-gold">{s.minute}'</span> {s.name} ⚽</div>
            ))}
          </div>
        </div>
      )}

      {hasResult && match.result_source === 'api' && (
        <div className="mt-2 text-right">
          <span className="badge bg-api/20 text-api">📡 API</span>
        </div>
      )}

      {showPredictions && (
        <div className="mt-3 border-t border-line pt-3">
          {predictions.length === 0 ? (
            <p className="text-xs text-ink-dim">Nenhum palpite ainda para este jogo.</p>
          ) : (
            <>
              <p className="mb-1.5 flex items-center justify-between text-xs text-ink-mut">
                <span>Palpites ({predictions.length})</span>
                {!locked && <span className="text-ink-dim">🔒 placares revelados no início</span>}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {predictions.map((p) => {
                  const revealed = p.revealed !== false && p.home_score != null;
                  const outcome = (h, a) => h > a ? 'home' : h < a ? 'away' : 'draw';
                  const exact =
                    revealed &&
                    hasResult &&
                    p.home_score === match.home_score &&
                    p.away_score === match.away_score;
                  const correctOutcome =
                    revealed && hasResult && !exact &&
                    outcome(p.home_score, p.away_score) === outcome(match.home_score, match.away_score);
                  const pts = revealed && hasResult ? (exact ? 3 : correctOutcome ? 1 : 0) : null;
                  return (
                    <span
                      key={p.id}
                      className={`badge bg-bg-900 ${
                        exact ? 'text-ok ring-1 ring-ok/40' : 'text-ink'
                      }`}
                      title={p.player_name}
                    >
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: p.avatar_color || '#c8aa6e' }}
                      />
                      {p.player_name}
                      {revealed ? (
                        <b className="tabular-nums">
                          {p.home_score}×{p.away_score}
                        </b>
                      ) : (
                        <span className="text-ok">✔</span>
                      )}
                      {pts !== null && (
                        <span className={
                          exact ? 'font-bold text-gold' :
                          correctOutcome ? 'font-bold text-yellow-400' :
                          'text-ink-dim'
                        }>
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

      {showQuickPredict && (
        <div className="mt-3 border-t border-line pt-3">
          {locked ? (
            <p className="text-center text-xs text-danger">🔒 Palpites encerrados para este jogo</p>
          ) : (
            <div className="space-y-3 animate-fadeIn">
              {playerName && (
                <p className="text-center text-xs text-ink-mut">
                  Seu palpite — <b className="text-ink">{playerName}</b>
                </p>
              )}

              {myPred && (
                <p className="text-center text-xs text-ok">
                  Palpite atual: {myPred.home_score} × {myPred.away_score} ✓
                </p>
              )}

              <div className="flex items-center justify-center gap-3">
                <ScoreInput home={home} away={away} onHome={setHome} onAway={setAway} />
                <button className="btn-gold" onClick={handleSave} disabled={saving}>
                  {saving ? '...' : '💾 Salvar'}
                </button>
              </div>

              {msg && (
                <p
                  className={`text-center text-xs ${
                    msg.type === 'ok' ? 'text-ok' : 'text-danger'
                  }`}
                >
                  {msg.text}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
