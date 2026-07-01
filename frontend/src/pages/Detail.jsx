import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PlayersAPI, RankingAPI } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import PlayerSelector from '../components/PlayerSelector.jsx';
import { formatLocal } from '../utils/datetime.js';

export default function Detail() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [params, setParams] = useSearchParams();
  const [players, setPlayers] = useState([]);
  const [playerId, setPlayerId] = useState(
    params.get('player') ? Number(params.get('player')) : null
  );
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!isAdmin) {
      // Usuário comum: fixa no próprio player_id, sem precisar buscar lista
      if (user?.player_id) setPlayerId(user.player_id);
      return;
    }
    PlayersAPI.list().then((pl) => {
      setPlayers(pl);
      if (!playerId && pl.length === 1) setPlayerId(pl[0].id);
    });
  }, []);

  useEffect(() => {
    if (!playerId) {
      setData(null);
      return;
    }
    setParams({ player: String(playerId) });
    RankingAPI.detail(playerId).then(setData).catch(() => setData(null));
  }, [playerId]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">🔍 Detalhes por jogador</h1>

      {isAdmin && (
        players.length === 0 ? (
          <p className="text-ink-mut">Nenhum jogador cadastrado.</p>
        ) : (
          <div className="card p-4">
            <h2 className="mb-2 text-sm text-ink-mut">Selecione o jogador</h2>
            <PlayerSelector players={players} value={playerId} onChange={setPlayerId} />
          </div>
        )
      )}

      {data && (
        <>
          <div className="card flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full font-bold text-bg-900"
                style={{ backgroundColor: data.player.avatar_color }}
              >
                {data.player.name.charAt(0).toUpperCase()}
              </span>
              <span className="font-display text-xl font-bold">{data.player.name}</span>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-gold tabular-nums">
                {data.total_pontos}
              </div>
              <div className="text-xs text-ink-mut">pontos</div>
            </div>
          </div>

          <div className="space-y-2">
            {data.predictions.map((p) => {
              const hasResult = p.real_home != null;
              // Exato = placar cravado. Caso contrário, pontos>0 = acertou o
              // vencedor (o backend já trata fase/pênaltis no valor de pontos).
              const exact = hasResult && p.pred_home === p.real_home && p.pred_away === p.real_away;
              return (
                <div key={p.match_id} className="card flex items-center justify-between p-3 text-sm">
                  <div className="flex flex-1 items-center gap-2">
                    <span className="text-xs text-ink-dim">{formatLocal(p.kick_off_utc)}</span>
                    <span>
                      {p.home_flag} {p.home_name} × {p.away_name} {p.away_flag}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {p.revealed === false ? (
                      <span className="text-ink-dim">🔒 <span className="italic">oculto até começar</span></span>
                    ) : (
                      <span className="text-ink-mut">
                        Palpite: <b className="text-ink">{p.pred_home} × {p.pred_away}</b>
                      </span>
                    )}
                    {hasResult && (
                      <span className="text-ink-mut">
                        Real: <b className="text-gold">{p.real_home} × {p.real_away}</b>
                      </span>
                    )}
                    {hasResult ? (
                      exact ? (
                        <span className="font-bold text-gold">🎯 +{p.pontos}</span>
                      ) : p.pontos > 0 ? (
                        <span className="font-bold text-yellow-400">✓ +{p.pontos}</span>
                      ) : (
                        <span className="font-bold text-danger">✗</span>
                      )
                    ) : (
                      <span className="text-ink-dim">—</span>
                    )}
                  </div>
                </div>
              );
            })}
            {!data.predictions.length && (
              <p className="text-ink-mut">Este jogador ainda não fez palpites.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
