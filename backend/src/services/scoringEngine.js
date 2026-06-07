/**
 * Sistema de pontuação do bolão.
 *
 * Regras:
 *   - Placar exato  → 3 pontos
 *   - Qualquer outro → 0 pontos
 */

export const POINTS_EXACT = 3;

/**
 * Calcula os pontos de um palpite contra o resultado oficial.
 * @returns {{ points: number, exact: boolean, hasResult: boolean }}
 */
export function scorePrediction(prediction, match) {
  const hasResult = match?.home_score != null && match?.away_score != null;
  if (!hasResult || !prediction) {
    return { points: 0, exact: false, hasResult: false };
  }

  const exact =
    prediction.home_score === match.home_score &&
    prediction.away_score === match.away_score;

  return {
    points: exact ? POINTS_EXACT : 0,
    exact,
    hasResult: true,
  };
}
