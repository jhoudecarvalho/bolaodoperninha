import { Router } from 'express';
import pool from '../config/database.js';
import { getOnlineUsers } from '../sse/broker.js';

const router = Router();

// GET /api/seen — lista todos os participantes com quando foram vistos por último
// Disponível a qualquer usuário autenticado (é info social do grupo)
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.name, u.last_seen_at, p.avatar_color AS color
       FROM users u
       LEFT JOIN players p ON p.id = u.player_id
       WHERE u.last_seen_at IS NOT NULL
       ORDER BY u.last_seen_at DESC`
    );

    const onlineNow = new Set(getOnlineUsers().map((u) => u.name));

    res.json(
      rows.map((r) => ({
        name: r.name,
        color: r.color ?? '#c8aa6e',
        lastSeenAt: r.last_seen_at,
        online: onlineNow.has(r.name),
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar histórico de presença' });
  }
});

export default router;
