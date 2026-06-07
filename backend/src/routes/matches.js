import { Router } from 'express';
import pool from '../config/database.js';

const router = Router();

const BASE_SELECT = `
  SELECT
    m.id, m.group_id, m.match_date, m.kick_off_utc, m.venue, m.status,
    m.home_score, m.away_score, m.result_source, m.result_updated_at,
    m.home_team_id, m.away_team_id,
    t1.name AS home_name, t1.name_en AS home_name_en, t1.flag_emoji AS home_flag,
    t2.name AS away_name, t2.name_en AS away_name_en, t2.flag_emoji AS away_flag,
    (UTC_TIMESTAMP() >= m.kick_off_utc) AS locked
  FROM matches m
  JOIN teams t1 ON t1.id = m.home_team_id
  JOIN teams t2 ON t2.id = m.away_team_id
`;

// GET /api/matches?group=C&status=live
router.get('/', async (req, res) => {
  try {
    const { group, status } = req.query;
    const where = [];
    const params = [];

    if (group) {
      where.push('m.group_id = ?');
      params.push(group);
    }
    if (status) {
      where.push('m.status = ?');
      params.push(status);
    }

    const sql =
      BASE_SELECT +
      (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
      ' ORDER BY m.kick_off_utc ASC, m.id ASC';

    const [rows] = await pool.query(sql, params);
    res.json(rows.map(normalizeLocked));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar jogos' });
  }
});

// GET /api/matches/upcoming?limit=10
router.get('/upcoming', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 72);
    const sql =
      BASE_SELECT +
      ' WHERE UTC_TIMESTAMP() < m.kick_off_utc ORDER BY m.kick_off_utc ASC LIMIT ?';
    const [rows] = await pool.query(sql, [limit]);
    res.json(rows.map(normalizeLocked));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar próximos jogos' });
  }
});

// GET /api/matches/:id  → detalhe + todos os palpites
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(BASE_SELECT + ' WHERE m.id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Jogo não encontrado' });

    const match = normalizeLocked(rows[0]);

    const [predictions] = await pool.query(
      `SELECT pr.id, pr.player_id, pr.home_score, pr.away_score, pr.updated_at,
              p.name AS player_name, p.avatar_color
       FROM predictions pr
       JOIN players p ON p.id = pr.player_id
       WHERE pr.match_id = ?
       ORDER BY p.name ASC`,
      [req.params.id]
    );

    res.json({ ...match, predictions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar detalhe do jogo' });
  }
});

function normalizeLocked(row) {
  return { ...row, locked: Boolean(Number(row.locked)) };
}

export default router;
