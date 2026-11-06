// Bayesian Knowledge Tracing: the Knowledge State Estimator.
import { BKT } from '../config/constants.js';

/** Update P(L) after one observation. correct = self-rating >= 3. */
export function updateMastery(L, correct, p = BKT) {
  const post = correct
    ? (L * (1 - p.pSlip)) / (L * (1 - p.pSlip) + (1 - L) * p.pGuess)
    : (L * p.pSlip) / (L * p.pSlip + (1 - L) * (1 - p.pGuess));
  const next = post + (1 - post) * p.pLearn;
  return Math.min(0.99, Math.max(0.01, next));
}
