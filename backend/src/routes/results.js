import { Router } from 'express';
import pool from '../config/database.js';
import { syncScores } from '../services/scoresFetcher.js';

const router = Router();

// GET /api/results  → todos os jogos com resultado oficial
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT m.id, m.group_id, m.kick_off_utc, m.status,
              m.home_score, m.away_score, m.result_source, m.result_updated_at,
              t1.name AS home_name, t1.flag_emoji AS home_flag,
              t2.name AS away_name, t2.flag_emoji AS away_flag
       FROM matches m
       JOIN teams t1 ON t1.id = m.home_team_id
       JOIN teams t2 ON t2.id = m.away_team_id
       WHERE m.home_score IS NOT NULL
       ORDER BY m.result_updated_at DESC, m.kick_off_utc DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar resultados' });
  }
});

// GET /api/results/acertadores?group=A  → quem acertou o placar exato por jogo
router.get('/acertadores', async (req, res) => {
  try {
    const { group } = req.query;
    const where = ['m.home_score IS NOT NULL', 'pr.home_score = m.home_score', 'pr.away_score = m.away_score'];
    const params = [];
    if (group) {
      where.push('m.group_id = ?');
      params.push(group);
    }
    const [rows] = await pool.query(
      `SELECT pr.match_id, p.id AS player_id, p.name AS player_name, p.avatar_color,
              pr.home_score, pr.away_score
       FROM predictions pr
       JOIN players p ON p.id = pr.player_id
       JOIN matches m ON m.id = pr.match_id
       WHERE ${where.join(' AND ')}
       ORDER BY p.name ASC`,
      params
    );
    // Agrupa por match_id: { [match_id]: [{ player_id, player_name, avatar_color }] }
    const byMatch = {};
    for (const r of rows) {
      if (!byMatch[r.match_id]) byMatch[r.match_id] = [];
      byMatch[r.match_id].push({ player_id: r.player_id, player_name: r.player_name, avatar_color: r.avatar_color });
    }
    res.json(byMatch);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar acertadores' });
  }
});

// POST /api/results/sync  → trigger manual de busca na API
router.post('/sync', async (_req, res) => {
  try {
    const result = await syncScores();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao sincronizar com a API' });
  }
});

export default router;
