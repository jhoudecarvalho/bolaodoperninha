import { useEffect, useState } from 'react';
import { RankingAPI } from '../api/client.js';
import RankingTable from '../components/RankingTable.jsx';
import { useSSE } from '../hooks/useSSE.js';

export default function Ranking() {
  const [rows, setRows] = useState([]);

  async function load() {
    setRows(await RankingAPI.list().catch(() => []));
  }
  useEffect(() => {
    load();
  }, []);

  useSSE({ ranking: load });

  const podium = rows.slice(0, 3);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">🏆 Ranking</h1>

      {podium.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {podium.map((r, i) => (
            <div
              key={r.player_id}
              className={`card p-4 text-center ${
                i === 0 ? 'order-2 border-gold/60 -translate-y-2' : i === 1 ? 'order-1' : 'order-3'
              }`}
            >
              <div className="text-3xl">{['🥇', '🥈', '🥉'][i]}</div>
              <div className="mt-1 font-bold text-gold">{r.player_name}</div>
              <div className="text-2xl font-black tabular-nums">{r.pontos}</div>
              <div className="text-xs text-ink-mut">{r.acertos_exatos} acertos</div>
            </div>
          ))}
        </div>
      )}

      <RankingTable rows={rows} />
      <div className="text-center text-xs text-ink-dim space-y-1">
        <p>🎯 Placar exato = <b className="text-gold">3 pts</b> &nbsp;·&nbsp; ⚽ Acertou o vencedor = <b className="text-yellow-400">1 pt</b> &nbsp;·&nbsp; 🏆 Campeão do mundo = <b className="text-gold">+10 pts</b></p>
        <p>Atualiza em tempo real</p>
      </div>
    </div>
  );
}
