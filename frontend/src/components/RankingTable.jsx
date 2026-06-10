import { Link } from 'react-router-dom';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function RankingTable({ rows = [], compact = false }) {
  if (!rows.length) {
    return <p className="text-ink-mut">Nenhum jogador no ranking ainda.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <table className="w-full text-sm">
        <thead className="bg-bg-800 text-left text-ink-mut">
          <tr>
            <th className="px-3 py-2 w-12">#</th>
            <th className="px-3 py-2">Jogador</th>
            <th className="px-3 py-2 text-right">Pontos</th>
            {!compact && <th className="px-3 py-2 text-right">Exatos</th>}
            {!compact && <th className="px-3 py-2 text-right">Vencedor</th>}
            {!compact && <th className="px-3 py-2 text-right">Apurados</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const top = r.position <= 3;
            return (
              <tr
                key={r.player_id}
                className={`border-t border-line ${top ? 'bg-gold/5' : ''}`}
              >
                <td className="px-3 py-2 font-bold">
                  {MEDALS[r.position - 1] || r.position}
                </td>
                <td className="px-3 py-2">
                  <Link
                    to={`/detalhes?player=${r.player_id}`}
                    className="flex items-center gap-2 hover:text-gold"
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: r.avatar_color }}
                    />
                    <span className={top ? 'font-bold text-gold' : ''}>{r.player_name}</span>
                  </Link>
                </td>
                <td className="px-3 py-2 text-right font-bold tabular-nums text-gold">
                  {r.pontos}
                </td>
                {!compact && (
                  <td className="px-3 py-2 text-right tabular-nums">{r.acertos_exatos}</td>
                )}
                {!compact && (
                  <td className="px-3 py-2 text-right tabular-nums text-ink-mut">{r.acertos_vencedor}</td>
                )}
                {!compact && (
                  <td className="px-3 py-2 text-right tabular-nums text-ink-mut">
                    {r.jogos_com_resultado}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
