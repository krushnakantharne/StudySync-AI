import { ActivityEvent, ExamAttempt, Subject } from '../models.js';
import { durationTotals, round, weightedScore } from './activityCore.js';
export { CATEGORIES, classify, normalDomain, durationTotals, weightedScore } from './activityCore.js';
export async function activitySummary(user, sessionId = null) {
  const query = { userId: user._id };
  if (sessionId) query.sessionId = sessionId;
  const events = await ActivityEvent.find(query).sort({ from: 1 }).lean();
  const totals = durationTotals(events);
  const known = totals.totalMinutes;
  const activity = known ? round(totals.studyMinutes / known * 100) : null;
  const subjects = await Subject.find({ userId: user._id });
  const topics = subjects.flatMap((s) => s.topics || []);
  const mastery = topics.length ? round(topics.reduce((n, t) => n + (t.mastery || 0), 0) / topics.length * 100) : null;
  const review = topics.length ? round(topics.reduce((n, t) => n + Math.min(5, t.repetitions || 0) / 5 * 100, 0) / topics.length) : null;
  const topicCompletion = topics.length ? round(topics.filter((t) => t.mastery >= 0.8).length / topics.length * 100) : null;
  const exams = await ExamAttempt.find({ userId: user._id, submittedAt: { $ne: null } }).sort({ submittedAt: -1 }).limit(5).lean();
  const quiz = exams.length ? round(exams.reduce((n, e) => n + (Number(e.percentage) || 0), 0) / exams.length) : null;
  const signals = { activity, mastery, review, quiz, topicCompletion };
  // No verified events => no activity-aware score, instead of reporting ordinary study time as verified.
  return { ...totals, score: activity === null ? null : weightedScore(signals), signals, trackedEvents: events.length, cameraIncludedInScore: false };
}
