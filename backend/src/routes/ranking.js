import { Router } from 'express';
import pool from '../config/database.js';

const router = Router();

// GET /api/ranking  → ranking geral (usa a VIEW do MySQL)
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM ranking_view');
    const ranked = rows.map((r, i) => ({
      position: i + 1,
      player_id: r.player_id,
      player_name: r.player_name,
      avatar_color: r.avatar_color,
      pontos: Number(r.pontos) || 0,
      acertos_exatos: Number(r.acertos_exatos) || 0,
      jogos_com_resultado: Number(r.jogos_com_resultado) || 0,
      total_palpites: Number(r.total_palpites) || 0,
    }));
    res.json(ranked);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar ranking' });
  }
});

// GET /api/ranking/:player_id/detail  → cada palpite vs resultado
router.get('/:player_id/detail', async (req, res) => {
  try {
    const [[player]] = await pool.query(
      'SELECT id, name, avatar_color FROM players WHERE id = ?',
      [req.params.player_id]
    );
    if (!player) return res.status(404).json({ error: 'Jogador não encontrado' });

    const [rows] = await pool.query(
      `SELECT
         m.id AS match_id, m.group_id, m.kick_off_utc, m.status,
         m.home_score AS real_home, m.away_score AS real_away, m.result_source,
         t1.name AS home_name, t1.flag_emoji AS home_flag,
         t2.name AS away_name, t2.flag_emoji AS away_flag,
         pr.home_score AS pred_home, pr.away_score AS pred_away,
         CASE
           WHEN m.home_score IS NULL THEN NULL
           WHEN pr.home_score = m.home_score AND pr.away_score = m.away_score THEN 3
           ELSE 0
         END AS pontos
       FROM predictions pr
       JOIN matches m ON m.id = pr.match_id
       JOIN teams t1 ON t1.id = m.home_team_id
       JOIN teams t2 ON t2.id = m.away_team_id
       WHERE pr.player_id = ?
       ORDER BY m.kick_off_utc ASC`,
      [req.params.player_id]
    );

    const total = rows.reduce((sum, r) => sum + (Number(r.pontos) || 0), 0);

    res.json({ player, total_pontos: total, predictions: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar detalhe do jogador' });
  }
});

export default router;
