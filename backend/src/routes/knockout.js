import { Router } from 'express';
import pool from '../config/database.js';

const router = Router();
const FD_URL = 'https://api.football-data.org/v4/competitions/WC/matches';
const FD_TOKEN = process.env.FOOTBALL_DATA_TOKEN || '';

const STAGES = [
  { key: 'LAST_32',       label: 'Rodada de 32',    short: 'R32', order: 1 },
  { key: 'LAST_16',       label: 'Oitavas de Final', short: 'R16', order: 2 },
  { key: 'QUARTER_FINALS',label: 'Quartas de Final', short: 'QF',  order: 3 },
  { key: 'SEMI_FINALS',   label: 'Semifinais',       short: 'SF',  order: 4 },
  { key: 'THIRD_PLACE',   label: '3º Lugar',         short: '3L',  order: 5 },
  { key: 'FINAL',         label: 'Final',             short: 'FIN', order: 6 },
];
const STAGE_KEYS = new Set(STAGES.map((s) => s.key));

let _cache = { data: null, at: 0 };
const CACHE_TTL_MS = 60_000;

async function fetchKnockout() {
  if (_cache.data && Date.now() - _cache.at < CACHE_TTL_MS) return _cache.data;

  const res = await fetch(FD_URL, {
    headers: { 'X-Auth-Token': FD_TOKEN, 'User-Agent': 'bolao-copa-2026' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`football-data HTTP ${res.status}`);
  const data = await res.json();

  const [teams] = await pool.query('SELECT name, name_en, flag_emoji FROM teams');
  const teamByEn = new Map(teams.map((t) => [t.name_en.toLowerCase(), t]));

  function enrich(apiTeam) {
    if (!apiTeam?.name) return null;
    const local = teamByEn.get(apiTeam.name.toLowerCase());
    return {
      name: local?.name ?? apiTeam.name,
      flag: local?.flag_emoji ?? '🏳️',
    };
  }

  const grouped = Object.fromEntries(STAGES.map((s) => [s.key, []]));

  for (const m of data.matches ?? []) {
    if (!STAGE_KEYS.has(m.stage)) continue;
    grouped[m.stage].push({
      id: m.id,
      utcDate: m.utcDate,
      status: m.status,           // TIMED | SCHEDULED | IN_PLAY | PAUSED | FINISHED
      home: enrich(m.homeTeam),
      away: enrich(m.awayTeam),
      homeScore: m.score?.fullTime?.home ?? null,
      awayScore: m.score?.fullTime?.away ?? null,
      winner: m.score?.winner ?? null, // HOME_TEAM | AWAY_TEAM | DRAW
    });
  }

  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  }

  const result = { stages: STAGES.map((s) => ({ ...s, matches: grouped[s.key] })) };
  _cache = { data: result, at: Date.now() };
  return result;
}

router.get('/', async (_req, res) => {
  try {
    res.json(await fetchKnockout());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
