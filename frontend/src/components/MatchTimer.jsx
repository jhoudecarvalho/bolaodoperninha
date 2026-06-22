import { useEffect, useState } from 'react';

const HALF = 45;
const BREAK = 15; // duração aproximada do intervalo em minutos de relógio

function getPeriodLabel(minute) {
  if (minute <= HALF) return '1º Tempo';
  if (minute <= 90) return '2º Tempo';
  return 'Prorrogação';
}

function calcFromClock(kickoffUtc, status) {
  if (status === 'paused') return { label: 'Intervalo', minute: HALF, injury: null };

  const elapsedMs = Date.now() - new Date(kickoffUtc).getTime();
  const elapsed = Math.max(0, Math.floor(elapsedMs / 60000));

  if (elapsed <= HALF) {
    return { label: '1º Tempo', minute: elapsed, injury: null };
  }
  if (elapsed <= HALF + BREAK) {
    return { label: 'Intervalo', minute: HALF, injury: null };
  }
  const secondMin = HALF + (elapsed - HALF - BREAK);
  return { label: '2º Tempo', minute: Math.min(secondMin, 90), injury: null };
}

export default function MatchTimer({ kickoffUtc, status, liveMinute, liveInjuryTime, className = '' }) {
  function compute() {
    if (status === 'paused') return { label: 'Intervalo', minute: liveMinute ?? HALF, injury: null };
    if (liveMinute != null) {
      return { label: getPeriodLabel(liveMinute), minute: liveMinute, injury: liveInjuryTime ?? null };
    }
    return calcFromClock(kickoffUtc, status);
  }

  const [info, setInfo] = useState(compute);

  useEffect(() => {
    setInfo(compute());
    const id = setInterval(() => setInfo(compute()), 30000);
    return () => clearInterval(id);
  }, [kickoffUtc, status, liveMinute, liveInjuryTime]);

  if (status === 'finished') {
    return <span className={`text-ink-mut font-medium ${className}`}>Encerrado</span>;
  }

  if (info.label === 'Intervalo') {
    return <span className={`text-warn font-medium ${className}`}>⏸ Intervalo</span>;
  }

  const timeStr = info.injury ? `${info.minute}+${info.injury}'` : `${info.minute}'`;

  return (
    <span className={`text-ok font-medium tabular-nums ${className}`}>
      {timeStr} · {info.label}
    </span>
  );
}
