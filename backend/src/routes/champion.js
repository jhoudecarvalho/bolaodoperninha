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

// GET /api/champion — participantes + campeão real (se a final já foi jogada).
// Enquanto a final não ocorre: a seleção de cada um fica oculta para os outros.
// Após a final: todas as escolhas são reveladas + acertou_campeao é calculado.
router.get('/', async (req, res) => {
  try {
    const myPlayerId = req.user?.player_id ?? null;

    // Determina o campeão real (se a final terminou)
    const [[finalMatch]] = await pool.query(`
      SELECT home_team_id, away_team_id, winner
      FROM matches
      WHERE stage = 'FINAL' AND status = 'finished' AND winner IS NOT NULL
      LIMIT 1
    `);

    let champion = null;
    let championTeamId = null;
    if (finalMatch) {
      championTeamId = finalMatch.winner === 'home' ? finalMatch.home_team_id : finalMatch.away_team_id;
      const [[ct]] = await pool.query(
        'SELECT id AS team_id, name AS team_name, flag_emoji, group_id FROM teams WHERE id = ?',
        [championTeamId]
      );
      if (ct) champion = ct;
    }

    const tournamentOver = !!champion;

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

    const players_out = players.map((pl) => {
      const pick = pickMap.get(pl.player_id);
      const isOwn = myPlayerId != null && pl.player_id === myPlayerId;
      // Após a final, revela tudo; antes disso só o próprio vê
      const reveal = tournamentOver || isOwn;
      const acertouCampeao = tournamentOver && pick && pick.team_id === championTeamId;
      return {
        player_id:    pl.player_id,
        player_name:  pl.player_name,
        avatar_color: pl.avatar_color,
        picked:        !!pick,
        acertou_campeao: !!acertouCampeao,
        team_id:    reveal && pick ? pick.team_id    : null,
        team_name:  reveal && pick ? pick.team_name  : null,
        flag_emoji: reveal && pick ? pick.flag_emoji : null,
        group_id:   reveal && pick ? pick.group_id   : null,
      };
    });

    res.json({ champion, players: players_out });
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

// Prazo: 27/06/2026 23:59 BRT = 28/06/2026 02:59 UTC
const CHAMPION_DEADLINE = new Date('2026-06-28T02:59:00Z');

// POST /api/champion — salvar/atualizar palpite de campeão
router.post('/', denyAdmin, ownPlayerOnly, async (req, res) => {
  if (new Date() > CHAMPION_DEADLINE) {
    return res.status(403).json({
      error: 'Prazo encerrado',
      message: 'O prazo para escolher o campeão encerrou em 27/06 às 23:59. As apostas estão bloqueadas.',
    });
  }
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
