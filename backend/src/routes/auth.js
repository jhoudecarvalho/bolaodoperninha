import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/database.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { normalizePhone } from '../utils/phone.js';
import { syncMatchesOnLogin } from '../services/matchesImporter.js';
import { syncScoresOnLogin } from '../services/scoresFetcher.js';

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
      `SELECT id, name, username, phone, password_hash, role, player_id, device_fingerprint
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

    // Verificação de dispositivo (apenas para participantes, não admin)
    if (user.role !== 'admin') {
      const fingerprint = String(req.body?.fingerprint || '').trim();
      if (fingerprint) {
        if (!user.device_fingerprint) {
          // Primeiro login: registra o dispositivo
          await pool.query('UPDATE users SET device_fingerprint = ? WHERE id = ?', [fingerprint, user.id]);
        } else if (user.device_fingerprint !== fingerprint) {
          return res.status(403).json({
            error: 'Dispositivo não autorizado',
            message: 'Este login está vinculado a outro dispositivo. Fale com o administrador para liberar o acesso.',
          });
        }
      } else if (user.device_fingerprint) {
        // Conta já tem dispositivo registrado mas nenhum fingerprint foi enviado — bloqueia
        return res.status(403).json({
          error: 'Dispositivo não autorizado',
          message: 'Não foi possível verificar o dispositivo. Fale com o administrador para liberar o acesso.',
        });
      }
    }

    // Participante (role 'user') sem player vinculado → cria/vincula automaticamente.
    // O admin nunca vira player.
    if (user.role === 'user' && !user.player_id) {
      await linkOrCreatePlayer(user);
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      username: user.username,
      phone: user.phone,
      role: user.role,
      player_id: user.player_id ?? null,
    };
    const token = signToken(safeUser);

    // Dispara, em segundo plano, a atualização dos jogos e dos placares
    // (não bloqueia o login).
    syncMatchesOnLogin().catch(() => {});
    syncScoresOnLogin().catch(() => {});

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
      player_id: req.user.player_id ?? null,
    },
  });
});

const PLAYER_COLORS = [
  '#c8aa6e', '#e74c3c', '#3498db', '#5cb85c', '#9b59b6',
  '#e67e22', '#1abc9c', '#f1c40f', '#ff6b9d', '#34d399',
  '#60a5fa', '#f87171', '#a78bfa', '#fbbf24', '#2dd4bf',
];

/**
 * Garante um `player` vinculado ao `user` (role 'user'):
 *  - reaproveita um player de mesmo nome (caso o admin já tenha criado), ou
 *  - cria um novo.
 * Atualiza users.player_id e o objeto `user` em memória.
 */
async function linkOrCreatePlayer(user) {
  const [[existing]] = await pool.query(
    'SELECT id FROM players WHERE LOWER(name) = LOWER(?) LIMIT 1',
    [user.name]
  );

  let playerId;
  if (existing) {
    playerId = existing.id;
  } else {
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM players');
    const color = PLAYER_COLORS[total % PLAYER_COLORS.length];
    const [ins] = await pool.query(
      'INSERT INTO players (name, avatar_color) VALUES (?, ?)',
      [user.name, color]
    );
    playerId = ins.insertId;
  }

  await pool.query('UPDATE users SET player_id = ? WHERE id = ?', [playerId, user.id]);
  user.player_id = playerId;
}

export default router;
