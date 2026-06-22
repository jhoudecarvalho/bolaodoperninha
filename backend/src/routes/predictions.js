import { Router } from 'express';
import pool from '../config/database.js';
import { lockCheck } from '../middleware/lockCheck.js';
import { denyAdmin } from '../middleware/auth.js';
import { broadcast } from '../sse/broker.js';

const router = Router();

function validScore(v) {
  return Number.isInteger(v) && v >= 0 && v <= 99;
}

/**
 * Garante que o participante só palpite pelo SEU próprio jogador.
 * (Substitui o antigo PIN: cada login só joga por si.)
 */
function ownPlayerOnly(req, res, next) {
  const myPlayer = req.user?.player_id;
  if (!myPlayer) {
    return res.status(403).json({
      error: 'Sem jogador vinculado',
      message: 'Seu usuário ainda não tem um jogador. Faça login novamente.',
    });
  }
  const sent = Number(req.body?.player_id);
  if (!sent || sent !== Number(myPlayer)) {
    return res.status(403).json({
      error: 'Ação não permitida',
      message: 'Você só pode palpitar por você mesmo.',
    });
  }
  next();
}

// GET /api/predictions?player_id=1  |  ?match_id=5  |  ?group=A
router.get('/', async (req, res) => {
  try {
    const { player_id, match_id, match_ids, group } = req.query;
    const where = [];
    const params = [];
    if (player_id) {
      where.push('pr.player_id = ?');
      params.push(player_id);
    }
    if (match_id) {
      where.push('pr.match_id = ?');
      params.push(match_id);
    }
    if (match_ids) {
      const ids = String(match_ids).split(',').map(Number).filter(Boolean);
      if (ids.length) {
        where.push(`pr.match_id IN (?)`);
        params.push(ids);
      }
    }
    if (group) {
      where.push('m.group_id = ?');
      params.push(group);
    }

    const sql = `
      SELECT pr.id, pr.player_id, pr.match_id, pr.home_score, pr.away_score,
             pr.created_at, pr.updated_at, p.name AS player_name, p.avatar_color,
             (UTC_TIMESTAMP() >= m.kick_off_utc) AS started
      FROM predictions pr
      JOIN players p ON p.id = pr.player_id
      JOIN matches m ON m.id = pr.match_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY p.name ASC
    `;
    const [rows] = await pool.query(sql, params);

    // Placar oculto para outros jogadores até o jogo começar (anti-spoiler).
    // O próprio usuário logado sempre vê seu placar — independente do horário.
    const maskScores = !player_id;
    const myPlayerId = req.user?.player_id;
    const out = rows.map((r) => {
      const started  = Boolean(Number(r.started));
      const isOwn    = myPlayerId != null && r.player_id === myPlayerId;
      const revealed = started || !maskScores || isOwn;
      return {
        ...r,
        started,
        revealed,
        home_score: revealed ? r.home_score : null,
        away_score: revealed ? r.away_score : null,
      };
    });
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar palpites' });
  }
});

// POST /api/predictions  { player_id, match_id, home_score, away_score }
router.post('/', denyAdmin, ownPlayerOnly, lockCheck, async (req, res) => {
  try {
    const player_id = Number(req.body?.player_id);
    const match_id = Number(req.body?.match_id);
    const home_score = Number(req.body?.home_score);
    const away_score = Number(req.body?.away_score);

    if (!player_id || !match_id) {
      return res.status(400).json({ error: 'player_id e match_id são obrigatórios' });
    }
    if (!validScore(home_score) || !validScore(away_score)) {
      return res.status(400).json({ error: 'Placar inválido (use inteiros entre 0 e 99)' });
    }

    await upsertPrediction({ player_id, match_id, home_score, away_score });
    broadcastPrediction(player_id, match_id, home_score, away_score);
    res.status(201).json({ player_id, match_id, home_score, away_score });
  } catch (err) {
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'Jogador ou jogo inexistente' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar palpite' });
  }
});

// POST /api/predictions/bulk  { player_id, predictions: [{ match_id, home_score, away_score }] }
router.post('/bulk', denyAdmin, ownPlayerOnly, lockCheck, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const player_id = Number(req.body?.player_id);
    const predictions = Array.isArray(req.body?.predictions) ? req.body.predictions : [];

    if (!player_id) return res.status(400).json({ error: 'player_id é obrigatório' });
    if (!predictions.length) {
      return res.status(400).json({ error: 'Nenhum palpite enviado' });
    }

    for (const p of predictions) {
      const hs = Number(p.home_score);
      const as = Number(p.away_score);
      if (!validScore(hs) || !validScore(as)) {
        return res.status(400).json({ error: `Placar inválido no jogo ${p.match_id}` });
      }
    }

    await conn.beginTransaction();
    for (const p of predictions) {
      await upsertPrediction(
        {
          player_id,
          match_id: Number(p.match_id),
          home_score: Number(p.home_score),
          away_score: Number(p.away_score),
        },
        conn
      );
    }
    await conn.commit();

    for (const p of predictions) {
      broadcastPrediction(player_id, Number(p.match_id), Number(p.home_score), Number(p.away_score));
    }

    res.status(201).json({ ok: true, saved: predictions.length });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar palpites em lote' });
  } finally {
    conn.release();
  }
});

async function upsertPrediction({ player_id, match_id, home_score, away_score }, conn = pool) {
  await conn.query(
    `INSERT INTO predictions (player_id, match_id, home_score, away_score)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE home_score = VALUES(home_score), away_score = VALUES(away_score)`,
    [player_id, match_id, home_score, away_score]
  );
}

async function broadcastPrediction(player_id, match_id, home_score, away_score) {
  try {
    const [[player]] = await pool.query(
      'SELECT name, avatar_color FROM players WHERE id = ?',
      [player_id]
    );
    const [[match]] = await pool.query(
      'SELECT group_id, kick_off_utc FROM matches WHERE id = ?',
      [match_id]
    );
    if (!player || !match) return;

    const started = new Date() >= new Date(match.kick_off_utc);
    broadcast('prediction', {
      match_id,
      group_id: match.group_id,
      player_id,
      player_name: player.name,
      avatar_color: player.avatar_color,
      home_score: started ? home_score : null,
      away_score: started ? away_score : null,
      revealed: started,
    });
  } catch {
    // SSE nunca pode quebrar a resposta HTTP
  }
}

export default router;
