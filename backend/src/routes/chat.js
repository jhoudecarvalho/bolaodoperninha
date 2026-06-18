import { Router } from 'express';
import pool from '../config/database.js';
import { broadcast } from '../sse/broker.js';

const router = Router();
const MAX_LEN = 500;
const HISTORY = 50;

// GET /api/chat — últimas N mensagens
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, player_name, avatar_color, message, created_at
       FROM chat_messages
       ORDER BY created_at DESC
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

  // Busca nome e cor do jogador vinculado ao usuário
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

  const msg = {
    id: result.insertId,
    player_name: playerName,
    avatar_color: avatarColor,
    message: text,
    created_at: new Date().toISOString(),
  };

  broadcast('chat', msg);
  res.status(201).json(msg);
});

export default router;
