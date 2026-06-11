import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/database.js';
import { requireAdmin } from '../middleware/auth.js';
import { normalizePhone } from '../utils/phone.js';

const router = Router();

// Todas as rotas aqui são exclusivas do admin.
router.use(requireAdmin);

const COLORS = [
  '#c8aa6e', '#e74c3c', '#3498db', '#5cb85c', '#9b59b6',
  '#e67e22', '#1abc9c', '#f1c40f', '#ff6b9d', '#34d399',
  '#60a5fa', '#f87171', '#a78bfa', '#fbbf24', '#2dd4bf',
];

// GET /api/users → lista os participantes (role 'user') com o player vinculado
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.phone, u.role, u.player_id, p.avatar_color
       FROM users u
       LEFT JOIN players p ON p.id = u.player_id
       WHERE u.role = 'user'
       ORDER BY u.name ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar participantes' });
  }
});

// POST /api/users → cria participante (login + jogador, já vinculados)
//   body: { name, phone, password }
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const name = String(req.body?.name || '').trim();
    const phone = normalizePhone(req.body?.phone);
    const password = String(req.body?.password || '');

    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    if (name.length > 60) return res.status(400).json({ error: 'Nome muito longo' });
    if (!phone) return res.status(400).json({ error: 'Celular é obrigatório' });
    if (phone.length < 10) return res.status(400).json({ error: 'Celular inválido' });
    if (password.length < 4) {
      return res.status(400).json({ error: 'Senha deve ter ao menos 4 caracteres' });
    }

    // Telefone já usado?
    const [[dup]] = await conn.query('SELECT id FROM users WHERE phone = ?', [phone]);
    if (dup) return res.status(409).json({ error: 'Já existe um login com esse celular' });

    await conn.beginTransaction();

    // Reaproveita player de mesmo nome ou cria novo
    let playerId;
    const [[existingPlayer]] = await conn.query(
      'SELECT id FROM players WHERE LOWER(name) = LOWER(?) LIMIT 1',
      [name]
    );
    if (existingPlayer) {
      playerId = existingPlayer.id;
    } else {
      const [[{ total }]] = await conn.query('SELECT COUNT(*) AS total FROM players');
      const color = COLORS[total % COLORS.length];
      const [insP] = await conn.query(
        'INSERT INTO players (name, avatar_color) VALUES (?, ?)',
        [name, color]
      );
      playerId = insP.insertId;
    }

    const hash = await bcrypt.hash(password, 10);
    const [insU] = await conn.query(
      `INSERT INTO users (name, phone, password_hash, role, player_id)
       VALUES (?, ?, ?, 'user', ?)`,
      [name, phone, hash, playerId]
    );

    await conn.commit();
    res.status(201).json({ id: insU.insertId, name, phone, player_id: playerId });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Nome ou celular já cadastrado' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar participante' });
  } finally {
    conn.release();
  }
});

// DELETE /api/users/devices → reseta fingerprint de TODOS os participantes
router.delete('/devices', async (_req, res) => {
  try {
    const [result] = await pool.query("UPDATE users SET device_fingerprint = NULL WHERE role = 'user'");
    res.json({ ok: true, count: result.affectedRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao resetar dispositivos' });
  }
});

// DELETE /api/users/:id/device → reseta o fingerprint do dispositivo
router.delete('/:id/device', async (req, res) => {
  try {
    const [[user]] = await pool.query('SELECT id, name FROM users WHERE id = ? AND role = ?', [req.params.id, 'user']);
    if (!user) return res.status(404).json({ error: 'Participante não encontrado' });
    await pool.query('UPDATE users SET device_fingerprint = NULL WHERE id = ?', [user.id]);
    res.json({ ok: true, message: `Dispositivo de ${user.name} liberado.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao resetar dispositivo' });
  }
});

// DELETE /api/users/:id → remove o participante (login + jogador + palpites)
router.delete('/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [[user]] = await conn.query(
      'SELECT id, role, player_id FROM users WHERE id = ?',
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'Participante não encontrado' });
    if (user.role === 'admin') {
      return res.status(400).json({ error: 'Não é possível remover um administrador aqui' });
    }

    await conn.beginTransaction();
    await conn.query('DELETE FROM users WHERE id = ?', [user.id]);
    if (user.player_id) {
      // Apaga o jogador (e seus palpites, via ON DELETE CASCADE)
      await conn.query('DELETE FROM players WHERE id = ?', [user.player_id]);
    }
    await conn.commit();

    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover participante' });
  } finally {
    conn.release();
  }
});

export default router;
