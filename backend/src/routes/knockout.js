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

let _cache    = { data: null, at: 0 };
let _inFlight = null;
const CACHE_TTL_MS = 5 * 60_000; // 5 minutos

async function doFetchKnockout() {
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
    return { name: local?.name ?? apiTeam.name, flag: local?.flag_emoji ?? '🏳️' };
  }

  const grouped = Object.fromEntries(STAGES.map((s) => [s.key, []]));
  for (const m of data.matches ?? []) {
    if (!STAGE_KEYS.has(m.stage)) continue;
    grouped[m.stage].push({
      id:        m.id,
      utcDate:   m.utcDate,
      status:    m.status,
      home:      enrich(m.homeTeam),
      away:      enrich(m.awayTeam),
      homeScore: m.score?.fullTime?.home ?? null,
      awayScore: m.score?.fullTime?.away ?? null,
      winner:    m.score?.winner ?? null,
    });
  }
  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  }

  const result = { stages: STAGES.map((s) => ({ ...s, matches: grouped[s.key] })) };
  _cache = { data: result, at: Date.now() };
  return result;
}

// Stale-while-revalidate: serve cache antigo imediatamente e atualiza em background.
// Evita timeout no cliente quando a football-data.org demora a responder.
async function fetchKnockout() {
  const fresh = _cache.data && Date.now() - _cache.at < CACHE_TTL_MS;
  if (fresh) return _cache.data;

  if (_cache.data) {
    // Dado antigo disponível: retorna agora e atualiza em background
    if (!_inFlight) {
      _inFlight = doFetchKnockout()
        .catch((e) => console.warn('⚠️  Knockout background refresh falhou:', e.message))
        .finally(() => { _inFlight = null; });
    }
    return _cache.data;
  }

  // Primeira carga (sem cache): aguarda — deduplica chamadas concorrentes
  if (!_inFlight) _inFlight = doFetchKnockout().finally(() => { _inFlight = null; });
  return _inFlight;
}

router.get('/', async (req, res) => {
  try {
    // Clone para não mutar o cache
    const raw  = await fetchKnockout();
    const data = JSON.parse(JSON.stringify(raw));

    // Coleta todos os fd_match_id retornados pela API
    const fdIds = data.stages
      .flatMap((s) => s.matches.map((m) => m.id))
      .filter((id) => typeof id === 'number');

    if (fdIds.length > 0) {
      const [dbRows] = await pool.query(
        `SELECT fd_match_id, id AS db_id,
                (UTC_TIMESTAMP() >= kick_off_utc) AS is_locked,
                home_score, away_score, status,
                live_minute, live_injury_time,
                home_scorers, away_scorers
         FROM matches WHERE fd_match_id IN (?)`,
        [fdIds]
      );
      const dbMap = new Map(
        dbRows.map((r) => [r.fd_match_id, {
          dbId:         r.db_id,
          locked:       Boolean(Number(r.is_locked)),
          homeScore:    r.home_score,
          awayScore:    r.away_score,
          status:       r.status,         // scheduled | live | paused | finished
          liveMinute:   r.live_minute,
          liveInjury:   r.live_injury_time,
          homeScorers:  r.home_scorers,
          awayScorers:  r.away_scorers,
        }])
      );

      // Palpites do usuário logado (se houver player_id)
      const playerId = req.user?.player_id;
      let predMap = new Map();
      if (playerId) {
        const dbIds = dbRows.map((r) => r.db_id);
        if (dbIds.length > 0) {
          const [preds] = await pool.query(
            'SELECT match_id, home_score, away_score FROM predictions WHERE player_id = ? AND match_id IN (?)',
            [playerId, dbIds]
          );
          predMap = new Map(preds.map((p) => [p.match_id, { home: p.home_score, away: p.away_score }]));
        }
      }

      // Injeta nas partidas — placar/status vêm do banco (atualizado pelo scoresFetcher a cada 2min)
      for (const stage of data.stages) {
        for (const m of stage.matches) {
          const db = dbMap.get(m.id);
          if (db) {
            m.dbMatchId   = db.dbId;
            m.locked      = db.locked;
            // Sobrescreve placar da API (fullTime) com o do banco (atualizado em tempo real)
            if (db.homeScore != null) m.homeScore = db.homeScore;
            if (db.awayScore != null) m.awayScore = db.awayScore;
            if (db.status)           m.status     = db.status;   // live | paused | finished
            m.liveMinute  = db.liveMinute ?? null;
            m.liveInjury  = db.liveInjury ?? null;
            m.homeScorers = db.homeScorers ? JSON.parse(db.homeScorers) : [];
            m.awayScorers = db.awayScorers ? JSON.parse(db.awayScorers) : [];
            const pred    = predMap.get(db.dbId);
            if (pred) m.myPrediction = pred;
          }
        }
      }
    }

    res.json(data);
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
