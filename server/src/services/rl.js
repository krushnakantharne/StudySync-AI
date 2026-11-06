// Q-learning agent with linear function approximation.
// Action = which subject to study next. Q(s,k) = w . phi(s,k)
import { RL } from '../config/constants.js';
import { avgMastery, proximity, subjectDaysSince } from './priority.js';

/** phi = [1, masteryGap, recency, examProximity, topicsRemaining, difficulty] (all in 0..1) */
export function features(s, now, sim) {
  const remaining = s.topics.length ? s.topics.filter((t) => !t.studyCount).length / s.topics.length : 0;
  return [1, 1 - avgMastery(s), Math.min(subjectDaysSince(s, now, sim), 14) / 14, proximity(s, now), remaining, s.difficulty / 5];
}

export const q = (w, phi) => phi.reduce((a, x, i) => a + (w[i] || 0) * x, 0);

/** Epsilon-greedy subject choice. */
export function chooseSubject(user, subjects, now, { sim, excludeId, explore = true } = {}) {
  let pool = subjects.filter((s) => s.topics.length);
  if (excludeId && pool.length > 1) pool = pool.filter((s) => String(s._id) !== String(excludeId));
  if (!pool.length) return null;
  const eps = explore ? Math.max(RL.epsMin, RL.epsStart * Math.pow(RL.decay, user.rlEpisodes || 0)) : 0;
  if (Math.random() < eps) return pool[Math.floor(Math.random() * pool.length)];
  const w = Array.from(user.rlWeights);
  return pool.reduce((best, s) => (q(w, features(s, now, sim)) > q(w, features(best, now, sim)) ? s : best));
}

/** Reward from Table 3.7: gap +0.35, neglect -0.25, proximity +0.25, completion +0.15. */
export function computeReward({ subject, others, preMastery, completed, now }) {
  const R = RL.reward;
  const gap = preMastery < 0.6 ? (0.6 - preMastery) / 0.6 : 0;
  const neglect = others.length ? Math.max(...others.map((o) => Math.min(subjectDaysSince(o, now), 14) / 14)) : 0;
  const reward = R.gap * gap - R.recency * neglect + R.prox * proximity(subject, now) + R.done * (completed ? 1 : 0);
  return Math.round(reward * 1000) / 1000;
}

/** TD update: w += alpha * (r + gamma*maxQ(s') - Q(s,a)) * phi */
export function update(user, phi, reward, subjectsAfter, now) {
  const w = Array.from(user.rlWeights);
  const next = subjectsAfter.length ? Math.max(...subjectsAfter.map((s) => q(w, features(s, now)))) : 0;
  const td = reward + RL.gamma * next - q(w, phi);
  user.rlWeights = w.map((wi, i) => Math.min(3, Math.max(-3, wi + RL.alpha * td * phi[i])));
  user.rlEpisodes = (user.rlEpisodes || 0) + 1;
}
