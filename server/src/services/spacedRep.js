// Exam Mode: SM-2 variant   I(i,n) = I(i,n-1) * EF(i) * P(i),   P = min(1, daysLeft/14)
import { DateTime } from 'luxon';
import { DAY } from './priority.js';
import { REVIEW_MINS } from '../config/constants.js';

export const proximityFactor = (daysLeft) => Math.min(1, Math.max(daysLeft, 0) / 14);

/** Update a topic after a review. q = self-rating 1..5. Mutates `topic`. */
export function applyReview(topic, q, examDate, now = new Date()) {
  const daysLeft = examDate ? (new Date(examDate) - now) / DAY : 999;
  const P = proximityFactor(daysLeft);
  const ef = Math.max(1.3, (topic.easeFactor || 2.5) + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  let interval;
  if (q < 3) {
    topic.repetitions = 0;
    interval = 1;
  } else {
    topic.repetitions = (topic.repetitions || 0) + 1;
    interval = Math.max(1, Math.round((topic.intervalDays || 1) * ef * P));
  }
  topic.easeFactor = Math.round(ef * 100) / 100;
  topic.intervalDays = interval;
  let next = new Date(now.getTime() + interval * DAY);
  if (examDate) {
    const cap = new Date(new Date(examDate).getTime() - DAY); // never later than the day before the exam
    if (next > cap) next = cap < now ? now : cap;
  }
  topic.nextReview = next;
  return topic;
}

/**
 * Due reviews for the next 7 days, load-balanced per day.
 * Returns Map<ISO date, [{subject, topic}]>. `now` is a luxon DateTime in the user's zone.
 */
export function dueReviews(examSubjects, user, now, avgFocus = 70) {
  const tz = now.zoneName;
  const today = now.startOf('day');
  const capacity = Math.max(1, Math.floor((user.dailyGoalMins / REVIEW_MINS) * (0.5 + avgFocus / 200)));
  const days = Array.from({ length: 7 }, () => []);

  for (const s of examSubjects) {
    if (!s.examDate || new Date(s.examDate) <= now.toJSDate()) continue;
    const examDay = DateTime.fromJSDate(new Date(s.examDate)).setZone(tz).startOf('day');
    const lastDay = DateTime.max(today, examDay.minus({ days: 1 }));
    for (const t of s.topics) {
      let due = t.nextReview ? DateTime.fromJSDate(new Date(t.nextReview)).setZone(tz).startOf('day') : today;
      if (due < today) due = today;
      if (due > lastDay) due = lastDay;
      const idx = Math.round(due.diff(today, 'days').days);
      if (idx > 6) continue;
      const lastIdx = Math.min(6, Math.round(lastDay.diff(today, 'days').days));
      days[idx].push({ subject: s, topic: t, lastIdx });
    }
  }

  // Load balancer: cap reviews per day, push the overflow (lowest priority = highest mastery) to the next day,
  // but never past the exam date.
  const result = new Map();
  let carry = [];
  for (let d = 0; d < 7; d++) {
    const pool = [...carry, ...days[d]];
    const must = pool.filter((i) => i.lastIdx <= d);
    const optional = pool.filter((i) => i.lastIdx > d).sort((a, b) => a.topic.mastery - b.topic.mastery);
    const room = Math.max(0, capacity - must.length);
    const today_ = [...must, ...optional.slice(0, room)];
    carry = optional.slice(room);
    result.set(today.plus({ days: d }).toISODate(), today_.map(({ subject, topic }) => ({ subject, topic })));
  }
  return result;
}
