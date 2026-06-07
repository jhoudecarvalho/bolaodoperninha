import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MatchesAPI, RankingAPI } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import LiveBanner from '../components/LiveBanner.jsx';
import MatchCard from '../components/MatchCard.jsx';
import RankingTable from '../components/RankingTable.jsx';

const MENU = [
  { to: '/jogadores', label: '👥 Participantes', desc: 'Gerenciar (admin)' },
  { to: '/palpites', label: '🎯 Palpites', desc: 'Por grupo' },
  { to: '/resultados', label: '📊 Resultados', desc: 'API + manual' },
  { to: '/ranking', label: '🏆 Ranking', desc: 'Tempo real' },
  { to: '/detalhes', label: '🔍 Detalhes', desc: 'Por jogador' },
];

export default function Home() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [live, setLive] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [ranking, setRanking] = useState([]);

  async function load() {
    const [liveData, up, rk] = await Promise.all([
      MatchesAPI.list({ status: 'live' }).catch(() => []),
      MatchesAPI.upcoming(10).catch(() => []),
      RankingAPI.list().catch(() => []),
    ]);
    setLive(liveData);
    setUpcoming(up);
    setRanking(rk);
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60000); // polling 60s
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-6">
      <LiveBanner matches={live} />

      {/* Hero */}
      <section className="card p-6 text-center animate-fadeIn">
        <h1 className="font-display text-3xl font-black text-gold sm:text-4xl">
          Bolão Grupo Perninha: Copa do Mundo 2026
        </h1>
        <p className="mt-2 text-ink-mut">
          Palpite nos 72 jogos da fase de grupos. Placar exato vale <b className="text-gold">3 pontos</b>.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm text-ink-mut">
          <span className="badge bg-bg-900">🎯 3 pts por placar exato</span>
          <span className="badge bg-bg-900">🔒 Bloqueio no apito inicial</span>
          <span className="badge bg-bg-900">📡 Placares automáticos via API</span>
        </div>
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
            {upcoming.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                playerId={!isAdmin ? user?.player_id : null}
                playerName={!isAdmin ? user?.name : ''}
                showPredictions
                showQuickPredict={!isAdmin && !!user?.player_id}
                onSaved={load}
              />
            ))}
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
