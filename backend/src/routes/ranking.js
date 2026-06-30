import { Router } from 'express';
import pool from '../config/database.js';

const router = Router();

// GET /api/ranking  → ranking geral (usa a VIEW do MySQL + bônus campeão)
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM ranking_view');

    // Determina o campeão pelo campo winner da partida FINAL (cobre pênaltis)
    const [[finalMatch]] = await pool.query(`
      SELECT home_team_id, away_team_id, winner
      FROM matches
      WHERE stage = 'FINAL' AND status = 'finished' AND winner IS NOT NULL
      LIMIT 1
    `);

    const winnersSet = new Set();
    if (finalMatch) {
      const championTeamId =
        finalMatch.winner === 'home' ? finalMatch.home_team_id : finalMatch.away_team_id;

      const [picks] = await pool.query(
        'SELECT player_id FROM champion_picks WHERE team_id = ?',
        [championTeamId]
      );
      for (const p of picks) winnersSet.add(p.player_id);
    }

    const ranked = rows.map((r) => ({
      player_id: r.player_id,
      player_name: r.player_name,
      avatar_color: r.avatar_color,
      pontos: (Number(r.pontos) || 0) + (winnersSet.has(r.player_id) ? 10 : 0),
      acertos_exatos: Number(r.acertos_exatos) || 0,
      acertos_vencedor: Number(r.acertos_vencedor) || 0,
      jogos_com_resultado: Number(r.jogos_com_resultado) || 0,
      total_palpites: Number(r.total_palpites) || 0,
      acertou_campeao: winnersSet.has(r.player_id),
    }));

    ranked.sort(
      (a, b) =>
        b.pontos - a.pontos ||
        b.acertos_exatos - a.acertos_exatos ||
        a.player_name.localeCompare(b.player_name)
    );
    ranked.forEach((r, i) => { r.position = i + 1; });

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
           WHEN pr.home_score = m.home_score AND pr.away_score = m.away_score THEN
             CASE m.stage
               WHEN 'GROUP_STAGE'    THEN 3
               WHEN 'LAST_32'        THEN 5
               WHEN 'LAST_16'        THEN 8
               WHEN 'QUARTER_FINALS' THEN 10
               WHEN 'SEMI_FINALS'    THEN 13
               WHEN 'THIRD_PLACE'    THEN 10
               WHEN 'FINAL'          THEN 16
               ELSE 3
             END
           WHEN SIGN(pr.home_score - pr.away_score) =
                (CASE WHEN m.winner = 'home' THEN 1
                      WHEN m.winner = 'away' THEN -1
                      ELSE SIGN(m.home_score - m.away_score) END) THEN
             CASE m.stage
               WHEN 'GROUP_STAGE'    THEN 1
               WHEN 'LAST_32'        THEN 3
               WHEN 'LAST_16'        THEN 5
               WHEN 'QUARTER_FINALS' THEN 6
               WHEN 'SEMI_FINALS'    THEN 8
               WHEN 'THIRD_PLACE'    THEN 6
               WHEN 'FINAL'          THEN 10
               ELSE 1
             END
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

    const baseTotal = rows.reduce((sum, r) => sum + (Number(r.pontos) || 0), 0);

    // Bônus campeão
    const [[finalMatch]] = await pool.query(`
      SELECT home_team_id, away_team_id, winner
      FROM matches
      WHERE stage = 'FINAL' AND status = 'finished' AND winner IS NOT NULL
      LIMIT 1
    `);

    let bonusCampeao = 0;
    let acertouCampeao = false;
    if (finalMatch) {
      const championTeamId =
        finalMatch.winner === 'home' ? finalMatch.home_team_id : finalMatch.away_team_id;

      const [[pick]] = await pool.query(
        'SELECT team_id FROM champion_picks WHERE player_id = ?',
        [req.params.player_id]
      );
      if (pick && pick.team_id === championTeamId) {
        bonusCampeao = 10;
        acertouCampeao = true;
      }
    }

    res.json({
      player,
      total_pontos: baseTotal + bonusCampeao,
      bonus_campeao: bonusCampeao,
      acertou_campeao: acertouCampeao,
      predictions: rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar detalhe do jogador' });
  }
});

export default router;
