import { Router } from 'express';
import { DateTime } from 'luxon';
import { Subject, ExamEvent, ScheduleItem, StudySession, FocusLog, Survey, Question, ExamAttempt, ActivityEvent } from '../models.js';
import examAttemptRoutes from './exams.js';
import { httpError, num, integer, text } from '../middleware/error.js';
import { MAX_SUBJECTS, MAX_EXAM_WEEKS, PRIOR } from '../config/constants.js';
import { generateSchedule } from '../services/scheduler.js';
import { updateMastery } from '../services/bkt.js';
import { applyReview, dueReviews } from '../services/spacedRep.js';
import { avgMastery } from '../services/priority.js';
import * as rl from '../services/rl.js';
import { flushSession } from '../sockets/focusSocket.js';
import { seedForUser } from '../utils/seedData.js';

import { exclusive } from '../utils/locks.js';

const r = Router();
// Exam attempts use /exams; calendar events use /exam-events.
r.use('/', examAttemptRoutes);

// ---------- helpers ----------
const makeTopic = (t, subjDiff) => {
  if (t === null || !['string', 'object'].includes(typeof t) || Array.isArray(t)) throw httpError(400, 'Invalid topic');
  const name = text(typeof t === 'string' ? t : t.name, 'Topic name');
  if (!name) return null;
  const difficulty = typeof t === 'object' && t.difficulty !== undefined ? integer(t.difficulty, 1, 5, 'Topic difficulty') : subjDiff;
  return { name, difficulty, mastery: PRIOR[difficulty] };
};
function parseExam(v) {
  if (v === undefined) return undefined; // not provided
  if (v === null || v === '') return null; // clear
  const d = new Date(v);
  if (isNaN(d)) throw httpError(400, 'Invalid exam date');
  if (d < new Date(Date.now() - 864e5)) throw httpError(400, 'Exam date must be in the future');
  if (d > new Date(Date.now() + MAX_EXAM_WEEKS * 7 * 864e5)) throw httpError(400, `Exams can be at most ${MAX_EXAM_WEEKS} weeks ahead`);
  return d;
}
async function linkExam(s) {
  await ExamEvent.deleteMany({ subjectId: s._id });
  if (s.examDate) {
    const e = await ExamEvent.create({ userId: s.userId, subjectId: s._id, title: `${s.subjectName} exam`, examDate: s.examDate, paperCode: s.paperCode });
    s.examEventId = e._id;
  } else { s.examEventId = null; s.examModeActive = false; }
  await s.save();
}
const owned = async (req) => {
  const s = await Subject.findOne({ _id: req.params.id, userId: req.user._id });
  if (!s) throw httpError(404, 'Subject not found');
  return s;
};

// ---------- subjects ----------
r.get('/subjects', async (req, res) => res.json(await Subject.find({ userId: req.user._id }).sort({ createdAt: 1 })));

r.post('/subjects', async (req, res) => {
  const { subjectName, difficulty, topics = [], examDate, paperCode } = req.body;
  text(subjectName, 'Subject name');
  if (!Array.isArray(topics)) throw httpError(400, 'Topics must be an array');
  const diff = integer(difficulty, 1, 5, 'Difficulty');
  if ((await Subject.countDocuments({ userId: req.user._id })) >= MAX_SUBJECTS) throw httpError(400, `You can add up to ${MAX_SUBJECTS} subjects`);
  const preparedTopics = topics.map((t) => makeTopic(t, diff)).filter(Boolean);
  if (new Set(preparedTopics.map((t) => t.name)).size !== preparedTopics.length) throw httpError(400, 'Topic names must be unique');
  const s = await Subject.create({
    userId: req.user._id, subjectName: subjectName.trim(), difficulty: diff, paperCode: paperCode || null,
    examDate: parseExam(examDate) ?? null, topics: preparedTopics,
  });
  await linkExam(s);
  res.status(201).json(s);
});

r.put('/subjects/:id', async (req, res) => {
  const s = await owned(req);
  const b = req.body;
  if (b.subjectName !== undefined) s.subjectName = text(b.subjectName, 'Subject name');
  if (b.difficulty !== undefined) s.difficulty = integer(b.difficulty, 1, 5, 'Difficulty');
  if (b.paperCode !== undefined) s.paperCode = b.paperCode || null;
  const d = parseExam(b.examDate);
  if (d !== undefined) s.examDate = d;
  await linkExam(s);
  res.json(s);
});

r.delete('/subjects/:id', async (req, res) => {
  const s = await owned(req);
  if (await StudySession.exists({ subjectId: s._id, endTime: null })) throw httpError(409, 'Finish active sessions before deleting this subject');
  const sessions = await StudySession.find({ subjectId: s._id }, '_id');
  await FocusLog.deleteMany({ sessionId: { $in: sessions.map((session) => session._id) } });
  await ActivityEvent.deleteMany({ sessionId: { $in: sessions.map((session) => session._id) } });
  await Promise.all([ExamEvent, ScheduleItem, StudySession, Question, ExamAttempt].map((M) => M.deleteMany({ subjectId: s._id })));
  await s.deleteOne();
  res.json({ ok: true });
});

r.post('/subjects/:id/topics', async (req, res) => {
  const s = await owned(req);
  if (!Array.isArray(req.body.names)) throw httpError(400, 'Names must be an array');
  const names = req.body.names.map((t) => makeTopic(t, s.difficulty)).filter(Boolean);
  if (!names.length) throw httpError(400, 'Give at least one topic name');
  const existing = new Set(s.topics.map((t) => t.name));
  for (const topic of names) {
    if (existing.has(topic.name)) throw httpError(400, 'Topic names must be unique');
    existing.add(topic.name);
  }
  s.topics.push(...names);
  await s.save();
  res.json(s);
});

r.delete('/subjects/:id/topics/:name', async (req, res) => {
  const s = await owned(req);
  if (await StudySession.exists({ subjectId: s._id, topicName: req.params.name, endTime: null })) throw httpError(409, 'Finish active sessions before deleting this topic');
  s.topics = s.topics.filter((t) => t.name !== req.params.name);
  await ScheduleItem.deleteMany({ subjectId: s._id, topicName: req.params.name, status: 'planned' });
  await s.save();
  res.json(s);
});

r.post('/subjects/:id/exam-mode', async (req, res) => {
  const s = await owned(req);
  if (typeof req.body.active !== 'boolean') throw httpError(400, 'Active must be a boolean');
  const active = req.body.active;
  if (active && (!s.examDate || s.examDate < new Date())) throw httpError(400, 'Add a future exam date before turning on Exam Mode');
  s.examModeActive = active;
  if (active) s.topics.forEach((t) => { if (!t.nextReview) t.nextReview = new Date(); });
  await s.save();
  res.json(s);
});

// ---------- exams ----------
r.get('/exam-events', async (req, res) => res.json(await ExamEvent.find({ userId: req.user._id }).sort({ examDate: 1 })));
r.post(['/exams', '/exam-events'], async (req, res) => {
  const s = await Subject.findOne({ _id: req.body.subjectId, userId: req.user._id });
  if (!s) throw httpError(404, 'Subject not found');
  s.examDate = parseExam(req.body.examDate);
  if (req.body.paperCode) s.paperCode = req.body.paperCode;
  await linkExam(s);
  res.status(201).json(await ExamEvent.findById(s.examEventId));
});

// ---------- schedule ----------
r.post('/schedule/generate', async (req, res) => {
  const { items, mode } = await generateSchedule(req.user);
  res.json({ count: items.length, mode });
});

r.get('/schedule', async (req, res) => {
  const from = req.query.from ? new Date(req.query.from) : new Date();
  const to = req.query.to ? new Date(req.query.to) : new Date(Date.now() + 7 * 864e5);
  if (isNaN(from) || isNaN(to) || from >= to) throw httpError(400, 'Invalid schedule date range');
  res.json(await ScheduleItem.find({ userId: req.user._id, startTime: { $gte: from, $lt: to } }).sort({ startTime: 1 }).populate('subjectId', 'subjectName difficulty'));
});

r.patch('/schedule/:id', async (req, res) => {
  if (!['done', 'skipped', 'planned'].includes(req.body.status)) throw httpError(400, 'Invalid status');
  const it = await ScheduleItem.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { status: req.body.status }, { new: true });
  if (!it) throw httpError(404, 'Item not found');
  res.json(it);
});

// ---------- sessions ----------
r.post('/sessions/start', async (req, res) => {
  const { subjectId, topicName, plannedMins, scheduleItemId } = req.body;
  const s = await Subject.findOne({ _id: subjectId, userId: req.user._id });
  if (!s) throw httpError(404, 'Subject not found');
  if (s.examModeActive && (!s.examDate || s.examDate <= new Date())) { s.examModeActive = false; await s.save(); }
  if (!s.topics.some((t) => t.name === topicName)) throw httpError(400, 'Choose a topic from this subject');
  let mode = s.examModeActive ? 'exam' : 'heuristic';
  if (scheduleItemId) {
    const it = await ScheduleItem.findOne({ _id: scheduleItemId, userId: req.user._id, subjectId: s._id, topicName, status: 'planned', type: { $ne: 'break' } });
    if (!it) throw httpError(400, 'Schedule item does not match this session');
    if (!s.examModeActive) mode = it.generatedBy;
  }
  if (req.body.activityTracking === true && !req.user.activityConsent) throw httpError(403, 'Enable browser monitoring consent first');
  if (req.body.activityTracking === true && await StudySession.exists({ userId: req.user._id, endTime: null, activityTracking: true })) throw httpError(409, 'Finish the other monitored session first');
  const session = await StudySession.create({
    activityTracking: req.body.activityTracking === true,
    userId: req.user._id, subjectId, topicName, plannedMins: integer(plannedMins, 5, 90, 'Planned minutes'),
    startTime: new Date(), scheduleItemId: scheduleItemId || null, mode,
  });
  res.status(201).json(session);
});

// Ends a session: focus average -> BKT mastery -> SM-2 (exam mode) -> RL reward & update.
r.post('/sessions/:id/end', async (req, res) => exclusive(`session:${req.params.id}`, async () => {
  const u = req.user;
  const rating = integer(req.body.selfRating, 1, 5, 'Self rating');
  const actualMins = num(req.body.actualMins, 0, 1440, 'Actual minutes');
  if (typeof req.body.completed !== 'boolean') throw httpError(400, 'Completed must be a boolean');
  const session = await StudySession.findOne({ _id: req.params.id, userId: u._id });
  if (!session) throw httpError(404, 'Session not found');
  if (session.endTime) throw httpError(400, 'Session already ended');
  await flushSession(session._id);
  const agg = await FocusLog.aggregate([{ $match: { sessionId: session._id } }, { $group: { _id: null, avg: { $avg: '$compositeScore' } } }]);
  const avgFocus = agg[0] ? Math.round(agg[0].avg * 100) / 100 : null;
  const now = new Date();
  const completed = !!req.body.completed;

  const all = await Subject.find({ userId: u._id });
  const subject = all.find((s) => String(s._id) === String(session.subjectId));
  const topic = subject?.topics.find((t) => t.name === session.topicName);
  let before = null, after = null, reward = null, nextReview = null;

  if (subject && topic) {
    const phi = rl.features(subject, now); // state before the session
    const preMastery = avgMastery(subject);
    before = topic.mastery;
    topic.mastery = updateMastery(before, rating >= 3);
    after = topic.mastery;
    topic.masteryHistory.push({ date: now, mastery: after });
    topic.lastStudied = now;
    topic.studyCount += 1;
    if (subject.examModeActive) { applyReview(topic, rating, subject.examDate, now); nextReview = topic.nextReview; }
    await subject.save();
    if (!subject.examModeActive) {
      reward = rl.computeReward({ subject, others: all.filter((s) => s !== subject && s.topics.length), preMastery, completed, now });
      rl.update(u, phi, reward, all.filter((s) => !s.examModeActive), now);
      await u.save();
    }
  }
  Object.assign(session, {
    endTime: now, actualMins: Math.round(actualMins * 100) / 100,
    avgFocusScore: avgFocus, completed, selfRating: rating, rlReward: reward,
  });
  await session.save();
  if (session.scheduleItemId) await ScheduleItem.findOneAndUpdate({ _id: session.scheduleItemId, userId: u._id }, { status: completed ? 'done' : 'skipped' });
  res.json({ avgFocus, actualMins: session.actualMins, completed, mastery: { before, after }, reward, nextReview, mode: session.mode });
}));

r.get('/sessions', async (req, res) =>
  res.json(await StudySession.find({ userId: req.user._id }).sort({ startTime: -1 }).limit(req.query.limit === undefined ? 50 : integer(req.query.limit, 1, 200, 'Limit')).populate('subjectId', 'subjectName')));

// ---------- exam mode ----------
r.get('/exam-mode/queue', async (req, res) => {
  const u = req.user;
  const subjects = await Subject.find({ userId: u._id, examModeActive: true });
  const now = DateTime.now().setZone(u.timezone);
  const due = dueReviews(subjects, u, now).get(now.toISODate()) || [];
  res.json({
    queue: due.map((d) => ({ subjectId: d.subject._id, subject: d.subject.subjectName, topic: d.topic.name, mastery: Math.round(d.topic.mastery * 100) })),
    subjects: subjects.map((s) => {
      const w = s.topics.reduce((a, t) => a + t.difficulty, 0) || 1;
      return {
        _id: s._id, subjectName: s.subjectName, examDate: s.examDate,
        daysLeft: Math.ceil((new Date(s.examDate) - Date.now()) / 864e5),
        readiness: Math.round((100 * s.topics.reduce((a, t) => a + t.mastery * t.difficulty, 0)) / w),
        topics: s.topics.map((t) => ({ name: t.name, mastery: Math.round(t.mastery * 100), nextReview: t.nextReview, intervalDays: t.intervalDays, easeFactor: t.easeFactor })),
      };
    }),
  });
});

// ---------- surveys & seed ----------
r.get('/surveys', async (req, res) => res.json(await Survey.find({ userId: req.user._id }).sort({ createdAt: 1 })));
r.post('/surveys', async (req, res) => {
  if (!['pre', 'post'].includes(req.body.type)) throw httpError(400, 'type must be pre or post');
  res.status(201).json(await Survey.create({ userId: req.user._id, type: req.body.type, score: integer(req.body.score, 1, 10, 'Score') }));
});
r.post('/seed', async (req, res) => {
  await seedForUser(req.user);
  res.json({ ok: true });
});

export default r;
