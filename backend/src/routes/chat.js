import { Router } from 'express';
import pool from '../config/database.js';
import { broadcast } from '../sse/broker.js';

const router = Router();
const MAX_LEN = 500;
const HISTORY = 50;

async function getPlayerRank(playerId) {
  if (!playerId) return null;
  try {
    const [rows] = await pool.query(
      `SELECT player_id,
              ROW_NUMBER() OVER (ORDER BY pontos DESC, acertos_exatos DESC, player_name ASC) AS rank
       FROM ranking_view`
    );
    const found = rows.find((r) => r.player_id === playerId);
    return found ? Number(found.rank) : null;
  } catch {
    return null;
  }
}

// GET /api/chat — últimas N mensagens com posição no ranking
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `WITH ranked AS (
         SELECT player_id,
                ROW_NUMBER() OVER (ORDER BY pontos DESC, acertos_exatos DESC, player_name ASC) AS rank
         FROM ranking_view
       )
       SELECT cm.id, cm.player_name, cm.avatar_color, cm.message, cm.created_at,
              COALESCE(r.rank, 0) AS rank
       FROM chat_messages cm
       LEFT JOIN users u ON u.id = cm.user_id
       LEFT JOIN ranked r ON r.player_id = u.player_id
       ORDER BY cm.created_at DESC
       LIMIT ?`,
      [HISTORY]
    );
    res.json(rows.reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat — envia mensagem
router.post('/', async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Mensagem inválida.' });
  }
  const text = message.trim().slice(0, MAX_LEN);
  const user = req.user;

  let playerName = user.name;
  let avatarColor = '#c8aa6e';
  try {
    if (user.player_id) {
      const [[row]] = await pool.query(
        'SELECT name, avatar_color FROM players WHERE id = ?',
        [user.player_id]
      );
      if (row) {
        playerName = row.name;
        avatarColor = row.avatar_color;
      }
    }
  } catch { /* usa fallback */ }

  const [result] = await pool.query(
    `INSERT INTO chat_messages (user_id, player_name, avatar_color, message)
     VALUES (?, ?, ?, ?)`,
    [user.sub, playerName, avatarColor, text]
  );

  const rank = await getPlayerRank(user.player_id);

  const msg = {
    id: result.insertId,
    player_name: playerName,
    avatar_color: avatarColor,
    message: text,
    created_at: new Date().toISOString(),
    rank,
  };

  broadcast('chat', msg);
  res.status(201).json(msg);
});

export default router;
