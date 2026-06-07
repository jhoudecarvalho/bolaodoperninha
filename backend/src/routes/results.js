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
