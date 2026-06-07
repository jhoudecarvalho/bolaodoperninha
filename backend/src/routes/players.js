import { Router } from 'express';
import pool from '../config/database.js';

const router = Router();

// Jogadores ilimitados — sem teto de cadastro.
const COLORS = [
  '#c8aa6e', '#e74c3c', '#3498db', '#5cb85c', '#9b59b6',
  '#e67e22', '#1abc9c', '#f1c40f', '#ff6b9d', '#34d399',
  '#60a5fa', '#f87171', '#a78bfa', '#fbbf24', '#2dd4bf',
];

// GET /api/players/suggestions
// Participantes (users role 'user') ainda sem player vinculado.
router.get('/suggestions', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name FROM users WHERE role = 'user' AND player_id IS NULL ORDER BY name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar sugestões' });
  }
});

// GET /api/players
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, avatar_color, created_at, (pin IS NOT NULL) AS has_pin FROM players ORDER BY name ASC'
    );
    res.json(rows.map((r) => ({ ...r, has_pin: Boolean(Number(r.has_pin)) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar jogadores' });
  }
});

// POST /api/players  { name, pin? }
router.post('/', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const pin = req.body?.pin ? String(req.body.pin).trim() : null;

    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    if (name.length > 30) return res.status(400).json({ error: 'Nome muito longo (máx 30)' });
    if (pin && !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN deve ter 4 dígitos' });
    }

    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM players');
    const color = COLORS[total % COLORS.length];

    const [result] = await pool.query(
      'INSERT INTO players (name, pin, avatar_color) VALUES (?, ?, ?)',
      [name, pin, color]
    );

    res.status(201).json({ id: result.insertId, name, avatar_color: color, has_pin: !!pin });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Já existe um jogador com esse nome' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar jogador' });
  }
});

// DELETE /api/players/:id  (remove o jogador e seus palpites via ON DELETE CASCADE)
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM players WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Jogador não encontrado' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover jogador' });
  }
});

export default router;
