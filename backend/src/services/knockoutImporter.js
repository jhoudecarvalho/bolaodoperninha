import pool from '../config/database.js';
import { broadcast } from '../sse/broker.js';

const ESPN_URL =
  process.env.ESPN_API_URL ||
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

// Copa 2026: todas as datas do mata-mata (R32 até a Final)
const KNOCKOUT_DATES = [];
for (
  let d = new Date('2026-06-28T00:00:00Z');
  d <= new Date('2026-07-19T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1)
) {
  KNOCKOUT_DATES.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
}

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

// Determina a fase a partir do nome do evento ESPN
function getStage(eventName) {
  const n = eventName.toLowerCase();
  if (n.includes('semifinal') && n.includes('loser'))   return 'THIRD_PLACE';
  if (n.includes('semifinal') && n.includes('winner'))  return 'FINAL';
  if (n.includes('quarterfinal') && n.includes('winner')) return 'SEMI_FINALS';
  if (n.includes('round of 16') && n.includes('winner')) return 'QUARTER_FINALS';
  if (n.includes('round of 32') && n.includes('winner')) return 'LAST_16';
  return 'LAST_32';
}

// Time com nome de placeholder (ex: "Group A Winner", "Round of 32 3 Winner")
function isPlaceholder(name) {
  return /(winner|loser|place|round of|quarterfinal|semifinal|group [a-l] |third place)/i.test(name);
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'bolao-copa-2026' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
  return res.json();
}

// matchNumber = número oficial FIFA da partida (estático). Define a posição no
// chaveamento: R32=73-88, R16=89-96, QF=97-100, SF=101-102, 3º=103, Final=104.
// O scoreboard NÃO traz esse campo; só o core API. Como é imutável, buscamos
// apenas uma vez por jogo (quando match_number ainda está nulo no banco).
const CORE_API =
  process.env.ESPN_CORE_API_URL ||
  'https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world';

async function fetchMatchNumber(espnId) {
  try {
    const data = await fetchJson(`${CORE_API}/events/${espnId}/competitions/${espnId}`);
    const n = Number(data?.matchNumber);
    return Number.isFinite(n) ? n : null;
  } catch (err) {
    console.warn(`⚠️  matchNumber ${espnId}:`, err.message);
    return null;
  }
}

export async function importKnockoutMatches() {
  // Carrega times do banco
  const [teams] = await pool.query('SELECT id, name_en FROM teams');
  const teamByEn = new Map(teams.map((t) => [t.name_en.toLowerCase(), t.id]));

  function findTeamId(displayName) {
    const n = normalize(displayName);
    return n ? (teamByEn.get(n.toLowerCase()) ?? null) : null;
  }

  let inserted = 0;
  let updated = 0;

  for (const dateStr of KNOCKOUT_DATES) {
    let data;
    try {
      data = await fetchJson(`${ESPN_URL}?dates=${dateStr}`);
    } catch (err) {
      console.warn(`⚠️  Knockout ESPN ${dateStr}:`, err.message);
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }

    for (const event of data?.events || []) {
      const comp    = event.competitions?.[0];
      if (!comp) continue;

      const espnId  = Number(event.id);
      const stage   = getStage(event.name || '');
      const kickoff = comp.date || event.date;
      if (!kickoff) continue;

      const kickoffUtc = new Date(kickoff).toISOString().slice(0, 19).replace('T', ' ');
      const matchDate  = kickoffUtc.slice(0, 10);
      const venue      = comp.venue?.fullName || null;

      let homeDisplay = null, awayDisplay = null;
      for (const c of comp.competitors || []) {
        if (c.homeAway === 'home') homeDisplay = c.team?.displayName;
        else if (c.homeAway === 'away') awayDisplay = c.team?.displayName;
      }

      if (!homeDisplay || !awayDisplay) continue;

      const homeTbd = isPlaceholder(homeDisplay);
      const awayTbd = isPlaceholder(awayDisplay);
      const homeId  = homeTbd ? null : findTeamId(homeDisplay);
      const awayId  = awayTbd ? null : findTeamId(awayDisplay);

      if (!homeTbd && !homeId) { console.warn(`⚠️  Knockout: time não mapeado — ${homeDisplay}`); continue; }
      if (!awayTbd && !awayId) { console.warn(`⚠️  Knockout: time não mapeado — ${awayDisplay}`); continue; }

      // Labels amigáveis: "Group A 2nd Place" → "2º Grupo A"
      const fmtLabel = (raw) => {
        if (!raw) return null;
        // "Group A 2nd Place" → "2º Grupo A"
        const pm = raw.match(/Group ([A-L]) (\d+)(?:st|nd|rd|th) Place/i);
        if (pm) return `${pm[2]}º Grupo ${pm[1]}`;
        // "Group C Winner" → "1º Grupo C"
        const gw = raw.match(/^Group ([A-L]) Winner$/i);
        if (gw) return `1º Grupo ${gw[1]}`;
        // "Third Place Group A/B/C/D/F" → "3º Lugar (A/B/C/D/F)"
        const tp = raw.match(/Third Place Group ([A-L/]+)/i);
        if (tp) return `3º Lugar (${tp[1]})`;
        // "Round of 32 N Winner" → "Vencedor R32 #N"
        const r32 = raw.match(/Round of 32 (\d+) Winner/i);
        if (r32) return `Vencedor R32 #${r32[1]}`;
        // "Round of 16 N Winner" → "Vencedor R16 #N"
        const r16 = raw.match(/Round of 16 (\d+) Winner/i);
        if (r16) return `Vencedor R16 #${r16[1]}`;
        // "Quarterfinal N Winner" → "Vencedor QF #N"
        const qf = raw.match(/Quarterfinal (\d+) Winner/i);
        if (qf) return `Vencedor QF #${qf[1]}`;
        // "Semifinal N Winner/Loser" → "Vencedor/Perdedor SF #N"
        const sf = raw.match(/Semifinal (\d+) (Winner|Loser)/i);
        if (sf) return `${sf[2] === 'Winner' ? 'Vencedor' : 'Perdedor'} SF #${sf[1]}`;
        return raw;
      };
      const homeLabel = homeTbd ? fmtLabel(homeDisplay) : null;
      const awayLabel = awayTbd ? fmtLabel(awayDisplay) : null;

      // Verifica se já existe pelo espn_event_id
      const [[existing]] = await pool.query(
        'SELECT id, home_team_id, away_team_id, kick_off_utc, venue, home_placeholder, away_placeholder, match_number FROM matches WHERE espn_event_id = ?',
        [espnId]
      );

      if (!existing) {
        const matchNumber = await fetchMatchNumber(espnId);
        await pool.query(
          `INSERT INTO matches
             (stage, espn_event_id, match_number, home_team_id, away_team_id,
              home_placeholder, away_placeholder,
              match_date, kick_off_utc, venue, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
          [stage, espnId, matchNumber, homeId, awayId, homeLabel, awayLabel, matchDate, kickoffUtc, venue]
        );
        const desc = homeTbd ? `${homeLabel} × ${awayLabel}` : `${homeDisplay} × ${awayDisplay}`;
        console.log(`✅ Knockout inserido [${stage}]: ${desc} (${matchDate})`);
        broadcast('result', { stage });
        inserted++;
      } else {
        // Backfill de match_number para jogos já existentes sem o campo
        if (existing.match_number == null) {
          const matchNumber = await fetchMatchNumber(espnId);
          if (matchNumber != null) {
            await pool.query('UPDATE matches SET match_number = ? WHERE id = ?', [matchNumber, existing.id]);
          }
        }
        // Times confirmados: atualiza IDs e limpa placeholders
        const teamsConfirmed = !homeTbd && !awayTbd && homeId && awayId;
        const needsUpdate =
          (teamsConfirmed && (existing.home_team_id !== homeId || existing.away_team_id !== awayId)) ||
          existing.kick_off_utc?.toISOString?.().slice(0,19).replace('T',' ') !== kickoffUtc ||
          (venue && !existing.venue) ||
          (!teamsConfirmed && (existing.home_placeholder !== homeLabel || existing.away_placeholder !== awayLabel));

        if (needsUpdate) {
          await pool.query(
            `UPDATE matches
               SET home_team_id = ?, away_team_id = ?,
                   home_placeholder = ?, away_placeholder = ?,
                   kick_off_utc = ?, match_date = ?,
                   venue = COALESCE(?, venue)
             WHERE espn_event_id = ?`,
            [
              homeId, awayId,
              teamsConfirmed ? null : homeLabel,
              teamsConfirmed ? null : awayLabel,
              kickoffUtc, matchDate, venue, espnId,
            ]
          );
          const desc = teamsConfirmed ? `${homeDisplay} × ${awayDisplay}` : `${homeLabel} × ${awayLabel}`;
          console.log(`♻️  Knockout atualizado [${stage}]: ${desc}`);
          if (teamsConfirmed && !existing.home_team_id) broadcast('result', { stage });
          updated++;
        }
      }
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  return { inserted, updated };
}

let _interval = null;

export function startKnockoutSync(intervalMs = 5 * 60_000) {
  importKnockoutMatches().catch((e) =>
    console.warn('⚠️  Knockout sync inicial falhou:', e.message)
  );
  _interval = setInterval(() => {
    importKnockoutMatches().catch((e) =>
      console.warn('⚠️  Knockout sync falhou:', e.message)
    );
  }, intervalMs);
  console.log(`⏱️  Knockout sync ESPN a cada ${intervalMs / 60000}min`);
}

export function stopKnockoutSync() {
  if (_interval) clearInterval(_interval);
}
