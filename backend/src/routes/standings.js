import { Router } from 'express';
import pool from '../config/database.js';

const router = Router();
const TOKEN = process.env.FOOTBALL_DATA_TOKEN || '';
const BASE = 'https://api.football-data.org/v4/competitions/WC';
const TTL = 90_000; // 90s — atualizado via ESPN a cada ~2min

const cache = { standings: null, scorers: null, ts: 0 };

// Calcula a classificação de cada grupo a partir dos matches do banco
async function computeFromDB() {
  const [rows] = await pool.query(`
    SELECT
      t.name, t.flag_emoji, t.group_id,
      COUNT(m.id)                                                           AS played,
      SUM(CASE
            WHEN m.home_team_id = t.id AND m.home_score > m.away_score THEN 1
            WHEN m.away_team_id = t.id AND m.away_score > m.home_score THEN 1
            ELSE 0 END)                                                     AS won,
      SUM(CASE
            WHEN (m.home_team_id = t.id OR m.away_team_id = t.id)
              AND m.home_score = m.away_score                               THEN 1
            ELSE 0 END)                                                     AS draw,
      SUM(CASE
            WHEN m.home_team_id = t.id AND m.home_score < m.away_score THEN 1
            WHEN m.away_team_id = t.id AND m.away_score < m.home_score THEN 1
            ELSE 0 END)                                                     AS lost,
      SUM(CASE
            WHEN m.home_team_id = t.id THEN COALESCE(m.home_score, 0)
            WHEN m.away_team_id = t.id THEN COALESCE(m.away_score, 0)
            ELSE 0 END)                                                     AS goalsFor,
      SUM(CASE
            WHEN m.home_team_id = t.id THEN COALESCE(m.away_score, 0)
            WHEN m.away_team_id = t.id THEN COALESCE(m.home_score, 0)
            ELSE 0 END)                                                     AS goalsAgainst
    FROM teams t
    LEFT JOIN matches m
           ON (m.home_team_id = t.id OR m.away_team_id = t.id)
          AND m.stage = 'GROUP_STAGE'
          AND m.home_score IS NOT NULL
          AND m.away_score IS NOT NULL
    GROUP BY t.id, t.name, t.flag_emoji, t.group_id
    ORDER BY t.group_id
  `);

  const groupMap = {};
  for (const r of rows) {
    const g = r.group_id;
    if (!groupMap[g]) groupMap[g] = [];
    const gf   = Number(r.goalsFor);
    const ga   = Number(r.goalsAgainst);
    const won  = Number(r.won);
    const draw = Number(r.draw);
    const lost = Number(r.lost);
    groupMap[g].push({
      team:           r.name,
      flag:           r.flag_emoji,
      played:         Number(r.played),
      won, draw, lost,
      goalsFor:       gf,
      goalsAgainst:   ga,
      goalDifference: gf - ga,
      points:         won * 3 + draw,
    });
  }

  // Ordena: pts → saldo → gols pró → vitórias
  const rawGroups = Object.entries(groupMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, table]) => {
      table.sort((a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor ||
        b.won - a.won
      );
      table.forEach((t, i) => { t.position = i + 1; });
      return { group, table };
    });

  return rawGroups;
}

/**
 * Copa 2026: 12 grupos de 4 times
 *   - 1º e 2º de cada grupo → 24 classificados diretos
 *   - 8 melhores 3os colocados (de 12) → +8 classificados
 */
function computeClassification(groups) {
  const thirds = groups
    .map((g) => g.table[2] ? { ...g.table[2], group: g.group } : null)
    .filter(Boolean);

  const thirdsRanked = [...thirds].sort((a, b) =>
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    b.won - a.won
  );
  const best3rdTeams = new Set(thirdsRanked.slice(0, 8).map((t) => t.team));

  const annotated = groups.map((g) => ({
    ...g,
    table: g.table.map((row) => {
      let classif = 'out';
      if (row.position <= 2) classif = 'direct';
      else if (row.position === 3 && best3rdTeams.has(row.team)) classif = 'best3rd';
      return { ...row, classif };
    }),
  }));

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

  const classified = {
    direct: annotated.flatMap((g) =>
      g.table.filter((r) => r.classif === 'direct').map((r) => ({ ...r, group: g.group }))
    ),
    best3rd: best3rds.filter((t) => t.qualified),
  };

  return { groups: annotated, best3rds, classified };
}

// GET /api/standings → classificação calculada do banco (ESPN mantém atualizado)
router.get('/', async (_req, res) => {
  try {
    if (cache.standings && Date.now() - cache.ts < TTL) return res.json(cache.standings);

    const rawGroups = await computeFromDB();
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

// GET /api/standings/scorers → artilheiros (ainda via fd.org — ESPN não expõe isso facilmente)
router.get('/scorers', async (_req, res) => {
  try {
    if (cache.scorers && Date.now() - cache.ts < TTL) return res.json(cache.scorers);

    const res2 = await fetch(`${BASE}/scorers?limit=20`, {
      headers: { 'X-Auth-Token': TOKEN },
      signal: AbortSignal.timeout(15000),
    });
    if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
    const data = await res2.json();

    // Busca flags do banco para completar os nomes do fd.org
    const [teamRows] = await pool.query('SELECT name_en, flag_emoji FROM teams');
    const flagMap = Object.fromEntries(teamRows.map((r) => [r.name_en.toLowerCase(), r.flag_emoji]));
    const getFlag = (name) => flagMap[(name || '').toLowerCase()] || '🏳️';

    const result = (data.scorers || []).map((s, i) => ({
      rank: i + 1,
      player: s.player.name,
      team: s.team.name,
      flag: getFlag(s.team.name),
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
