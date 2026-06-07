export default function LiveBanner({ matches = [] }) {
  if (!matches.length) return null;

  return (
    <div className="card border-danger/40 bg-gradient-to-r from-[#2a0f12] to-bg-700 p-4 animate-fadeIn">
      <div className="mb-3 flex items-center gap-2">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full rounded-full bg-danger opacity-75 animate-pulseLive" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-danger" />
        </span>
        <span className="font-display text-lg font-bold text-danger">AO VIVO</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {matches.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between rounded-lg bg-bg-900/60 px-3 py-2 text-sm"
          >
            <span>
              {m.home_flag} {m.home_name}
            </span>
            <span className="font-bold text-gold tabular-nums">
              {m.home_score ?? 0} × {m.away_score ?? 0}
            </span>
            <span>
              {m.away_name} {m.away_flag}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
