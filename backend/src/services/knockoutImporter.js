import pool from '../config/database.js';
import { broadcast } from '../sse/broker.js';

const FD_URL = 'https://api.football-data.org/v4/competitions/WC/matches';
const FD_TOKEN = process.env.FOOTBALL_DATA_TOKEN || '';

const KNOCKOUT_STAGES = new Set([
  'LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL',
]);

const TEAM_MAP = {
  'Korea Republic': 'South Korea', 'Republic of Korea': 'South Korea',
  Türkiye: 'Turkey', Turkiye: 'Turkey',
  'IR Iran': 'Iran',
  "Côte d'Ivoire": 'Ivory Coast', "Cote d'Ivoire": 'Ivory Coast',
  'Congo DR': 'DR Congo', 'Democratic Republic of the Congo': 'DR Congo',
  'Cabo Verde': 'Cape Verde', 'Cape Verde Islands': 'Cape Verde',
  'Czech Republic': 'Czechia', Czech: 'Czechia',
  USA: 'United States', 'United States of America': 'United States',
  'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
  Curaçao: 'Curacao', Holland: 'Netherlands',
};

function normalize(name) {
  if (!name) return null;
  const t = String(name).trim();
  return TEAM_MAP[t] || t;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'X-Auth-Token': FD_TOKEN, 'User-Agent': 'bolao-copa-2026' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`football-data HTTP ${res.status}`);
  return res.json();
}

export async function importKnockoutMatches() {
  const data = await fetchJson(FD_URL);

  const knockoutMatches = (data.matches ?? []).filter(
    (m) => KNOCKOUT_STAGES.has(m.stage) && m.homeTeam?.name && m.awayTeam?.name
  );

  if (!knockoutMatches.length) return { inserted: 0, updated: 0 };

  // Carrega times do banco para lookup por name_en
  const [teams] = await pool.query('SELECT id, name_en FROM teams');
  const teamByEn = new Map(teams.map((t) => [t.name_en.toLowerCase(), t.id]));

  function findTeamId(apiName) {
    const normalized = normalize(apiName);
    return normalized ? (teamByEn.get(normalized.toLowerCase()) ?? null) : null;
  }

  let inserted = 0;
  let updated = 0;

  for (const m of knockoutMatches) {
    const homeId = findTeamId(m.homeTeam.name);
    const awayId = findTeamId(m.awayTeam.name);

    if (!homeId || !awayId) {
      console.warn(`⚠️  Knockout: time não encontrado no banco — ${m.homeTeam.name} x ${m.awayTeam.name}`);
      continue;
    }

    const kickoff = new Date(m.utcDate);
    const matchDate = kickoff.toISOString().slice(0, 10);
    const kickoffUtc = kickoff.toISOString().slice(0, 19).replace('T', ' ');

    // Verifica se já existe pelo fd_match_id
    const [[existing]] = await pool.query(
      'SELECT id, home_team_id, away_team_id FROM matches WHERE fd_match_id = ?',
      [m.id]
    );

    if (!existing) {
      await pool.query(
        `INSERT INTO matches
           (group_id, stage, fd_match_id, home_team_id, away_team_id,
            match_date, kick_off_utc, status)
         VALUES (NULL, ?, ?, ?, ?, ?, ?, 'scheduled')`,
        [m.stage, m.id, homeId, awayId, matchDate, kickoffUtc]
      );
      console.log(`✅ Knockout inserido: ${m.homeTeam.name} x ${m.awayTeam.name} (${m.stage})`);
      broadcast('result', { stage: m.stage }); // avisa frontend de novo jogo
      inserted++;
    } else if (existing.home_team_id !== homeId || existing.away_team_id !== awayId) {
      // Times foram atualizados na API (raro, mas pode acontecer)
      await pool.query(
        'UPDATE matches SET home_team_id = ?, away_team_id = ? WHERE fd_match_id = ?',
        [homeId, awayId, m.id]
      );
      console.log(`♻️  Knockout atualizado: ${m.homeTeam.name} x ${m.awayTeam.name}`);
      updated++;
    }
  }

  return { inserted, updated };
}

let _interval = null;

export function startKnockoutSync(intervalMs = 5 * 60_000) {
  // Primeira tentativa logo no boot
  importKnockoutMatches().catch((e) =>
    console.warn('⚠️  Knockout sync inicial falhou:', e.message)
  );
  _interval = setInterval(() => {
    importKnockoutMatches().catch((e) =>
      console.warn('⚠️  Knockout sync falhou:', e.message)
    );
  }, intervalMs);
  console.log(`⏱️  Knockout sync a cada ${intervalMs / 60000}min`);
}

export function stopKnockoutSync() {
  if (_interval) clearInterval(_interval);
}
