import pool from '../config/database.js';

/**
 * Impede criação/alteração de palpites após o kick-off do jogo.
 * Valida SEMPRE no backend — nunca confiar no frontend.
 *
 * Suporta tanto um único palpite (body.match_id) quanto bulk (body.predictions[]).
 */
export async function lockCheck(req, res, next) {
  try {
    // Coleta os match_ids do request (single ou bulk)
    let matchIds = [];
    if (Array.isArray(req.body?.predictions)) {
      matchIds = req.body.predictions.map((p) => p.match_id);
    } else if (req.body?.match_id != null) {
      matchIds = [req.body.match_id];
    }

    matchIds = [...new Set(matchIds.filter((id) => id != null))];

    if (matchIds.length === 0) {
      return res.status(400).json({ error: 'match_id é obrigatório' });
    }

    // Busca os jogos que JÁ começaram (NOW >= kick_off_utc) entre os solicitados
    const placeholders = matchIds.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT m.id, t1.name AS home, t2.name AS away
       FROM matches m
       JOIN teams t1 ON t1.id = m.home_team_id
       JOIN teams t2 ON t2.id = m.away_team_id
       WHERE m.id IN (${placeholders}) AND UTC_TIMESTAMP() >= m.kick_off_utc`,
      matchIds
    );

    if (rows.length > 0) {
      return res.status(403).json({
        error: 'Palpite bloqueado',
        message: 'Este jogo já começou. Não é possível criar ou alterar o palpite.',
        locked_matches: rows,
      });
    }

    next();
  } catch (err) {
    console.error('Erro no lockCheck:', err);
    res.status(500).json({ error: 'Erro ao validar bloqueio do jogo' });
  }
}
