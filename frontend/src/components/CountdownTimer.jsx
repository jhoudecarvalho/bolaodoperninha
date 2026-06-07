import { useEffect, useState } from 'react';
import { countdown, hasStarted } from '../utils/datetime.js';

// Atualiza a cada 30s (regra de negócio).
export default function CountdownTimer({ kickoff, className = '' }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  if (hasStarted(kickoff, now)) {
    return <span className={`text-danger ${className}`}>iniciado</span>;
  }

  return <span className={`tabular-nums ${className}`}>⏱ {countdown(kickoff, now)}</span>;
}
