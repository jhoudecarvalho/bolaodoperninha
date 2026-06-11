import { Router } from 'express';
import pool from '../config/database.js';

const router = Router();
const TOKEN = process.env.FOOTBALL_DATA_TOKEN || '';
const BASE = 'https://api.football-data.org/v4/competitions/WC';
const TTL = 5 * 60 * 1000; // 5 min

const cache = { standings: null, scorers: null, ts: 0 };

async function fetchFD(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'X-Auth-Token': TOKEN },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

let flagMap = null;
async function getFlags() {
  if (flagMap) return flagMap;
  const [rows] = await pool.query('SELECT name_en, flag_emoji FROM teams');
  flagMap = Object.fromEntries(rows.map((r) => [r.name_en.toLowerCase(), r.flag_emoji]));
  return flagMap;
}

function flag(flags, name) {
  return flags[(name || '').toLowerCase()] || '🏳';
}

/**
 * Copa 2026: 12 grupos de 4 times
 *   - 1º e 2º de cada grupo → 24 classificados diretos
 *   - 8 melhores 3os colocados (de 12) → +8 classificados
 * Critério de desempate entre 3os: pontos → saldo → gols pró → vitórias
 */
function computeClassification(groups) {
  // Coleta os 3os de cada grupo (só quando jogaram pelo menos 1 jogo)
  const thirds = groups
    .map((g) => g.table[2] ? { ...g.table[2], group: g.group } : null)
    .filter(Boolean);

  // Ordena melhores 3os
  const thirdsRanked = [...thirds].sort((a, b) =>
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    b.won - a.won
  );
  const best3rdTeams = new Set(thirdsRanked.slice(0, 8).map((t) => t.team));

  // Anota cada time com status de classificação
  const annotated = groups.map((g) => ({
    ...g,
    table: g.table.map((row) => {
      let classif = 'out';
      if (row.position <= 2) classif = 'direct';
      else if (row.position === 3 && best3rdTeams.has(row.team)) classif = 'best3rd';
      return { ...row, classif };
    }),
  }));

  // Lista dos melhores 3os com ranking
  const best3rds = thirdsRanked.map((t, i) => ({
    rank: i + 1,
    group: t.group,
    team: t.team,
    flag: t.flag,
    points: t.points,
    goalDifference: t.goalDifference,
    goalsFor: t.goalsFor,
    won: t.won,
    played: t.played,
    qualified: i < 8,
  }));

  // Resumo: todos os 32 classificados
  const classified = {
    direct: annotated.flatMap((g) =>
      g.table.filter((r) => r.classif === 'direct').map((r) => ({ ...r, group: g.group }))
    ),
    best3rd: best3rds.filter((t) => t.qualified),
  };

  return { groups: annotated, best3rds, classified };
}

// GET /api/standings → grupos com classificação calculada + melhores 3os
router.get('/', async (_req, res) => {
  try {
    if (cache.standings && Date.now() - cache.ts < TTL) return res.json(cache.standings);

    const [data, flags] = await Promise.all([fetchFD('/standings'), getFlags()]);

    const rawGroups = (data.standings || []).map((s) => ({
      group: (s.group || '').replace(/^(GROUP_|Group )/, '') || '?',
      table: (s.table || []).map((row) => ({
        position: row.position,
        team: row.team.name,
        flag: flag(flags, row.team.name),
        played: row.playedGames,
        won: row.won,
        draw: row.draw,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDifference: row.goalDifference,
        points: row.points,
      })),
    }));

    const result = computeClassification(rawGroups);

    cache.standings = result;
    cache.ts = Date.now();
    res.json(result);
  } catch (err) {
    console.warn('⚠️  standings falhou:', err.message);
    if (cache.standings) return res.json(cache.standings);
    res.status(502).json({ error: 'Classificação indisponível' });
  }
});

// GET /api/standings/scorers → artilheiros
router.get('/scorers', async (_req, res) => {
  try {
    if (cache.scorers && Date.now() - cache.ts < TTL) return res.json(cache.scorers);

    const [data, flags] = await Promise.all([fetchFD('/scorers?limit=20'), getFlags()]);

    const result = (data.scorers || []).map((s, i) => ({
      rank: i + 1,
      player: s.player.name,
      team: s.team.name,
      flag: flag(flags, s.team.name),
      goals: s.goals ?? 0,
      assists: s.assists ?? 0,
      played: s.playedMatches ?? 0,
    }));

    cache.scorers = result;
    cache.ts = Date.now();
    res.json(result);
  } catch (err) {
    console.warn('⚠️  scorers falhou:', err.message);
    if (cache.scorers) return res.json(cache.scorers);
    res.status(502).json({ error: 'Artilheiros indisponível' });
  }
});

export default router;
