import pool from '../config/database.js';

/**
 * Importa a tabela de JOGOS (fixtures) da fase de grupos direto da API pública
 * openfootball (que traz a data COM fuso horário → UTC confiável).
 *
 * - Times permanecem locais (a API não tem bandeira nem nome em PT).
 * - Placares continuam vindo do worldcup26.ir (scoresFetcher).
 *
 * Faz upsert por par de times dentro do grupo, então é não-destrutivo:
 * não apaga jogos (preserva palpites) — apenas atualiza data/horário/estádio.
 */

const FIXTURES_URL =
  process.env.FIXTURES_API ||
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

// Variações de nome da API → name_en do nosso banco
const NAME_FIX = {
  'Czech Republic': 'Czechia',
  'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
  'Bosnia and Herzegovina': 'Bosnia and Herzegovina',
  Curaçao: 'Curacao',
  USA: 'United States',
  'Korea Republic': 'South Korea',
  'IR Iran': 'Iran',
  "Côte d'Ivoire": 'Ivory Coast',
  Türkiye: 'Turkey',
};

const fixName = (n) => NAME_FIX[String(n || '').trim()] || String(n || '').trim();

async function fetchJson(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'bolao-copa-2026' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/**
 * "2026-06-11" + "20:00 UTC-6" → "2026-06-12 02:00:00" (UTC).
 * Retorna null se não conseguir parsear.
 */
export function parseKickoffUTC(dateStr, timeStr) {
  const dm = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = String(timeStr || '').match(/(\d{1,2}):(\d{2})\s*UTC\s*([+-]\d{1,2})/i);
  if (!dm || !tm) return null;

  const [, y, mo, d] = dm.map(Number);
  const hour = Number(tm[1]);
  const min = Number(tm[2]);
  const off = Number(tm[3]); // ex.: -6 → UTC = local - (-6) = local + 6

  const ms = Date.UTC(y, mo - 1, d, hour - off, min, 0);
  const dt = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())} ` +
    `${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}:00`
  );
}

/**
 * Importa/atualiza os jogos da fase de grupos a partir da API.
 * @returns {{ inserted:number, updated:number, skipped:number, total:number, source:string }}
 */
export async function importMatches() {
  const data = await fetchJson(FIXTURES_URL);
  const apiMatches = (data?.matches || []).filter((m) =>
    String(m.group || '').toLowerCase().startsWith('group')
  );

  // name_en (lower) → team id
  const [teams] = await pool.query('SELECT id, name_en FROM teams');
  const teamId = new Map(teams.map((t) => [t.name_en.toLowerCase(), t.id]));

  // Jogos existentes: chave por grupo + par não-ordenado de times
  const [existing] = await pool.query('SELECT id, group_id, home_team_id, away_team_id FROM matches');
  const keyOf = (g, a, b) => `${g}|${Math.min(a, b)}-${Math.max(a, b)}`;
  const index = new Map(existing.map((m) => [keyOf(m.group_id, m.home_team_id, m.away_team_id), m.id]));

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const m of apiMatches) {
    const groupId = String(m.group).replace(/group/i, '').trim().toUpperCase();
    const homeId = teamId.get(fixName(m.team1).toLowerCase());
    const awayId = teamId.get(fixName(m.team2).toLowerCase());
    const kickoff = parseKickoffUTC(m.date, m.time);

    if (!homeId || !awayId || !kickoff) {
      skipped++;
      continue;
    }

    const matchDate = kickoff.split(' ')[0];
    const venue = m.ground ? String(m.ground).slice(0, 100) : null;
    const existingId = index.get(keyOf(groupId, homeId, awayId));

    if (existingId) {
      await pool.query(
        `UPDATE matches
           SET group_id = ?, home_team_id = ?, away_team_id = ?,
               kick_off_utc = ?, match_date = ?, venue = ?
         WHERE id = ?`,
        [groupId, homeId, awayId, kickoff, matchDate, venue, existingId]
      );
      updated++;
    } else {
      await pool.query(
        `INSERT INTO matches
           (group_id, home_team_id, away_team_id, match_date, kick_off_utc, venue, status)
         VALUES (?, ?, ?, ?, ?, ?, 'scheduled')`,
        [groupId, homeId, awayId, matchDate, kickoff, venue]
      );
      inserted++;
    }
  }

  const result = { inserted, updated, skipped, total: apiMatches.length, source: 'openfootball' };
  console.log(
    `✅ Jogos importados da API: ${inserted} novos, ${updated} atualizados, ${skipped} ignorados`
  );
  return result;
}
