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

// ── Projeção baseada na classificação atual ───────────────────────────────────
// Copa 2026: 12 grupos (A-L), top-2 de cada (24) + 8 melhores 3os = 32 times
// Estrutura simplificada do bracket: grupos A-F no lado esquerdo, G-L no direito
// 'BEST3RD' = melhores 3os colocados (ordenados por pts/SG/GF)
const BRACKET_SLOTS = [
  // Lado esquerdo — grupos A-F
  ['A', 1, 'B', 2], ['B', 1, 'A', 2],
  ['C', 1, 'D', 2], ['D', 1, 'C', 2],
  ['E', 1, 'F', 2], ['F', 1, 'E', 2],
  ['BEST3RD', 1, 'BEST3RD', 2],
  ['BEST3RD', 3, 'BEST3RD', 4],
  // Lado direito — grupos G-L
  ['G', 1, 'H', 2], ['H', 1, 'G', 2],
  ['I', 1, 'J', 2], ['J', 1, 'I', 2],
  ['K', 1, 'L', 2], ['L', 1, 'K', 2],
  ['BEST3RD', 5, 'BEST3RD', 6],
  ['BEST3RD', 7, 'BEST3RD', 8],
];

const FD_STANDINGS_URL = 'https://api.football-data.org/v4/competitions/WC/standings';
let _projCache = { data: null, at: 0 };
const PROJ_TTL = 5 * 60_000;

router.get('/projection', async (_req, res) => {
  try {
    if (_projCache.data && Date.now() - _projCache.at < PROJ_TTL) {
      return res.json(_projCache.data);
    }

    const [fdRes, [teamRows]] = await Promise.all([
      fetch(FD_STANDINGS_URL, {
        headers: { 'X-Auth-Token': FD_TOKEN, 'User-Agent': 'bolao-copa-2026' },
        signal: AbortSignal.timeout(15_000),
      }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`FD HTTP ${r.status}`)))),
      pool.query('SELECT name_en, flag_emoji FROM teams'),
    ]);

    const flagMap = new Map(teamRows.map((t) => [t.name_en.toLowerCase(), t.flag_emoji]));
    const getFlag = (name) => flagMap.get((name || '').toLowerCase()) || '🏳️';

    // Monta mapa de grupos: { 'A': [{name, flag, points, gd, gf, won, played}] }
    const groupMap = {};
    for (const s of fdRes.standings || []) {
      const key = s.group.replace(/^GROUP_/, '');
      groupMap[key] = s.table.map((row) => ({
        position: row.position,
        name: row.team.name,
        flag: getFlag(row.team.name),
        points: row.points,
        gd: row.goalDifference,
        gf: row.goalsFor,
        won: row.won,
        played: row.playedGames,
      }));
    }

    // Melhores 3os colocados (todos os 12 grupos, ordenados)
    const thirds = Object.entries(groupMap)
      .map(([g, t]) => (t[2] ? { ...t[2], group: g } : null))
      .filter(Boolean)
      .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || b.won - a.won);

    function slot(group, pos) {
      if (group === 'BEST3RD') {
        const t = thirds[pos - 1];
        return t
          ? { team: { name: t.name, flag: t.flag }, label: `3º Grupo ${t.group}` }
          : { team: null, label: `3º lugar #${pos}` };
      }
      const t = groupMap[group]?.[pos - 1];
      return t
        ? { team: { name: t.name, flag: t.flag }, label: `${pos}º Grupo ${group}` }
        : { team: null, label: `${pos}º Grupo ${group}` };
    }

    const matches = BRACKET_SLOTS.map(([hg, hp, ag, ap], i) => {
      const h = slot(hg, hp);
      const a = slot(ag, ap);
      return {
        id: `proj-${i}`,
        stage: 'LAST_32',
        utcDate: null,
        status: 'PROJECTED',
        home: h.team,
        homeLabel: h.label,
        away: a.team,
        awayLabel: a.label,
        homeScore: null,
        awayScore: null,
        winner: null,
        isProjection: true,
      };
    });

    _projCache = { data: { matches, isProjection: true }, at: Date.now() };
    res.json(_projCache.data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
