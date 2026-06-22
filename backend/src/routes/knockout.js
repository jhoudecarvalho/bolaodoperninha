import { Router } from 'express';
import pool from '../config/database.js';

const router = Router();

const STAGES = [
  { key: 'LAST_32',        label: 'Rodada de 32',     short: 'R32', order: 1 },
  { key: 'LAST_16',        label: 'Oitavas de Final',  short: 'R16', order: 2 },
  { key: 'QUARTER_FINALS', label: 'Quartas de Final',  short: 'QF',  order: 3 },
  { key: 'SEMI_FINALS',    label: 'Semifinais',         short: 'SF',  order: 4 },
  { key: 'THIRD_PLACE',    label: '3º Lugar',           short: '3L',  order: 5 },
  { key: 'FINAL',          label: 'Final',               short: 'FIN', order: 6 },
];
const STAGE_KEYS = new Set(STAGES.map((s) => s.key));

// DB winner ('home'/'away') → formato que o frontend espera ('HOME_TEAM'/'AWAY_TEAM')
function mapWinner(w) {
  if (w === 'home') return 'HOME_TEAM';
  if (w === 'away') return 'AWAY_TEAM';
  return w ?? null;
}

// Monta o bracket inteiramente do banco — ESPN já mantém scores/status/winner atualizados
async function buildFromDB(playerId) {
  const stageList = STAGES.map((s) => s.key);

  const [rows] = await pool.query(
    `SELECT
       m.id, m.fd_match_id, m.stage, m.kick_off_utc,
       m.status, m.home_score, m.away_score, m.winner,
       m.live_minute, m.live_injury_time,
       m.home_scorers, m.away_scorers,
       m.home_placeholder, m.away_placeholder,
       (UTC_TIMESTAMP() >= m.kick_off_utc) AS locked,
       t1.name AS home_name, t1.flag_emoji AS home_flag,
       t2.name AS away_name, t2.flag_emoji AS away_flag
     FROM matches m
     LEFT JOIN teams t1 ON t1.id = m.home_team_id
     LEFT JOIN teams t2 ON t2.id = m.away_team_id
     WHERE m.stage IN (?)
     ORDER BY m.kick_off_utc ASC`,
    [stageList]
  );

  // Palpites do jogador logado
  let predMap = new Map();
  if (playerId && rows.length) {
    const dbIds = rows.map((r) => r.id);
    const [preds] = await pool.query(
      'SELECT match_id, home_score, away_score FROM predictions WHERE player_id = ? AND match_id IN (?)',
      [playerId, dbIds]
    );
    predMap = new Map(preds.map((p) => [p.match_id, { home: p.home_score, away: p.away_score }]));
  }

  const grouped = Object.fromEntries(STAGES.map((s) => [s.key, []]));
  for (const r of rows) {
    if (!STAGE_KEYS.has(r.stage)) continue;
    const pred = predMap.get(r.id);
    grouped[r.stage].push({
      id:          r.fd_match_id ?? r.id,
      dbMatchId:   r.id,
      utcDate:     r.kick_off_utc,
      status:      r.status,
      locked:      Boolean(Number(r.locked)),
      home:        r.home_name ? { name: r.home_name, flag: r.home_flag } : null,
      away:        r.away_name ? { name: r.away_name, flag: r.away_flag } : null,
      homeLabel:   r.home_placeholder ?? null,
      awayLabel:   r.away_placeholder ?? null,
      homeScore:   r.home_score,
      awayScore:   r.away_score,
      winner:      mapWinner(r.winner),
      liveMinute:  r.live_minute,
      liveInjury:  r.live_injury_time,
      homeScorers: r.home_scorers ? JSON.parse(r.home_scorers) : [],
      awayScorers: r.away_scorers ? JSON.parse(r.away_scorers) : [],
      ...(pred ? { myPrediction: pred } : {}),
    });
  }

  return { stages: STAGES.map((s) => ({ ...s, matches: grouped[s.key] })) };
}

router.get('/', async (req, res) => {
  try {
    const playerId = req.user?.player_id ?? null;
    const data = await buildFromDB(playerId);
    res.json(data);
  } catch (err) {
    console.error('Knockout route error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Projeção baseada na classificação atual calculada do banco ─────────────────
let _projCache = { data: null, at: 0 };
const PROJ_TTL = 90_000; // 90s — DB é rápido, resultados mudam a cada ~2min via ESPN

const BRACKET_SLOTS = [
  ['A', 1, 'B', 2], ['B', 1, 'A', 2],
  ['C', 1, 'D', 2], ['D', 1, 'C', 2],
  ['E', 1, 'F', 2], ['F', 1, 'E', 2],
  ['BEST3RD', 1, 'BEST3RD', 2],
  ['BEST3RD', 3, 'BEST3RD', 4],
  ['G', 1, 'H', 2], ['H', 1, 'G', 2],
  ['I', 1, 'J', 2], ['J', 1, 'I', 2],
  ['K', 1, 'L', 2], ['L', 1, 'K', 2],
  ['BEST3RD', 5, 'BEST3RD', 6],
  ['BEST3RD', 7, 'BEST3RD', 8],
];

async function buildProjection() {
  // Calcula classificação diretamente do banco — sem API externa
  const [rows] = await pool.query(`
    SELECT
      t.name, t.flag_emoji, t.group_id,
      COUNT(m.id)                                                         AS played,
      SUM(CASE
            WHEN m.home_team_id = t.id AND m.home_score > m.away_score THEN 1
            WHEN m.away_team_id = t.id AND m.away_score > m.home_score THEN 1
            ELSE 0 END)                                                   AS won,
      SUM(CASE
            WHEN (m.home_team_id = t.id OR m.away_team_id = t.id)
              AND m.home_score = m.away_score                             THEN 1
            ELSE 0 END)                                                   AS draw,
      SUM(CASE
            WHEN m.home_team_id = t.id THEN COALESCE(m.home_score, 0)
            WHEN m.away_team_id = t.id THEN COALESCE(m.away_score, 0)
            ELSE 0 END)                                                   AS gf,
      SUM(CASE
            WHEN m.home_team_id = t.id THEN COALESCE(m.away_score, 0)
            WHEN m.away_team_id = t.id THEN COALESCE(m.home_score, 0)
            ELSE 0 END)                                                   AS ga
    FROM teams t
    LEFT JOIN matches m
           ON (m.home_team_id = t.id OR m.away_team_id = t.id)
          AND m.stage = 'GROUP_STAGE'
          AND m.home_score IS NOT NULL
          AND m.away_score IS NOT NULL
    GROUP BY t.id, t.name, t.flag_emoji, t.group_id
    ORDER BY t.group_id
  `);

  // Monta groupMap e calcula pontos
  const groupMap = {};
  for (const r of rows) {
    const g = r.group_id;
    if (!groupMap[g]) groupMap[g] = [];
    const pts = Number(r.won) * 3 + Number(r.draw);
    const gd  = Number(r.gf) - Number(r.ga);
    groupMap[g].push({
      name:   r.name,
      flag:   r.flag_emoji,
      points: pts,
      gd,
      gf:     Number(r.gf),
      won:    Number(r.won),
      played: Number(r.played),
    });
  }

  // Ordena cada grupo: pts → saldo → gols pró → vitórias
  for (const arr of Object.values(groupMap)) {
    arr.sort((a, b) =>
      b.points - a.points || b.gd - a.gd || b.gf - a.gf || b.won - a.won
    );
  }

  // Melhores 3os (8 de 12 avançam)
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
      id:           `proj-${i}`,
      stage:        'LAST_32',
      utcDate:      null,
      status:       'PROJECTED',
      home:         h.team,
      homeLabel:    h.label,
      away:         a.team,
      awayLabel:    a.label,
      homeScore:    null,
      awayScore:    null,
      winner:       null,
      isProjection: true,
    };
  });

  return { matches, isProjection: true };
}

router.get('/projection', async (_req, res) => {
  try {
    if (_projCache.data && Date.now() - _projCache.at < PROJ_TTL) {
      return res.json(_projCache.data);
    }
    const data = await buildProjection();
    _projCache = { data, at: Date.now() };
    res.json(data);
  } catch (err) {
    if (_projCache.data) return res.json(_projCache.data);
    res.status(502).json({ error: err.message });
  }
});

export default router;
