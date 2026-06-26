import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MatchesAPI, PredictionsAPI, RankingAPI } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import LiveBanner from '../components/LiveBanner.jsx';
import MatchCard from '../components/MatchCard.jsx';
import RankingTable from '../components/RankingTable.jsx';
import { useSSE } from '../hooks/useSSE.js';

const MENU = [
  { to: '/palpites',      label: '🎯 Palpites',      desc: 'Fase de grupos' },
  { to: '/finais',        label: '⚔️ Mata-Mata',      desc: 'Palpites + chaveamento' },
  { to: '/ranking',       label: '🏆 Ranking',        desc: 'Tempo real' },
  { to: '/classificacao', label: '🗂️ Classificação',  desc: 'Grupos + artilheiros' },
  { to: '/detalhes',      label: '🔍 Detalhes',       desc: 'Por jogador' },
  { to: '/jogadores',     label: '👥 Participantes',  desc: 'Gerenciar (admin)' },
];

export default function Home() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [live, setLive] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [ranking, setRanking] = useState([]);
  // Predictions pré-carregadas para evitar 20 chamadas individuais nos MatchCards
  const [predsByMatch, setPredsByMatch] = useState({});
  const [myPredsByMatch, setMyPredsByMatch] = useState({});
  // Timestamp (ms) em que o último jogo recentemente encerrado vai sair do banner
  const [recentExpiry, setRecentExpiry] = useState(null);

  async function load() {
    const playerId = user?.player_id;
    const [liveData, up, rk] = await Promise.all([
      MatchesAPI.list({ status: 'in_progress' }).catch(() => []),
      MatchesAPI.upcoming(10).catch(() => []),
      RankingAPI.list().catch(() => []),
    ]);
    setLive(liveData);

    // Calcula quando o último jogo "recentemente encerrado" vai sair da janela de 20 min
    const TWENTY_MIN = 20 * 60 * 1000;
    const finishedWithTs = liveData.filter((m) => m.status === 'finished' && m.result_updated_at);
    if (finishedWithTs.length) {
      const expiries = finishedWithTs.map((m) => new Date(m.result_updated_at).getTime() + TWENTY_MIN);
      setRecentExpiry(Math.min(...expiries));
    } else {
      setRecentExpiry(null);
    }

    setUpcoming(up);
    setRanking(rk);

    // Busca palpites em lote: 1 chamada para todos os jogos + 1 para o usuário
    if (up.length) {
      const ids = up.map((m) => m.id);
      const [allPreds, myPreds] = await Promise.all([
        PredictionsAPI.byMatches(ids).catch(() => []),
        playerId ? PredictionsAPI.byPlayer(playerId).catch(() => []) : [],
      ]);
      const byMatch = {};
      for (const p of allPreds) {
        if (!byMatch[p.match_id]) byMatch[p.match_id] = [];
        byMatch[p.match_id].push(p);
      }
      setPredsByMatch(byMatch);
      const myMap = {};
      for (const p of myPreds) myMap[p.match_id] = p;
      setMyPredsByMatch(myMap);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Remove o banner "ENCERRADO" quando os 20 min expirarem
  useEffect(() => {
    if (!recentExpiry) return;
    const delay = Math.max(0, recentExpiry - Date.now());
    const timer = setTimeout(() => load(), delay);
    return () => clearTimeout(timer);
  }, [recentExpiry]);

  useSSE({ result: load, ranking: load });

  return (
    <div className="space-y-6">
      <LiveBanner matches={live} />

      {/* Hero */}
      <section className="card p-6 text-center animate-fadeIn">
        <h1 className="font-display text-3xl font-black text-gold sm:text-4xl">
          Bolão Grupo Perninha: Copa do Mundo 2026
        </h1>
        {upcoming.some(m => m.stage !== 'GROUP_STAGE') ? (
          <>
            <p className="mt-2 text-ink-mut">
              <b className="text-gold">Mata-mata!</b>{' '}
              Pontuação progressiva — quanto mais longe, mais pontos valem.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm text-ink-mut">
              <span className="badge bg-bg-900">⚔️ 16 avos — 🎯 5 pts / ⚽ 3 pts</span>
              <span className="badge bg-bg-900">🔥 Oitavas — 🎯 8 pts / ⚽ 5 pts</span>
              <span className="badge bg-bg-900">💥 Quartas — 🎯 10 pts / ⚽ 6 pts</span>
              <span className="badge bg-bg-900">⚡ Semi — 🎯 13 pts / ⚽ 8 pts</span>
              <span className="badge bg-bg-900">🏆 Final — 🎯 16 pts / ⚽ 10 pts</span>
              <span className="badge bg-bg-900">🔒 Bloqueio no apito inicial</span>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-ink-mut">
              Palpite nos 72 jogos da fase de grupos e no mata-mata.{' '}
              <b className="text-gold">Pontuação cresce a cada fase</b> —{' '}
              placar exato vale mais quanto mais longe.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm text-ink-mut">
              <span className="badge bg-bg-900">🎯 3 pts — placar exato</span>
              <span className="badge bg-bg-900">⚽ 1 pt — vencedor</span>
              <span className="badge bg-bg-900">📈 Mais pontos no mata-mata</span>
              <span className="badge bg-bg-900">🏆 +10 pts — acertar o campeão</span>
              <span className="badge bg-bg-900">🔒 Bloqueio no apito inicial</span>
              <span className="badge bg-bg-900">📡 Placares automáticos via API</span>
            </div>
          </>
        )}
      </section>

      {/* Menu */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {MENU.map((m) => (
          <Link
            key={m.to}
            to={m.to}
            className="card p-4 text-center transition-transform hover:-translate-y-0.5 hover:border-gold/50"
          >
            <div className="text-lg font-medium">{m.label}</div>
            <div className="mt-1 text-xs text-ink-mut">{m.desc}</div>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Próximos jogos */}
        <section className="lg:col-span-2">
          <h2 className="mb-3 font-display text-xl font-bold">📅 Próximos 10 jogos</h2>
          {isAdmin && (
            <p className="mb-3 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
              🛡️ Modo administrador: você acompanha tudo, mas não dá palpites.
            </p>
          )}
          {!isAdmin && !user?.player_id && (
            <p className="mb-3 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
              Seu usuário ainda não tem um jogador vinculado. Saia e entre novamente.
            </p>
          )}
          <div className="space-y-3">
            {upcoming.map((m, i) => {
              const prev = upcoming[i - 1];
              const isKnockout = m.stage !== 'GROUP_STAGE';
              const firstKnockout = isKnockout && (!prev || prev.stage === 'GROUP_STAGE');
              return (
                <div key={m.id}>
                  {firstKnockout && (
                    <div className="flex items-center gap-3 py-1">
                      <div className="h-px flex-1 bg-gold/30" />
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-gold/10 text-gold border border-gold/30">
                        ⚔️ Mata-Mata
                      </span>
                      <div className="h-px flex-1 bg-gold/30" />
                    </div>
                  )}
                  <MatchCard
                    match={m}
                    playerId={!isAdmin ? user?.player_id : null}
                    playerName={!isAdmin ? user?.name : ''}
                    showPredictions
                    showQuickPredict={!isAdmin && !!user?.player_id}
                    matchPredictions={predsByMatch[m.id]}
                    myPrediction={myPredsByMatch[m.id]}
                    onSaved={load}
                  />
                </div>
              );
            })}
            {!upcoming.length && <p className="text-ink-mut">Sem jogos futuros.</p>}
          </div>
        </section>

        {/* Top 3 */}
        <section>
          <h2 className="mb-3 font-display text-xl font-bold">🏆 Top 3</h2>
          <RankingTable rows={ranking.slice(0, 3)} compact />
          <Link to="/ranking" className="mt-3 block text-center text-sm text-gold hover:underline">
            Ver ranking completo →
          </Link>
        </section>
      </div>
    </div>
  );
}
