/**
 * Sistema de pontuação do bolão.
 *
 * Regras:
 *   - Placar exato  → 3 pontos
 *   - Vencedor certo (sem placar exato) → 1 ponto
 *   - Qualquer outro → 0 pontos
 */

export const POINTS_EXACT = 3;
export const POINTS_OUTCOME = 1;

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

  const correctOutcome =
    !exact &&
    outcome(prediction.home_score, prediction.away_score) ===
      outcome(match.home_score, match.away_score);

  return {
    points: exact ? POINTS_EXACT : correctOutcome ? POINTS_OUTCOME : 0,
    exact,
    correctOutcome,
    hasResult: true,
  };
}
