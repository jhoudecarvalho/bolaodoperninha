import pool from '../config/database.js';
import { broadcast } from '../sse/broker.js';

/**
 * Busca placares das APIs externas e atualiza a tabela `matches`.
 * Fontes (em ordem de prioridade):
 *   1. ESPN                 (primária — tempo real, sem auth, muito confiável)
 *   2. worldcup26.ir        (secundária — enriquece goleadores, cross-valida ESPN)
 *   3. football-data.org    (desempatador de conflitos ESPN × worldcup26.ir)
 *   4. openfootball         (GitHub raw, último recurso — só calendário)
 */

const ESPN_URL =
  process.env.ESPN_API_URL ||
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
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

    // winner vem da API e cobre pênaltis (placar empate, mas há um vencedor)
    const apiWinner = finished ? m.score?.winner : null;
    const winner =
      apiWinner === 'HOME_TEAM' ? 'home' :
      apiWinner === 'AWAY_TEAM' ? 'away' : null;

    // football-data.org fornece minute (inteiro) e injuryTime para jogos IN_PLAY
    const minute = (m.minute != null && !finished) ? Number(m.minute) : null;
    const injuryTime = (m.injuryTime != null && !finished) ? Number(m.injuryTime) : null;

    out.push({ home, away, homeScore: hs, awayScore: as, winner, finished, paused, minute, injuryTime, homeScorers: [], awayScorers: [] });
  }
  return out;
}

function parseESPN(data) {
  const out = [];
  for (const event of data?.events || []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;

    const state    = comp.status?.type?.state || '';
    const typeName = comp.status?.type?.name  || '';
    const finished = state === 'post';
    const paused   = typeName === 'STATUS_HALFTIME' || typeName === 'STATUS_SUSPENDED';
    const hasScore = finished || paused || state === 'in';

    let home = null, away = null;
    for (const c of comp.competitors || []) {
      const name  = normalizeName(c.team?.displayName);
      const score = hasScore ? Number(c.score) : null;
      if (c.homeAway === 'home') home = { name, score };
      else if (c.homeAway === 'away') away = { name, score };
    }
    if (!home || !away) continue;

    // Minuto ao vivo a partir do displayClock ("67'" ou "45'+2'")
    let minute = null, injuryTime = null;
    if (!finished && !paused && state === 'in') {
      const clock = comp.status?.displayClock || '';
      const plus   = clock.match(/^(\d+)'\+(\d+)'$/);
      const simple = clock.match(/^(\d+)'$/);
      if (plus)   { minute = Number(plus[1]);   injuryTime = Number(plus[2]); }
      else if (simple) { minute = Number(simple[1]); }
    }

    // Goleadores a partir do array details (inclui gols contra e pênaltis)
    const teamSide = {};
    for (const c of comp.competitors || []) teamSide[c.team?.id] = c.homeAway;
    const homeScorers = [], awayScorers = [];
    for (const d of comp.details || []) {
      if (!d.scoringPlay) continue;
      const side = teamSide[d.team?.id];
      const name = d.athletesInvolved?.[0]?.shortName || d.athletesInvolved?.[0]?.displayName || '?';
      const min  = Number((d.clock?.displayValue || '').replace(/[^0-9]/g, '')) || 0;
      if (side === 'home') homeScorers.push({ name, minute: min });
      else if (side === 'away') awayScorers.push({ name, minute: min });
    }

    // Vencedor (null em caso de empate)
    let winner = null;
    if (finished) {
      for (const c of comp.competitors || []) {
        if (c.winner) { winner = c.homeAway; break; }
      }
    }

    // Estádio e público
    const venue      = comp.venue?.fullName || null;
    const attendance = comp.attendance ? Number(comp.attendance) : null;

    // Estatísticas por time (posse, chutes, finalizações no gol, escanteios, faltas)
    const STAT_KEYS = { possessionPct: 'possession', totalShots: 'shots', shotsOnTarget: 'shotsOnTarget', wonCorners: 'corners', foulsCommitted: 'fouls' };
    let homeStats = null, awayStats = null;
    for (const c of comp.competitors || []) {
      if (!c.statistics?.length) continue;
      const stats = {};
      for (const s of c.statistics) {
        if (STAT_KEYS[s.name]) stats[STAT_KEYS[s.name]] = Number(s.displayValue);
      }
      if (Object.keys(stats).length) {
        if (c.homeAway === 'home') homeStats = stats;
        else if (c.homeAway === 'away') awayStats = stats;
      }
    }

    out.push({
      home: home.name, away: away.name,
      homeScore: home.score, awayScore: away.score,
      finished, paused, minute, injuryTime,
      homeScorers, awayScorers, winner,
      venue, attendance, homeStats, awayStats,
    });
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

  const fmtDate = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const todayUTC     = fmtDate(new Date());
  const yesterdayUTC = fmtDate(new Date(Date.now() - 86400000));

  // Busca todas as fontes em paralelo
  const [espnToday, espnYesterday, primaryResult, fdResult] = await Promise.allSettled([
    fetchJson(`${ESPN_URL}?dates=${todayUTC}`,     15000),
    fetchJson(`${ESPN_URL}?dates=${yesterdayUTC}`, 15000),
    fetchJson(PRIMARY),
    FOOTBALL_DATA_TOKEN
      ? fetchJson(`${FOOTBALL_DATA_URL}?status=IN_PLAY,PAUSED,FINISHED`, 15000, { 'X-Auth-Token': FOOTBALL_DATA_TOKEN })
      : Promise.reject(new Error('sem token')),
  ]);

  const key = (h, a) => `${h.toLowerCase()}|${a.toLowerCase()}`;

  // ── 1. ESPN como fonte primária ────────────────────────────────────────────
  // Ontem entra primeiro; hoje sobrescreve em caso de duplicata no Map
  const espnGames = [
    ...(espnYesterday.status === 'fulfilled' ? parseESPN(espnYesterday.value) : []),
    ...(espnToday.status    === 'fulfilled' ? parseESPN(espnToday.value)    : []),
  ];
  const espnMap = new Map(espnGames.map((g) => [key(g.home, g.away), g]));

  if (espnToday.status !== 'fulfilled' && espnYesterday.status !== 'fulfilled') {
    console.warn('⚠️  ESPN indisponível:', espnToday.reason?.message);
  }

  // ── 2. worldcup26.ir como fonte secundária ─────────────────────────────────
  const primaryGames = primaryResult.status === 'fulfilled'
    ? parsePrimary(primaryResult.value)
    : [];
  if (primaryResult.status !== 'fulfilled') {
    console.warn('⚠️  Fonte secundária (worldcup26.ir) falhou:', primaryResult.reason?.message);
  }
  const primaryMap = new Map(primaryGames.map((g) => [key(g.home, g.away), g]));

  // ── 3. Mescla + cross-validation ESPN × worldcup26.ir ─────────────────────
  const skipKeys = new Set();

  if (espnMap.size) {
    source = 'espn';

    for (const [k, g] of espnMap) {
      const p = primaryMap.get(k);

      if (g.finished && g.homeScore != null) {
        if (!p || p.homeScore == null) {
          // Só ESPN tem resultado — avisa para conferir
          console.warn(
            `⚠️  FONTE ÚNICA: ${g.home} ${g.homeScore}×${g.awayScore} ${g.away}` +
            ` — worldcup26.ir sem dados. Confirmar!`
          );
        } else if (p.finished && (g.homeScore !== p.homeScore || g.awayScore !== p.awayScore)) {
          // Ambas têm resultado final mas discordam — bloqueia até resolver
          console.error(
            `🚨 CONFLITO: ${g.home} × ${g.away}` +
            ` — ESPN: ${g.homeScore}×${g.awayScore} | worldcup26.ir: ${p.homeScore}×${p.awayScore}`
          );
          skipKeys.add(k);
        }
      }

      // Enriquece ESPN com goleadores da secundária quando ESPN não tem
      espnMap.set(k, {
        ...g,
        homeScorers: g.homeScorers?.length ? g.homeScorers : (p?.homeScorers || []),
        awayScorers: g.awayScorers?.length ? g.awayScorers : (p?.awayScorers || []),
      });
    }

    // Jogos que só a secundária conhece (ESPN não trouxe)
    for (const [k, p] of primaryMap) {
      if (!espnMap.has(k)) espnMap.set(k, p);
    }

    games = [...espnMap.values()];
    if (primaryGames.length) source = 'espn+worldcup26';

  } else if (primaryGames.length) {
    // ESPN indisponível: worldcup26.ir assume o papel de primária
    games = primaryGames;
    source = 'worldcup26';
    console.warn('⚠️  ESPN indisponível, usando worldcup26.ir como fonte primária');
  }

  // ── 4. football-data.org como desempatador de conflitos ───────────────────
  if (skipKeys.size) {
    if (fdResult.status === 'fulfilled') {
      const fdGames = parseFootballData(fdResult.value);
      const fdMap   = new Map(fdGames.map((g) => [key(g.home, g.away), g]));

      for (const k of [...skipKeys]) {
        const fd   = fdMap.get(k);
        const espn = espnMap.get(k);
        const prim = primaryMap.get(k);
        if (!fd?.finished || fd.homeScore == null) continue;

        if (fd.homeScore === espn?.homeScore && fd.awayScore === espn?.awayScore) {
          console.log(`✅ CONFLITO RESOLVIDO (ESPN confirmada por fd.org): ${espn.home} × ${espn.away} ${fd.homeScore}×${fd.awayScore}`);
          skipKeys.delete(k);
        } else if (fd.homeScore === prim?.homeScore && fd.awayScore === prim?.awayScore) {
          console.log(`✅ CONFLITO RESOLVIDO (worldcup26 confirmada por fd.org): ${prim.home} × ${prim.away} ${fd.homeScore}×${fd.awayScore}`);
          const idx = games.findIndex((g) => key(g.home, g.away) === k);
          if (idx >= 0) games[idx] = { ...games[idx], homeScore: prim.homeScore, awayScore: prim.awayScore };
          skipKeys.delete(k);
        } else {
          console.error(
            `🚨 CONFLITO SEM RESOLUÇÃO: ${espn?.home} × ${espn?.away}` +
            ` — ESPN: ${espn?.homeScore}×${espn?.awayScore}` +
            ` | worldcup26: ${prim?.homeScore}×${prim?.awayScore}` +
            ` | fd.org: ${fd.homeScore}×${fd.awayScore} — mantendo banco`
          );
        }
      }
    } else {
      console.warn(`⚠️  ${skipKeys.size} conflito(s) sem resolução — fd.org indisponível`);
    }
  }

  // ── 5. Fallback final: openfootball ───────────────────────────────────────
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
    await updateMatchStatuses();
    console.log('ℹ️  Nenhum jogo retornado pelas APIs.');
    return { updated: 0, source: null };
  }

  // Mapa name_en (lowercase) → match. Carrega jogos do banco.
  const [matches] = await pool.query(
    `SELECT m.id, m.group_id, m.home_score, m.away_score, m.status, m.result_source,
            m.live_minute, m.home_scorers, m.away_scorers, m.winner,
            m.venue, m.attendance, m.home_stats, m.away_stats,
            t1.name_en AS home_en, t2.name_en AS away_en
     FROM matches m
     JOIN teams t1 ON t1.id = m.home_team_id
     JOIN teams t2 ON t2.id = m.away_team_id`
  );

  const index = new Map();
  for (const m of matches) index.set(key(m.home_en, m.away_en), m);

  let updated = 0;
  for (const g of games) {
    const k = key(g.home, g.away);
    const m = index.get(k);
    if (!m) continue;

    // Não atualiza jogos com conflito não resolvido
    if (skipKeys.has(k)) continue;

    // API retractou um finished=TRUE falso: volta para scheduled e limpa o placar injetado
    if (!g.finished && !g.paused && g.homeScore == null &&
        (m.status === 'live' || m.status === 'finished') &&
        m.home_score === 0 && m.away_score === 0 &&
        !m.home_scorers && !m.away_scorers &&
        m.result_source === 'api') {
      await pool.query(
        `UPDATE matches SET status='scheduled', home_score=NULL, away_score=NULL,
                result_source=NULL, result_updated_at=NULL,
                live_minute=NULL, live_injury_time=NULL WHERE id=?`,
        [m.id]
      );
      console.log(`↩️  Match ${m.id} revertido para scheduled (API corrigiu falso finished)`);
      broadcast('result', { match_id: m.id, group_id: m.group_id, status: 'scheduled', home_score: null, away_score: null });
      updated++;
      continue;
    }

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

    const newStatus      = g.finished ? 'finished' : g.paused ? 'paused' : 'live';
    const newMinute      = g.finished ? null : (g.minute ?? null);
    const newInjury      = g.finished ? null : (g.injuryTime ?? null);
    const newHomeScorers = g.homeScorers?.length  ? JSON.stringify(g.homeScorers)  : null;
    const newAwayScorers = g.awayScorers?.length  ? JSON.stringify(g.awayScorers)  : null;
    const newHomeStats   = g.homeStats             ? JSON.stringify(g.homeStats)    : null;
    const newAwayStats   = g.awayStats             ? JSON.stringify(g.awayStats)    : null;
    const newVenue       = g.venue       || null;
    const newAttendance  = g.attendance  ?? null;

    // Pula se nada mudou
    const scorersUnchanged =
      (newHomeScorers == null || m.home_scorers != null) &&
      (newAwayScorers == null || m.away_scorers != null);
    const statsUnchanged =
      (newHomeStats == null || m.home_stats != null) &&
      (newAwayStats == null || m.away_stats != null);
    if (
      m.home_score  === g.homeScore &&
      m.away_score  === g.awayScore &&
      m.status      === newStatus   &&
      m.live_minute === newMinute   &&
      scorersUnchanged && statsUnchanged &&
      (newVenue == null || m.venue) &&
      (newAttendance == null || m.attendance)
    ) continue;

    await pool.query(
      `UPDATE matches
         SET home_score  = ?, away_score  = ?, status = ?,
             live_minute = ?, live_injury_time = ?,
             home_scorers = COALESCE(?, home_scorers),
             away_scorers = COALESCE(?, away_scorers),
             winner       = COALESCE(?, winner),
             venue        = COALESCE(?, venue),
             attendance   = COALESCE(?, attendance),
             home_stats   = COALESCE(?, home_stats),
             away_stats   = COALESCE(?, away_stats),
             result_source = 'api', result_updated_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [g.homeScore, g.awayScore, newStatus, newMinute, newInjury,
       newHomeScorers, newAwayScorers, g.winner ?? null,
       newVenue, newAttendance, newHomeStats, newAwayStats, m.id]
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

/**
 * Preenche venue/attendance/stats para todos os jogos encerrados que ainda
 * não têm esses dados, buscando a ESPN por data.
 */
export async function backfillStats() {
  const [rows] = await pool.query(
    `SELECT m.id,
            DATE_FORMAT(m.kick_off_utc,'%Y%m%d') AS date_str,
            DATE_FORMAT(DATE_SUB(m.kick_off_utc, INTERVAL 1 DAY),'%Y%m%d') AS prev_date_str,
            t1.name_en AS home_en, t2.name_en AS away_en
     FROM matches m
     JOIN teams t1 ON t1.id = m.home_team_id
     JOIN teams t2 ON t2.id = m.away_team_id
     WHERE m.status = 'finished'
       AND (m.home_stats IS NULL OR m.away_stats IS NULL OR m.attendance IS NULL)
       AND m.result_source != 'manual'`
  );

  if (!rows.length) return { updated: 0 };

  const key = (h, a) => `${h.toLowerCase()}|${a.toLowerCase()}`;

  // Agrupa por data UTC e também adiciona o dia anterior (ESPN usa data local US, UTC-5 a UTC-7)
  const byDate = new Map();
  for (const r of rows) {
    for (const d of [r.date_str, r.prev_date_str]) {
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push(r);
    }
  }

  let updated = 0;
  const alreadyUpdated = new Set();

  for (const [dateStr, matches] of byDate) {
    let espnData;
    try {
      espnData = await fetchJson(`${ESPN_URL}?dates=${dateStr}`, 20000);
    } catch (err) {
      console.warn(`⚠️  Backfill ESPN ${dateStr} falhou:`, err.message);
      continue;
    }

    const espnGames = parseESPN(espnData);
    const espnMap = new Map(espnGames.map((g) => [key(g.home, g.away), g]));

    for (const m of matches) {
      if (alreadyUpdated.has(m.id)) continue;
      const g = espnMap.get(key(m.home_en, m.away_en));
      if (!g) continue;
      if (!g.venue && !g.attendance && !g.homeStats && !g.awayStats) continue;

      await pool.query(
        `UPDATE matches
           SET venue      = COALESCE(venue, ?),
               attendance = COALESCE(attendance, ?),
               home_stats = COALESCE(home_stats, ?),
               away_stats = COALESCE(away_stats, ?)
         WHERE id = ?`,
        [
          g.venue       || null,
          g.attendance  ?? null,
          g.homeStats   ? JSON.stringify(g.homeStats) : null,
          g.awayStats   ? JSON.stringify(g.awayStats) : null,
          m.id,
        ]
      );
      alreadyUpdated.add(m.id);
      updated++;
    }

    // Pausa pequena para não martelar a ESPN
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`✅ Backfill stats: ${updated} jogos atualizados`);
  return { updated };
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

let _syncTimer = null;
let _syncRunning = false;

async function _syncLoop() {
  if (_syncRunning) return;
  _syncRunning = true;

  // Jogo ao vivo? → 10s. Recém-encerrado (até 20 min)? → 30s. Sem ao vivo → 120s.
  const LIVE_MS   = Number(process.env.SCORES_SYNC_LIVE_MS)   || 10_000;
  const RECENT_MS = Number(process.env.SCORES_SYNC_RECENT_MS) || 30_000;
  const IDLE_MS   = Number(process.env.SCORES_SYNC_IDLE_MS)   || 120_000;
  // Máximo de jogos simultâneos ao vivo esperados; acima disso usa intervalo conservador.
  const MAX_CONCURRENT_LIVE = envInt('SCORES_MAX_CONCURRENT_LIVE', 3);

  try {
    const [[liveRow]] = await pool.query(
      "SELECT COUNT(*) AS n FROM matches WHERE status IN ('live','paused')"
    );
    const [[recentRow]] = await pool.query(
      "SELECT COUNT(*) AS n FROM matches WHERE status = 'finished' AND result_updated_at >= UTC_TIMESTAMP() - INTERVAL 20 MINUTE"
    );
    const liveCount   = Number(liveRow.n);
    const hasLive     = liveCount > 0;
    const tooManyLive = liveCount > MAX_CONCURRENT_LIVE;
    const hasRecent   = Number(recentRow.n) > 0;

    let delay;
    if (hasLive && !tooManyLive) {
      delay = LIVE_MS;
    } else if (tooManyLive) {
      delay = RECENT_MS;
      console.warn(
        `⚠️  ${liveCount} jogos ao vivo simultâneos (esperado ≤ ${MAX_CONCURRENT_LIVE})` +
        ` — possível dado preso. Sync conservador em ${delay / 1000}s`
      );
    } else if (hasRecent) {
      delay = RECENT_MS;
    } else {
      delay = IDLE_MS;
    }

    await syncScores().catch((e) => console.error('Erro no sync:', e.message));

    _syncTimer = setTimeout(_syncLoop, delay);
    if (hasLive && !tooManyLive) console.log(`⚡ Ao vivo detectado (${liveCount}) — próximo sync em ${delay / 1000}s`);
    else if (hasRecent) console.log(`⏱️  Jogo recém-encerrado — próximo sync em ${delay / 1000}s`);
  } catch {
    _syncTimer = setTimeout(_syncLoop, IDLE_MS);
  } finally {
    _syncRunning = false;
  }
}

export function startScoresSync() {
  // Primeira execução logo após o boot
  syncScores().catch((e) => console.error('Erro no sync inicial:', e.message));
  _syncTimer = setTimeout(_syncLoop, 10_000);
  console.log('⏱️  Sync adaptativo: 10s ao vivo / 120s idle');
}

export function stopScoresSync() {
  if (_syncTimer) clearTimeout(_syncTimer);
}
