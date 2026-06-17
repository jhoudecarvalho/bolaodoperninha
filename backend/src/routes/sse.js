import { Router } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import { addClient } from '../sse/broker.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const router = Router();

// GET /api/sse?token=xxx
// EventSource não suporta headers customizados, então o token vem via query string
router.get('/', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).end();

  let user;
  try {
    user = jwt.verify(token, SECRET);
  } catch {
    return res.status(401).end();
  }

  // Busca cor do avatar e grava last_seen_at (best-effort, em paralelo)
  let color = '#c8aa6e';
  try {
    const queries = [
      pool.query('UPDATE users SET last_seen_at = NOW() WHERE id = ?', [user.sub]),
    ];
    if (user.player_id) {
      queries.push(pool.query('SELECT avatar_color FROM players WHERE id = ?', [user.player_id]));
    }
    const results = await Promise.all(queries);
    if (user.player_id) {
      const [[row]] = results[1];
      if (row?.avatar_color) color = row.avatar_color;
    }
  } catch { /* ignora */ }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(':connected\n\n');

  const remove = addClient({ ...user, color }, res);
  req.on('close', remove);
});

export default router;
