import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/database.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { normalizePhone } from '../utils/phone.js';
import { syncMatchesOnLogin } from '../services/matchesImporter.js';

const router = Router();

// POST /api/auth/login  { phone | login, password }
// O identificador pode ser um telefone (qualquer formato) ou um username (ex.: 'Admin').
router.post('/login', async (req, res) => {
  try {
    const identifier = String(req.body?.phone ?? req.body?.login ?? '').trim();
    const password = String(req.body?.password || '');

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    const digits = normalizePhone(identifier);

    const [[user]] = await pool.query(
      `SELECT id, name, username, phone, password_hash, role
       FROM users
       WHERE LOWER(username) = LOWER(?)
          OR (phone IS NOT NULL AND phone <> '' AND phone = ?)
       LIMIT 1`,
      [identifier, digits]
    );

    if (!user) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      username: user.username,
      phone: user.phone,
      role: user.role,
    };
    const token = signToken(safeUser);

    // Dispara a atualização dos jogos em segundo plano (não bloqueia o login).
    syncMatchesOnLogin().catch(() => {});

    res.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao autenticar' });
  }
});

// GET /api/auth/me  → valida o token e retorna o usuário
router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.sub,
      name: req.user.name,
      username: req.user.username,
      phone: req.user.phone,
      role: req.user.role,
    },
  });
});

export default router;
