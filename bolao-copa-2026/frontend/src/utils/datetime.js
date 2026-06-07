// Helpers de data/hora. O backend entrega kick_off_utc em UTC (ISO).
// Exibimos sempre no fuso local do usuário.

export function parseUTC(value) {
  if (!value) return null;
  // mysql2 retorna ISO com Z (timezone 'Z' no pool). Garantimos Date válido.
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatLocal(value) {
  const d = parseUTC(value);
  if (!d) return '';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatLocalTime(value) {
  const d = parseUTC(value);
  if (!d) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatLocalDate(value) {
  const d = parseUTC(value);
  if (!d) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function isToday(value) {
  const d = parseUTC(value);
  if (!d) return false;
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

// Tempo restante até o kick-off → string "4d", "2h30m", "15m", "AGORA"
export function countdown(value, nowMs = Date.now()) {
  const d = parseUTC(value);
  if (!d) return '';
  let diff = d.getTime() - nowMs;
  if (diff <= 0) return 'AGORA';

  const days = Math.floor(diff / 86400000);
  diff -= days * 86400000;
  const hours = Math.floor(diff / 3600000);
  diff -= hours * 3600000;
  const mins = Math.floor(diff / 60000);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h${String(mins).padStart(2, '0')}m`;
  return `${mins}m`;
}

export function hasStarted(value, nowMs = Date.now()) {
  const d = parseUTC(value);
  if (!d) return false;
  return nowMs >= d.getTime();
}
