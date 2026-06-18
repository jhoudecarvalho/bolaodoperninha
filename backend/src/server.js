import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { testConnection } from './config/database.js';
import { startScoresSync } from './services/scoresFetcher.js';
import { requireAuth } from './middleware/auth.js';

import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import playersRouter from './routes/players.js';
import matchesRouter from './routes/matches.js';
import predictionsRouter from './routes/predictions.js';
import resultsRouter from './routes/results.js';
import rankingRouter from './routes/ranking.js';
import standingsRouter from './routes/standings.js';
import sseRouter from './routes/sse.js';
import seenRouter from './routes/seen.js';
import chatRouter from './routes/chat.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  })
);
app.use(express.json());

// Health check (público)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Auth (público)
app.use('/api/auth', authRouter);

// SSE (autenticação via query string, sem requireAuth middleware)
app.use('/api/sse', sseRouter);

// Rotas protegidas — exigem Bearer token
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/players', requireAuth, playersRouter);
app.use('/api/matches', requireAuth, matchesRouter);
app.use('/api/predictions', requireAuth, predictionsRouter);
app.use('/api/results', requireAuth, resultsRouter);
app.use('/api/ranking', requireAuth, rankingRouter);
app.use('/api/standings', requireAuth, standingsRouter);
app.use('/api/seen', requireAuth, seenRouter);
app.use('/api/chat', requireAuth, chatRouter);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

async function start() {
  try {
    await testConnection();
  } catch (err) {
    console.error('❌ Falha ao conectar no MySQL:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Backend rodando em http://localhost:${PORT}`);
  });

  // Inicia sincronização periódica de placares
  startScoresSync();
}

start();
