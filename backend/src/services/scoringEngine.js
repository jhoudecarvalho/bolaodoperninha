/**
 * Sistema de pontuação do bolão.
 *
 * Fase de grupos: placar exato = 3 pts, vencedor certo = 1 pt
 * Mata-mata: pontuação progressiva por fase (ver STAGE_POINTS)
 */

export const STAGE_POINTS = {
  GROUP_STAGE:    { exact: 3,  outcome: 1 },
  LAST_32:        { exact: 5,  outcome: 3 },
  LAST_16:        { exact: 8,  outcome: 5 },
  QUARTER_FINALS: { exact: 10, outcome: 6 },
  SEMI_FINALS:    { exact: 13, outcome: 8 },
  THIRD_PLACE:    { exact: 10, outcome: 6 },
  FINAL:          { exact: 16, outcome: 10 },
};

export function getStagePoints(stage) {
  return STAGE_POINTS[stage] ?? STAGE_POINTS.GROUP_STAGE;
}

function outcome(home, away) {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'draw';
}

/**
 * Calcula os pontos de um palpite contra o resultado oficial.
 * @returns {{ points: number, exact: boolean, correctOutcome: boolean, hasResult: boolean }}
 */
export function scorePrediction(prediction, match) {
  const hasResult = match?.home_score != null && match?.away_score != null;
  if (!hasResult || !prediction) {
    return { points: 0, exact: false, correctOutcome: false, hasResult: false };
  }

  const exact =
    prediction.home_score === match.home_score &&
    prediction.away_score === match.away_score;

  // Mata-mata nos pênaltis: o placar fica empatado mas `winner` aponta quem
  // avançou. Usa o avanço real; sem `winner` (grupos) cai no sinal do placar.
  const actualOutcome =
    match.winner === 'home' ? 'home' :
    match.winner === 'away' ? 'away' :
    outcome(match.home_score, match.away_score);

  const correctOutcome =
    !exact &&
    outcome(prediction.home_score, prediction.away_score) === actualOutcome;

  const { exact: pe, outcome: po } = getStagePoints(match.stage);

  return {
    points: exact ? pe : correctOutcome ? po : 0,
    exact,
    correctOutcome,
    hasResult: true,
  };
}
