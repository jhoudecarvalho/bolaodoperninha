// Par de inputs de placar (casa × fora).
export default function ScoreInput({ home, away, onHome, onAway, disabled }) {
  const clamp = (v) => {
    if (v === '') return '';
    const n = Math.max(0, Math.min(99, parseInt(v, 10) || 0));
    return n;
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min="0"
        max="99"
        className="score-input"
        value={home ?? ''}
        disabled={disabled}
        onChange={(e) => onHome(clamp(e.target.value))}
      />
      <span className="text-ink-dim">×</span>
      <input
        type="number"
        min="0"
        max="99"
        className="score-input"
        value={away ?? ''}
        disabled={disabled}
        onChange={(e) => onAway(clamp(e.target.value))}
      />
    </div>
  );
}
