import pool from '../config/database.js';

/**
 * Busca placares das APIs externas e atualiza a tabela `matches`.
 * Fontes (em ordem de prioridade):
 *   1. worldcup26.ir   (tempo real, sem auth)
 *   2. openfootball     (GitHub raw, fallback)
 */

const PRIMARY = process.env.SCORES_API_PRIMARY || 'https://worldcup26.ir/get/games';
const FALLBACK =
  process.env.SCORES_API_FALLBACK ||
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

// Normalização de nomes (variações da API → name_en do banco)
const TEAM_MAP = {
  'Korea Republic': 'South Korea',
  'Republic of Korea': 'South Korea',
  Türkiye: 'Turkey',
  Turkiye: 'Turkey',
  'IR Iran': 'Iran',
  "Côte d'Ivoire": 'Ivory Coast',
  "Cote d'Ivoire": 'Ivory Coast',
  'Congo DR': 'DR Congo',
  'DR Congo': 'DR Congo',
  'Cabo Verde': 'Cape Verde',
  'Cape Verde Islands': 'Cape Verde',
  Czech: 'Czechia',
  'Czech Republic': 'Czechia',
  USA: 'United States',
  'United States of America': 'United States',
  Bosnia: 'Bosnia and Herzegovina',
  'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
  Curaçao: 'Curacao',
  Holland: 'Netherlands',
};

function normalizeName(raw) {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  return TEAM_MAP[trimmed] || trimmed;
}

async function fetchJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'bolao-copa-2026' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Converte payloads heterogêneos em uma lista normalizada:
 *   [{ home, away, homeScore, awayScore, finished }]
 */
function parsePrimary(data) {
  // Formato desconhecido/variável de worldcup26.ir — tentamos achar um array de jogos.
  const games = Array.isArray(data)
    ? data
    : data?.games || data?.matches || data?.data || [];

  const out = [];
  for (const g of games) {
    const home = normalizeName(
      g.home || g.home_team || g.team1 || g.homeTeam?.name || g.teams?.home?.name
    );
    const away = normalizeName(
      g.away || g.away_team || g.team2 || g.awayTeam?.name || g.teams?.away?.name
    );
    if (!home || !away) continue;

    const hs = pickScore(g.home_score, g.homeScore, g.score?.home, g.goals?.home, g.score1);
    const as = pickScore(g.away_score, g.awayScore, g.score?.away, g.goals?.away, g.score2);

    const statusStr = String(g.status || g.state || '').toLowerCase();
    const finished =
      statusStr.includes('finish') ||
      statusStr.includes('ft') ||
      statusStr.includes('ended') ||
      g.finished === true;

    out.push({ home, away, homeScore: hs, awayScore: as, finished });
  }
  return out;
}

function parseFallback(data) {
  // openfootball: { rounds: [ { matches: [ { team1, team2, score: { ft:[x,y] } } ] } ] }
  const out = [];
  const rounds = data?.rounds || [];
  for (const round of rounds) {
    for (const m of round.matches || []) {
      const home = normalizeName(m.team1?.name || m.team1);
      const away = normalizeName(m.team2?.name || m.team2);
      if (!home || !away) continue;

      const ft = m.score?.ft;
      const hs = Array.isArray(ft) ? ft[0] : null;
      const as = Array.isArray(ft) ? ft[1] : null;

      out.push({
        home,
        away,
        homeScore: hs ?? null,
        awayScore: as ?? null,
        finished: Array.isArray(ft) && ft.length === 2,
      });
    }
  }
  return out;
}

function pickScore(...vals) {
  for (const v of vals) {
    if (v != null && v !== '' && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

/**
 * Atualiza status dos jogos com base no horário (independe da API externa).
 *   scheduled → live   quando NOW >= kick_off
 *   live → finished     quando NOW >= kick_off + 2h30 (se não veio resultado)
 */
export async function updateMatchStatuses() {
  await pool.query(
    `UPDATE matches
       SET status = 'live'
     WHERE status = 'scheduled' AND UTC_TIMESTAMP() >= kick_off_utc`
  );
  await pool.query(
    `UPDATE matches
       SET status = 'finished'
     WHERE status = 'live'
       AND UTC_TIMESTAMP() >= DATE_ADD(kick_off_utc, INTERVAL 150 MINUTE)`
  );
}

/**
 * Sincroniza placares. Retorna { updated, source }.
 */
export async function syncScores() {
  let games = [];
  let source = null;

  try {
    const data = await fetchJson(PRIMARY);
    games = parsePrimary(data);
    if (games.length) source = 'primary';
  } catch (err) {
    console.warn('⚠️  API primária falhou:', err.message);
  }

  if (!games.length) {
    try {
      const data = await fetchJson(FALLBACK);
      games = parseFallback(data);
      if (games.length) source = 'fallback';
    } catch (err) {
      console.warn('⚠️  API fallback falhou:', err.message);
    }
  }

  // Atualiza status por tempo mesmo se nenhuma API respondeu
  await updateMatchStatuses();

  if (!games.length) {
    console.log('ℹ️  Nenhum jogo retornado pelas APIs.');
    return { updated: 0, source: null };
  }

  // Mapa name_en (lowercase) → match. Carrega jogos do banco.
  const [matches] = await pool.query(
    `SELECT m.id, m.home_score, m.away_score, m.result_source,
            t1.name_en AS home_en, t2.name_en AS away_en
     FROM matches m
     JOIN teams t1 ON t1.id = m.home_team_id
     JOIN teams t2 ON t2.id = m.away_team_id`
  );

  const key = (h, a) => `${h.toLowerCase()}|${a.toLowerCase()}`;
  const index = new Map();
  for (const m of matches) index.set(key(m.home_en, m.away_en), m);

  let updated = 0;
  for (const g of games) {
    if (g.homeScore == null || g.awayScore == null) continue;
    const m = index.get(key(g.home, g.away));
    if (!m) continue;

    // Não sobrescrever resultado inserido manualmente
    if (m.result_source === 'manual') continue;

    // Só atualiza se mudou
    if (m.home_score === g.homeScore && m.away_score === g.awayScore) continue;

    const newStatus = g.finished ? 'finished' : 'live';
    await pool.query(
      `UPDATE matches
         SET home_score = ?, away_score = ?, status = ?,
             result_source = 'api', result_updated_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [g.homeScore, g.awayScore, newStatus, m.id]
    );
    updated++;
  }

  console.log(`✅ Sincronização concluída (${source}): ${updated} resultados atualizados`);
  return { updated, source };
}

let interval = null;

export function startScoresSync() {
  const ms = Number(process.env.SCORES_SYNC_INTERVAL_MS) || 120000;
  // Primeira execução logo após o boot
  syncScores().catch((e) => console.error('Erro no sync inicial:', e.message));
  interval = setInterval(() => {
    syncScores().catch((e) => console.error('Erro no sync:', e.message));
  }, ms);
  console.log(`⏱️  Sync de placares a cada ${ms / 1000}s`);
}

export function stopScoresSync() {
  if (interval) clearInterval(interval);
}
