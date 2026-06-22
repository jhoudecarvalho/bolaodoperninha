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
        const gm = raw.match(/Group ([A-L]) (\d+)(?:st|nd|rd|th) Place/i);
        if (gm) return `${gm[2]}º Grupo ${gm[1]}`;
        const wm = raw.match(/Round of 32 (\d+) Winner/i);
        if (wm) return `Vencedor R32 #${wm[1]}`;
        const qm = raw.match(/Quarterfinal (\d+) Winner/i);
        if (qm) return `Vencedor QF #${qm[1]}`;
        const sm = raw.match(/Semifinal (\d+) (Winner|Loser)/i);
        if (sm) return `${sm[2] === 'Winner' ? 'Vencedor' : 'Perdedor'} SF #${sm[1]}`;
        const rm = raw.match(/Round of 16 (\d+) Winner/i);
        if (rm) return `Vencedor R16 #${rm[1]}`;
        return raw;
      };
      const homeLabel = homeTbd ? fmtLabel(homeDisplay) : null;
      const awayLabel = awayTbd ? fmtLabel(awayDisplay) : null;

      // Verifica se já existe pelo espn_event_id
      const [[existing]] = await pool.query(
        'SELECT id, home_team_id, away_team_id, kick_off_utc, venue FROM matches WHERE espn_event_id = ?',
        [espnId]
      );

      if (!existing) {
        await pool.query(
          `INSERT INTO matches
             (stage, espn_event_id, home_team_id, away_team_id,
              home_placeholder, away_placeholder,
              match_date, kick_off_utc, venue, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
          [stage, espnId, homeId, awayId, homeLabel, awayLabel, matchDate, kickoffUtc, venue]
        );
        const desc = homeTbd ? `${homeLabel} × ${awayLabel}` : `${homeDisplay} × ${awayDisplay}`;
        console.log(`✅ Knockout inserido [${stage}]: ${desc} (${matchDate})`);
        broadcast('result', { stage });
        inserted++;
      } else {
        // Times confirmados: atualiza IDs e limpa placeholders
        const teamsConfirmed = !homeTbd && !awayTbd && homeId && awayId;
        const needsUpdate =
          (teamsConfirmed && (existing.home_team_id !== homeId || existing.away_team_id !== awayId)) ||
          existing.kick_off_utc?.toISOString?.().slice(0,19).replace('T',' ') !== kickoffUtc ||
          (venue && !existing.venue);

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
