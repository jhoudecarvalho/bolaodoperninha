import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      name: user.name,
      username: user.username,
      phone: user.phone,
      role: user.role,
      player_id: user.player_id ?? null,
    },
    SECRET,
    { expiresIn: process.env.JWT_EXPIRES || '30d' }
  );
}

/**
 * Exige um Bearer token válido. Anexa req.user.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada' });
  }
}

/**
 * Bloqueia o administrador de ações de participante (ex.: dar palpites).
 * Admin pode ver tudo, mas não joga.
 */
export function denyAdmin(req, res, next) {
  if (req.user?.role === 'admin') {
    return res.status(403).json({
      error: 'Ação não permitida',
      message: 'O administrador não pode dar palpites.',
    });
  }
  next();
}

/**
 * Exige que o usuário seja admin.
 */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas o administrador pode fazer isso' });
  }
  next();
}
