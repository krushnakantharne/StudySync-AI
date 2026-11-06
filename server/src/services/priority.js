// Priority Ranker + shared helpers.
import { PRIORITY_W } from '../config/constants.js';

export const DAY = 864e5;
export const daysBetween = (a, b) => (new Date(b) - new Date(a)) / DAY;
export const topicKey = (s, t) => `${s._id}:${t.name}`;
const lastOf = (s, t, sim) => sim?.get(topicKey(s, t)) ?? t.lastStudied;

export const avgMastery = (s) =>
  s.topics.length ? s.topics.reduce((a, t) => a + t.mastery, 0) / s.topics.length : 0;

/** exp(-daysToExam/14); 0 when there is no upcoming exam. */
export function proximity(s, now) {
  if (!s.examDate) return 0;
  const d = daysBetween(now, s.examDate);
  return d < 0 ? 0 : Math.exp(-d / 14);
}

/** Days since the subject was last studied (30 if never). */
export function subjectDaysSince(s, now, sim) {
  const dates = s.topics.map((t) => lastOf(s, t, sim)).filter(Boolean);
  if (!dates.length) return 30;
  return Math.max(0, daysBetween(Math.max(...dates.map(Number)), now));
}

/** priority = 0.35*gap + 0.25*recency + 0.25*proximity + 0.15*difficulty */
export function topicPriority(s, t, now, lastStudied = t.lastStudied) {
  const gap = 1 - t.mastery;
  const rec = lastStudied ? Math.min(Math.max(daysBetween(lastStudied, now), 0), 14) / 14 : 1;
  return (
    PRIORITY_W.gap * gap +
    PRIORITY_W.recency * rec +
    PRIORITY_W.prox * proximity(s, now) +
    PRIORITY_W.diff * (t.difficulty / 5)
  );
}

/** All topics of the given subjects, highest priority first. `sim` overrides lastStudied (used while planning). */
export function rankTopics(subjects, now, sim) {
  const out = [];
  for (const s of subjects)
    for (const t of s.topics) out.push({ subject: s, topic: t, priority: topicPriority(s, t, now, lastOf(s, t, sim)) });
  return out.sort((a, b) => b.priority - a.priority);
}

export function bestTopic(s, now, sim) {
  return rankTopics([s], now, sim)[0]?.topic;
}
