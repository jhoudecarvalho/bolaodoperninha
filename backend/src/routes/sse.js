import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { addClient } from '../sse/broker.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const router = Router();

// GET /api/sse?token=xxx
// EventSource não suporta headers customizados, então o token vem via query string
router.get('/', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).end();

  try {
    jwt.verify(token, SECRET);
  } catch {
    return res.status(401).end();
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // desativa buffer do nginx
  res.flushHeaders();

  res.write(':connected\n\n');

  const remove = addClient(res);
  req.on('close', remove);
});

export default router;
