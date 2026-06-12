import pool from '../config/database.js';
import { broadcast } from '../sse/broker.js';

/**
 * Busca placares das APIs externas e atualiza a tabela `matches`.
 * Fontes (em ordem de prioridade):
 *   1. worldcup26.ir        (tempo real, sem auth)
 *   2. football-data.org    (confiável, requer token, live scores)
 *   3. openfootball         (GitHub raw, último recurso — só calendário)
 */

const PRIMARY = process.env.SCORES_API_PRIMARY || 'https://worldcup26.ir/get/games';
const FOOTBALL_DATA_URL = 'https://api.football-data.org/v4/competitions/WC/matches';
const FOOTBALL_DATA_TOKEN = process.env.FOOTBALL_DATA_TOKEN || '';
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
  'Democratic Republic of the Congo': 'DR Congo',
  'Cabo Verde': 'Cape Verde',
  'Cape Verde Islands': 'Cape Verde',
  Czech: 'Czechia',
  'Czech Republic': 'Czechia',
  USA: 'United States',
  'United States of America': 'United States',
  Bosnia: 'Bosnia and Herzegovina',
  'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
  Curaçao: 'Curacao',
  Holland: 'Netherlands',
};

// Formato worldcup26.ir: {"J. Quinones 9'","R. Jimenez 67'"} (chaves em vez de colchetes)
function parseScorers(raw) {
  if (!raw || raw === 'null') return [];
  const results = [];
  // \p{L} cobre letras Unicode (ć, č, ñ, etc.); separador e apostrofo = U+0027
  const re = new RegExp("(\\p{L}[\\p{L}\\s.'-]*)\\s+(\\d+)'", 'gu');
  let m;
  while ((m = re.exec(raw)) !== null) {
    const name = m[1].trim();
    if (name.length > 1) results.push({ name, minute: Number(m[2]) });
  }
  return results;
}

function normalizeName(raw) {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  return TEAM_MAP[trimmed] || trimmed;
}

async function fetchJson(url, timeoutMs = 25000, extraHeaders = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'bolao-copa-2026', ...extraHeaders },
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
      g.home_team_name_en || g.home || g.home_team || g.team1 || g.homeTeam?.name || g.teams?.home?.name
    );
    const away = normalizeName(
      g.away_team_name_en || g.away || g.away_team || g.team2 || g.awayTeam?.name || g.teams?.away?.name
    );
    if (!home || !away) continue;

    // worldcup26.ir traz home_score="0" mesmo para jogos não iniciados.
    // Só consideramos o placar quando o jogo realmente começou.
    const elapsed = String(g.time_elapsed || '').toLowerCase();
    const statusStr = String(g.status || g.state || '').toLowerCase();
    const finishedFlag = String(g.finished ?? '').toUpperCase() === 'TRUE' || g.finished === true;
    const finished =
      finishedFlag ||
      statusStr.includes('finish') ||
      statusStr.includes('ft') ||
      statusStr.includes('ended');

    const hasScore = finished || (!!elapsed && elapsed !== 'notstarted') || statusStr.includes('live');

    const hs = hasScore
      ? pickScore(g.home_score, g.homeScore, g.score?.home, g.goals?.home, g.score1)
      : null;
    const as = hasScore
      ? pickScore(g.away_score, g.awayScore, g.score?.away, g.goals?.away, g.score2)
      : null;

    // worldcup26.ir: pausa de intervalo ou interrupção (tempestade, etc.)
    const PAUSED_ELAPSED = new Set(['ht', 'pause', 'paused', 'suspended', 'interruption', 'break']);
    const paused = !finished && (PAUSED_ELAPSED.has(elapsed) || statusStr.includes('suspend') || statusStr.includes('interrupt'));

    // Tenta extrair minuto do time_elapsed se vier como número (ex: "67" ou "45+2")
    let minute = null;
    let injuryTime = null;
    if (!finished && !paused) {
      const plusMatch = elapsed.match(/^(\d+)\+(\d+)$/);
      const numMatch = elapsed.match(/^(\d+)$/);
      if (plusMatch) { minute = Number(plusMatch[1]); injuryTime = Number(plusMatch[2]); }
      else if (numMatch) { minute = Number(numMatch[1]); }
    }

    const homeScorers = parseScorers(g.home_scorers);
    const awayScorers = parseScorers(g.away_scorers);

    out.push({ home, away, homeScore: hs, awayScore: as, finished, paused, minute, injuryTime, homeScorers, awayScorers });
  }
  return out;
}

function parseFallback(data) {
  // openfootball: { rounds: [ { matches: [...] } ] } ou { matches: [...] }
  const out = [];
  const rounds = data?.rounds || [];
  const flat = data?.matches || [];
  const allMatches = rounds.length
    ? rounds.flatMap((r) => r.matches || [])
    : flat;

  for (const m of allMatches) {
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
  return out;
}

function parseFootballData(data) {
  // football-data.org: { matches: [ { homeTeam, awayTeam, status, score: { fullTime: { home, away } } } ] }
  // PAUSED = intervalo; SUSPENDED = interrupção (clima, emergência)
  const SCORE_STATUSES = new Set(['IN_PLAY', 'PAUSED', 'SUSPENDED', 'FINISHED']);
  const out = [];
  for (const m of data?.matches || []) {
    const home = normalizeName(m.homeTeam?.name);
    const away = normalizeName(m.awayTeam?.name);
    if (!home || !away) continue;

    const status = m.status || '';
    const finished = status === 'FINISHED';
    const paused = status === 'PAUSED' || status === 'SUSPENDED';
    const hasScore = SCORE_STATUSES.has(status);

    const hs = hasScore ? (m.score?.fullTime?.home ?? null) : null;
    const as = hasScore ? (m.score?.fullTime?.away ?? null) : null;

    // football-data.org fornece minute (inteiro) e injuryTime para jogos IN_PLAY
    const minute = (m.minute != null && !finished) ? Number(m.minute) : null;
    const injuryTime = (m.injuryTime != null && !finished) ? Number(m.injuryTime) : null;

    out.push({ home, away, homeScore: hs, awayScore: as, finished, paused, minute, injuryTime, homeScorers: [], awayScorers: [] });
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
 *   scheduled → live     quando NOW >= kick_off
 *   live/paused → finished  quando NOW >= kick_off + 4h (folga para jogos suspensos)
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
     WHERE status IN ('live', 'paused')
       AND UTC_TIMESTAMP() >= DATE_ADD(kick_off_utc, INTERVAL 240 MINUTE)`
  );
}

/**
 * Sincroniza placares. Retorna { updated, source }.
 */
export async function syncScores() {
  let games = [];
  let source = null;

  // Busca primária e football-data.org em paralelo.
  // football-data.org é sempre consultada para jogos ao vivo (IN_PLAY/PAUSED/FINISHED)
  // e sobrescreve a primária quando esta ainda não atualizou o jogo.
  const [primaryResult, fdResult] = await Promise.allSettled([
    fetchJson(PRIMARY),
    FOOTBALL_DATA_TOKEN
      ? fetchJson(`${FOOTBALL_DATA_URL}?status=IN_PLAY,PAUSED,FINISHED`, 15000, { 'X-Auth-Token': FOOTBALL_DATA_TOKEN })
      : Promise.reject(new Error('sem token')),
  ]);

  if (primaryResult.status === 'fulfilled') {
    games = parsePrimary(primaryResult.value);
    if (games.length) source = 'primary';
  } else {
    console.warn('⚠️  API primária falhou:', primaryResult.reason.message);
  }

  // Mescla football-data.org: sobrescreve jogos que ela conhece (ao vivo/encerrado).
  // Goleadores da fonte primária são preservados quando football-data.org não fornece.
  if (fdResult.status === 'fulfilled') {
    const fdGames = parseFootballData(fdResult.value);
    if (fdGames.length) {
      const fdKey = (h, a) => `${h.toLowerCase()}|${a.toLowerCase()}`;
      const fdMap = new Map(fdGames.map((g) => [fdKey(g.home, g.away), g]));
      games = games.map((g) => {
        const fd = fdMap.get(fdKey(g.home, g.away));
        if (!fd) return g;
        return {
          ...fd,
          homeScorers: fd.homeScorers?.length ? fd.homeScorers : g.homeScorers,
          awayScorers: fd.awayScorers?.length ? fd.awayScorers : g.awayScorers,
        };
      });
      // Adiciona jogos que só a football-data.org conhece
      for (const [k, g] of fdMap) {
        if (!games.some((pg) => fdKey(pg.home, pg.away) === k)) games.push(g);
      }
      source = source ? `${source}+fd` : 'football-data';
    }
  } else if (!games.length) {
    console.warn('⚠️  football-data.org falhou:', fdResult.reason.message);
  }

  if (!games.length) {
    try {
      const data = await fetchJson(FALLBACK);
      games = parseFallback(data);
      if (games.length) source = 'openfootball';
    } catch (err) {
      console.warn('⚠️  API openfootball falhou:', err.message);
    }
  }

  if (!games.length) {
    // Atualiza status por tempo mesmo sem dados da API
    await updateMatchStatuses();
    console.log('ℹ️  Nenhum jogo retornado pelas APIs.');
    return { updated: 0, source: null };
  }

  // Mapa name_en (lowercase) → match. Carrega jogos do banco.
  const [matches] = await pool.query(
    `SELECT m.id, m.group_id, m.home_score, m.away_score, m.status, m.result_source,
            m.live_minute, m.home_scorers, m.away_scorers,
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
    const m = index.get(key(g.home, g.away));
    if (!m) continue;

    // Se a API ainda não reportou placar mas o jogo já está live no banco,
    // aceita 0×0 para exibir corretamente (API lenta a atualizar time_elapsed).
    if (g.homeScore == null || g.awayScore == null) {
      if (m.status === 'live' && m.home_score == null && !g.finished) {
        g.homeScore = 0;
        g.awayScore = 0;
      } else {
        continue;
      }
    }

    // Não sobrescrever resultado inserido manualmente
    if (m.result_source === 'manual') continue;

    const newStatus = g.finished ? 'finished' : g.paused ? 'paused' : 'live';
    const newMinute = g.finished ? null : (g.minute ?? null);
    const newInjury = g.finished ? null : (g.injuryTime ?? null);
    const newHomeScorers = g.homeScorers?.length ? JSON.stringify(g.homeScorers) : null;
    const newAwayScorers = g.awayScorers?.length ? JSON.stringify(g.awayScorers) : null;

    // Pula se placar, status, minuto e goleadores já estão atualizados
    const scorersUnchanged =
      (newHomeScorers == null || m.home_scorers != null) &&
      (newAwayScorers == null || m.away_scorers != null);
    if (
      m.home_score === g.homeScore &&
      m.away_score === g.awayScore &&
      m.status === newStatus &&
      m.live_minute === newMinute &&
      scorersUnchanged
    ) continue;

    await pool.query(
      `UPDATE matches
         SET home_score = ?, away_score = ?, status = ?,
             live_minute = ?, live_injury_time = ?,
             home_scorers = COALESCE(?, home_scorers),
             away_scorers = COALESCE(?, away_scorers),
             result_source = 'api', result_updated_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [g.homeScore, g.awayScore, newStatus, newMinute, newInjury, newHomeScorers, newAwayScorers, m.id]
    );
    broadcast('result', {
      match_id: m.id,
      group_id: m.group_id,
      home_score: g.homeScore,
      away_score: g.awayScore,
      status: newStatus,
      live_minute: newMinute,
      live_injury_time: newInjury,
    });
    updated++;
  }

  // Timer tem a palavra final: garante que jogos com 4h+ não sejam revertidos para 'live' pela API
  await updateMatchStatuses();

  if (updated > 0) {
    broadcast('ranking', {});
  }

  console.log(`✅ Sincronização concluída (${source}): ${updated} resultados atualizados`);
  return { updated, source };
}

// ── Sync de placares disparado no login (em segundo plano) ───────────────────
let _syncingScores = false;
let _lastScoresMs = 0;

function envInt(name, def) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/**
 * Atualiza os placares a cada login (em segundo plano).
 *  - trava contra execuções simultâneas;
 *  - throttle configurável (SCORES_LOGIN_SYNC_MIN_MS; 0 = sempre).
 * Nunca lança: erros só são logados (não pode quebrar o login).
 */
export async function syncScoresOnLogin() {
  const minInterval = envInt('SCORES_LOGIN_SYNC_MIN_MS', 0);
  const now = Date.now();

  if (_syncingScores) return { skipped: 'em andamento' };
  if (minInterval > 0 && now - _lastScoresMs < minInterval) return { skipped: 'throttled' };

  _syncingScores = true;
  try {
    const res = await syncScores();
    _lastScoresMs = Date.now();
    return res;
  } catch (err) {
    console.warn('⚠️  Sync de placares no login falhou:', err.message);
    return { error: err.message };
  } finally {
    _syncingScores = false;
  }
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
