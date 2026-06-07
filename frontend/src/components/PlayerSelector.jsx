// Lista de jogadores como botões. predictedIds = Set de player_ids que já palpitaram.
export default function PlayerSelector({ players, value, onChange, predictedIds }) {
  return (
    <div className="flex flex-wrap gap-2">
      {players.map((p) => {
        const active = value === p.id;
        const done = predictedIds?.has(p.id);
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            className={`btn flex items-center gap-2 text-sm ${
              active ? 'bg-gold text-bg-900' : 'border border-line-light hover:bg-bg-800'
            }`}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: done ? '#5cb85c' : p.avatar_color }}
            />
            {p.name}
          </button>
        );
      })}
    </div>
  );
}
