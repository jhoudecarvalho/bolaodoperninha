import { Router } from 'express';
import pool from '../config/database.js';
import { denyAdmin } from '../middleware/auth.js';

const router = Router();

function ownPlayerOnly(req, res, next) {
  const myPlayer = req.user?.player_id;
  if (!myPlayer) {
    return res.status(403).json({
      error: 'Sem jogador vinculado',
      message: 'Seu usuário ainda não tem um jogador. Faça login novamente.',
    });
  }
  const sent = Number(req.body?.player_id);
  if (!sent || sent !== Number(myPlayer)) {
    return res.status(403).json({
      error: 'Ação não permitida',
      message: 'Você só pode palpitar por você mesmo.',
    });
  }
  next();
}

// GET /api/champion — lista todos os participantes com status de escolha.
// A seleção escolhida só é revelada para o próprio usuário logado.
router.get('/', async (req, res) => {
  try {
    const myPlayerId = req.user?.player_id ?? null;

    const [players] = await pool.query(
      'SELECT id AS player_id, name AS player_name, avatar_color FROM players ORDER BY name ASC'
    );

    const [picks] = await pool.query(`
      SELECT cp.player_id, cp.team_id,
             t.name AS team_name, t.flag_emoji, t.group_id
      FROM champion_picks cp
      JOIN teams t ON t.id = cp.team_id
    `);

    const pickMap = new Map(picks.map((p) => [p.player_id, p]));

    const result = players.map((pl) => {
      const pick = pickMap.get(pl.player_id);
      const isOwn = myPlayerId != null && pl.player_id === myPlayerId;
      return {
        player_id:   pl.player_id,
        player_name: pl.player_name,
        avatar_color: pl.avatar_color,
        picked: !!pick,
        // Revela a seleção apenas para o próprio jogador
        team_id:    isOwn && pick ? pick.team_id   : null,
        team_name:  isOwn && pick ? pick.team_name : null,
        flag_emoji: isOwn && pick ? pick.flag_emoji : null,
        group_id:   isOwn && pick ? pick.group_id  : null,
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar palpites de campeão' });
  }
});

// GET /api/champion/teams — lista todos os times agrupados por grupo
router.get('/teams', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, flag_emoji, group_id FROM teams ORDER BY group_id, name'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar times' });
  }
});

// POST /api/champion — salvar/atualizar palpite de campeão
router.post('/', denyAdmin, ownPlayerOnly, async (req, res) => {
  try {
    const player_id = Number(req.body?.player_id);
    const team_id   = Number(req.body?.team_id);

    if (!player_id || !team_id) {
      return res.status(400).json({ error: 'player_id e team_id são obrigatórios' });
    }

    const [[team]] = await pool.query('SELECT id FROM teams WHERE id = ?', [team_id]);
    if (!team) {
      return res.status(400).json({ error: 'Time não encontrado' });
    }

    await pool.query(
      `INSERT INTO champion_picks (player_id, team_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE team_id = VALUES(team_id), updated_at = NOW()`,
      [player_id, team_id]
    );

    res.status(201).json({ ok: true, player_id, team_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar palpite de campeão' });
  }
});

export default router;
