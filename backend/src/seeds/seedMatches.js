import pool from '../config/database.js';
import { importMatches } from '../services/matchesImporter.js';

/**
 * Seed completo: 12 grupos, 48 seleções e 72 jogos da fase de grupos.
 * Rode após aplicar o schema.sql:  npm run seed
 */

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

// name (pt), name_en (para match com API), flag, group
const TEAMS = [
  // A
  ['México', 'Mexico', '🇲🇽', 'A'],
  ['África do Sul', 'South Africa', '🇿🇦', 'A'],
  ['Coreia do Sul', 'South Korea', '🇰🇷', 'A'],
  ['Tchéquia', 'Czechia', '🇨🇿', 'A'],
  // B
  ['Canadá', 'Canada', '🇨🇦', 'B'],
  ['Bósnia', 'Bosnia and Herzegovina', '🇧🇦', 'B'],
  ['Catar', 'Qatar', '🇶🇦', 'B'],
  ['Suíça', 'Switzerland', '🇨🇭', 'B'],
  // C
  ['Brasil', 'Brazil', '🇧🇷', 'C'],
  ['Marrocos', 'Morocco', '🇲🇦', 'C'],
  ['Haiti', 'Haiti', '🇭🇹', 'C'],
  ['Escócia', 'Scotland', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'C'],
  // D
  ['EUA', 'United States', '🇺🇸', 'D'],
  ['Paraguai', 'Paraguay', '🇵🇾', 'D'],
  ['Austrália', 'Australia', '🇦🇺', 'D'],
  ['Turquia', 'Turkey', '🇹🇷', 'D'],
  // E
  ['Alemanha', 'Germany', '🇩🇪', 'E'],
  ['Curaçao', 'Curacao', '🇨🇼', 'E'],
  ['Costa do Marfim', 'Ivory Coast', '🇨🇮', 'E'],
  ['Equador', 'Ecuador', '🇪🇨', 'E'],
  // F
  ['Holanda', 'Netherlands', '🇳🇱', 'F'],
  ['Japão', 'Japan', '🇯🇵', 'F'],
  ['Suécia', 'Sweden', '🇸🇪', 'F'],
  ['Tunísia', 'Tunisia', '🇹🇳', 'F'],
  // G
  ['Bélgica', 'Belgium', '🇧🇪', 'G'],
  ['Egito', 'Egypt', '🇪🇬', 'G'],
  ['Irã', 'Iran', '🇮🇷', 'G'],
  ['Nova Zelândia', 'New Zealand', '🇳🇿', 'G'],
  // H
  ['Espanha', 'Spain', '🇪🇸', 'H'],
  ['Cabo Verde', 'Cape Verde', '🇨🇻', 'H'],
  ['Arábia Saudita', 'Saudi Arabia', '🇸🇦', 'H'],
  ['Uruguai', 'Uruguay', '🇺🇾', 'H'],
  // I
  ['França', 'France', '🇫🇷', 'I'],
  ['Senegal', 'Senegal', '🇸🇳', 'I'],
  ['Iraque', 'Iraq', '🇮🇶', 'I'],
  ['Noruega', 'Norway', '🇳🇴', 'I'],
  // J
  ['Argentina', 'Argentina', '🇦🇷', 'J'],
  ['Argélia', 'Algeria', '🇩🇿', 'J'],
  ['Áustria', 'Austria', '🇦🇹', 'J'],
  ['Jordânia', 'Jordan', '🇯🇴', 'J'],
  // K
  ['Portugal', 'Portugal', '🇵🇹', 'K'],
  ['RD Congo', 'DR Congo', '🇨🇩', 'K'],
  ['Uzbequistão', 'Uzbekistan', '🇺🇿', 'K'],
  ['Colômbia', 'Colombia', '🇨🇴', 'K'],
  // L
  ['Inglaterra', 'England', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'L'],
  ['Croácia', 'Croatia', '🇭🇷', 'L'],
  ['Gana', 'Ghana', '🇬🇭', 'L'],
  ['Panamá', 'Panama', '🇵🇦', 'L'],
];

// group, home (pt), away (pt), kick_off_utc
const MATCHES = [
  // GRUPO A
  ['A', 'México', 'África do Sul', '2026-06-11 21:00:00'],
  ['A', 'Coreia do Sul', 'Tchéquia', '2026-06-12 02:00:00'],
  ['A', 'Tchéquia', 'África do Sul', '2026-06-18 21:00:00'],
  ['A', 'México', 'Coreia do Sul', '2026-06-19 02:00:00'],
  ['A', 'África do Sul', 'Coreia do Sul', '2026-06-24 22:00:00'],
  ['A', 'Tchéquia', 'México', '2026-06-24 22:00:00'],
  // GRUPO B
  ['B', 'Canadá', 'Bósnia', '2026-06-12 19:00:00'],
  ['B', 'Catar', 'Suíça', '2026-06-13 19:00:00'],
  ['B', 'Suíça', 'Bósnia', '2026-06-19 00:00:00'],
  ['B', 'Canadá', 'Catar', '2026-06-18 22:00:00'],
  ['B', 'Bósnia', 'Catar', '2026-06-25 22:00:00'],
  ['B', 'Suíça', 'Canadá', '2026-06-25 22:00:00'],
  // GRUPO C
  ['C', 'Brasil', 'Marrocos', '2026-06-13 22:00:00'],
  ['C', 'Haiti', 'Escócia', '2026-06-14 01:00:00'],
  ['C', 'Escócia', 'Marrocos', '2026-06-19 22:00:00'],
  ['C', 'Brasil', 'Haiti', '2026-06-20 01:00:00'],
  ['C', 'Marrocos', 'Haiti', '2026-06-25 20:00:00'],
  ['C', 'Escócia', 'Brasil', '2026-06-26 00:00:00'],
  // GRUPO D
  ['D', 'EUA', 'Paraguai', '2026-06-13 01:00:00'],
  ['D', 'Austrália', 'Turquia', '2026-06-14 04:00:00'],
  ['D', 'Turquia', 'Paraguai', '2026-06-20 04:00:00'],
  ['D', 'EUA', 'Austrália', '2026-06-19 19:00:00'],
  ['D', 'Paraguai', 'Austrália', '2026-06-26 02:00:00'],
  ['D', 'Turquia', 'EUA', '2026-06-26 02:00:00'],
  // GRUPO E
  ['E', 'Alemanha', 'Curaçao', '2026-06-14 17:00:00'],
  ['E', 'Costa do Marfim', 'Equador', '2026-06-14 23:00:00'],
  ['E', 'Alemanha', 'Costa do Marfim', '2026-06-20 20:00:00'],
  ['E', 'Equador', 'Curaçao', '2026-06-21 00:00:00'],
  ['E', 'Curaçao', 'Costa do Marfim', '2026-06-26 22:00:00'],
  ['E', 'Equador', 'Alemanha', '2026-06-26 22:00:00'],
  // GRUPO F
  ['F', 'Holanda', 'Japão', '2026-06-14 20:00:00'],
  ['F', 'Suécia', 'Tunísia', '2026-06-15 02:00:00'],
  ['F', 'Holanda', 'Suécia', '2026-06-20 17:00:00'],
  ['F', 'Tunísia', 'Japão', '2026-06-21 04:00:00'],
  ['F', 'Japão', 'Suécia', '2026-06-27 00:00:00'],
  ['F', 'Tunísia', 'Holanda', '2026-06-27 00:00:00'],
  // GRUPO G
  ['G', 'Bélgica', 'Egito', '2026-06-15 22:00:00'],
  ['G', 'Irã', 'Nova Zelândia', '2026-06-16 01:00:00'],
  ['G', 'Bélgica', 'Irã', '2026-06-21 17:00:00'],
  ['G', 'Nova Zelândia', 'Egito', '2026-06-21 23:00:00'],
  ['G', 'Egito', 'Irã', '2026-06-27 20:00:00'],
  ['G', 'Nova Zelândia', 'Bélgica', '2026-06-27 20:00:00'],
  // GRUPO H
  ['H', 'Espanha', 'Cabo Verde', '2026-06-15 16:00:00'],
  ['H', 'Arábia Saudita', 'Uruguai', '2026-06-15 22:00:00'],
  ['H', 'Espanha', 'Arábia Saudita', '2026-06-21 20:00:00'],
  ['H', 'Uruguai', 'Cabo Verde', '2026-06-22 02:00:00'],
  ['H', 'Cabo Verde', 'Arábia Saudita', '2026-06-27 22:00:00'],
  ['H', 'Uruguai', 'Espanha', '2026-06-27 22:00:00'],
  // GRUPO I
  ['I', 'França', 'Senegal', '2026-06-16 19:00:00'],
  ['I', 'Iraque', 'Noruega', '2026-06-16 22:00:00'],
  ['I', 'França', 'Iraque', '2026-06-22 17:00:00'],
  ['I', 'Noruega', 'Senegal', '2026-06-22 23:00:00'],
  ['I', 'Senegal', 'Iraque', '2026-06-26 20:00:00'],
  ['I', 'Noruega', 'França', '2026-06-26 20:00:00'],
  // GRUPO J
  ['J', 'Argentina', 'Argélia', '2026-06-17 01:00:00'],
  ['J', 'Áustria', 'Jordânia', '2026-06-17 04:00:00'],
  ['J', 'Argentina', 'Áustria', '2026-06-22 20:00:00'],
  ['J', 'Jordânia', 'Argélia', '2026-06-23 02:00:00'],
  ['J', 'Argélia', 'Áustria', '2026-06-27 16:00:00'],
  ['J', 'Jordânia', 'Argentina', '2026-06-27 16:00:00'],
  // GRUPO K
  ['K', 'Portugal', 'RD Congo', '2026-06-17 17:00:00'],
  ['K', 'Uzbequistão', 'Colômbia', '2026-06-18 02:00:00'],
  ['K', 'Portugal', 'Uzbequistão', '2026-06-23 17:00:00'],
  ['K', 'Colômbia', 'RD Congo', '2026-06-23 23:00:00'],
  ['K', 'RD Congo', 'Uzbequistão', '2026-06-28 00:00:00'],
  ['K', 'Colômbia', 'Portugal', '2026-06-28 00:00:00'],
  // GRUPO L
  ['L', 'Inglaterra', 'Croácia', '2026-06-17 20:00:00'],
  ['L', 'Gana', 'Panamá', '2026-06-17 23:00:00'],
  ['L', 'Inglaterra', 'Gana', '2026-06-23 20:00:00'],
  ['L', 'Panamá', 'Croácia', '2026-06-24 02:00:00'],
  ['L', 'Croácia', 'Gana', '2026-06-28 02:00:00'],
  ['L', 'Panamá', 'Inglaterra', '2026-06-28 02:00:00'],
];

async function seed() {
  const conn = await pool.getConnection();
  try {
    console.log('🌱 Iniciando seed...');

    // Limpa dados existentes (mantém players/predictions intactos? não: matches têm FK)
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query('DELETE FROM matches');
    await conn.query('DELETE FROM teams');
    await conn.query('DELETE FROM `groups`');
    await conn.query('ALTER TABLE matches AUTO_INCREMENT = 1');
    await conn.query('ALTER TABLE teams AUTO_INCREMENT = 1');
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    // Grupos
    for (const g of GROUPS) {
      await conn.query('INSERT INTO `groups` (id, name) VALUES (?, ?)', [g, `Grupo ${g}`]);
    }
    console.log(`✅ ${GROUPS.length} grupos`);

    // Times — mapa nome(pt) -> id
    const teamId = {};
    for (const [name, nameEn, flag, group] of TEAMS) {
      const [res] = await conn.query(
        'INSERT INTO teams (name, name_en, flag_emoji, group_id) VALUES (?, ?, ?, ?)',
        [name, nameEn, flag, group]
      );
      teamId[name] = res.insertId;
    }
    console.log(`✅ ${TEAMS.length} seleções`);

    // Jogos — tenta importar da API (datas reais c/ fuso); fallback p/ lista local
    let count = 0;
    try {
      const res = await importMatches();
      count = res.inserted + res.updated;
      if (count < 60) throw new Error(`apenas ${count} jogos vieram da API`);
      console.log(`✅ ${count} jogos (fonte: ${res.source})`);
    } catch (apiErr) {
      console.warn(`⚠️  API de jogos indisponível (${apiErr.message}). Usando lista local.`);
      count = 0;
      for (const [group, home, away, kickoff] of MATCHES) {
        const homeId = teamId[home];
        const awayId = teamId[away];
        if (!homeId || !awayId) {
          throw new Error(`Time não encontrado: ${home} ou ${away}`);
        }
        const matchDate = kickoff.split(' ')[0];
        await conn.query(
          `INSERT INTO matches (group_id, home_team_id, away_team_id, match_date, kick_off_utc, status)
           VALUES (?, ?, ?, ?, ?, 'scheduled')`,
          [group, homeId, awayId, matchDate, kickoff]
        );
        count++;
      }
      console.log(`✅ ${count} jogos (fonte: local)`);
    }

    console.log('🎉 Seed concluído com sucesso!');
  } catch (err) {
    console.error('❌ Erro no seed:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

seed();
