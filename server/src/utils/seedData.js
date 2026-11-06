// Demo data: 5 subjects, 4 weeks of sessions with realistic focus logs, mastery history, surveys.
// Run `npm run seed` (creates demo@demo.com / demo1234) or use "Load demo data" in Settings.
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { DateTime } from 'luxon';
import { User, Subject, ExamEvent, StudySession, FocusLog, ActivityEvent, ScheduleItem, Survey, RLSnapshot, Question, ExamAttempt } from '../models.js';
import { updateMastery } from '../services/bkt.js';
import { applyReview } from '../services/spacedRep.js';
import { fuse } from '../services/focus.js';
import { generateSchedule } from '../services/scheduler.js';
import { PRIOR } from '../config/constants.js';

const rnd = Math.random;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

const PLAN = [
  { n: 'Data Structures', d: 4, exam: 10, code: 'CS301', mode: true, t: ['Arrays & Linked Lists', 'Stacks & Queues', 'Trees', 'Graphs', 'Hashing', 'Sorting', 'Dynamic Programming'] },
  { n: 'Operating Systems', d: 4, exam: 25, code: 'CS302', t: ['Processes', 'CPU Scheduling', 'Synchronization', 'Deadlocks', 'Memory Management', 'File Systems'] },
  { n: 'DBMS', d: 3, t: ['ER Model', 'Normalization', 'SQL', 'Transactions', 'Indexing', 'NoSQL'] },
  { n: 'Computer Networks', d: 3, t: ['OSI Model', 'IP Addressing', 'Routing', 'TCP & UDP', 'DNS & HTTP', 'Network Security'] },
  { n: 'Engineering Maths', d: 5, t: ['Linear Algebra', 'Probability', 'Statistics', 'Discrete Maths', 'Calculus'] },
];

export async function seedForUser(user) {
  const uid = user._id;
  const tz = user.timezone || 'Asia/Kolkata';
  const oldSubjects = await Subject.find({ userId: uid }, '_id');
  await Question.deleteMany({ subjectId: { $in: oldSubjects.map((s) => s._id) } });
  const olds = await StudySession.find({ userId: uid }, '_id');
  await FocusLog.deleteMany({ sessionId: { $in: olds.map((s) => s._id) } });
  await ActivityEvent.deleteMany({ userId: uid });
  await Promise.all([Subject, ExamEvent, StudySession, ScheduleItem, Survey, RLSnapshot, ExamAttempt].map((M) => M.deleteMany({ userId: uid })));

  const now = DateTime.now().setZone(tz);
  const subjects = [];
  for (const p of PLAN) {
    const examDate = p.exam ? now.plus({ days: p.exam }).set({ hour: 10, minute: 0 }).toJSDate() : null;
    const s = await Subject.create({
      userId: uid, subjectName: p.n, difficulty: p.d, paperCode: p.code || null, examDate, examModeActive: !!p.mode,
      topics: p.t.map((name) => ({ name, difficulty: clamp(p.d + pick([-1, 0, 0, 1]), 1, 5), mastery: PRIOR[p.d] })),
    });
    if (examDate) { const e = await ExamEvent.create({ userId: uid, subjectId: s._id, title: `${p.n} exam`, examDate, paperCode: p.code }); s.examEventId = e._id; }
    subjects.push(s);
  }

  const thisWeek = now.startOf('week');
  const lastWeek = thisWeek.minus({ weeks: 1 });
  const sessions = [], logs = [];
  const DAYS = 28;

  for (let d = DAYS - 1; d >= 1; d--) { // d=0 (today) is left empty so the dashboard shows a plan
    const day = now.minus({ days: d });
    if (rnd() < 0.12) continue; // a few rest days
    const progress = (DAYS - 1 - d) / (DAYS - 1); // 0 -> 1 over the month
    const hours = pick([[9, 14], [10, 15], [14, 19], [9, 15, 20], [15, 20], [9, 14, 19]]);
    for (const hour of hours) {
      const inLastWeek = day >= lastWeek && day < thisWeek;
      const pool = subjects.filter((s) => !(inLastWeek && s.subjectName === 'Computer Networks')); // creates a visible "behind schedule" alert
      const weights = pool.map((s) => 1.2 - s.topics.reduce((a, t) => a + t.mastery, 0) / s.topics.length);
      let x = rnd() * weights.reduce((a, b) => a + b, 0), subj = pool[0];
      for (let i = 0; i < pool.length; i++) { x -= weights[i]; if (x <= 0) { subj = pool[i]; break; } }
      const topic = [...subj.topics].sort((a, b) => a.mastery - b.mastery).slice(0, 3)[Math.floor(rnd() * 3)] || subj.topics[0];

      // focus level: strong mornings, a dip at 2-4 PM, decent evenings, improving over the month
      let base = hour < 12 ? 68 : hour < 17 ? 38 : 58;
      base = clamp(base + progress * (hour >= 12 && hour < 17 ? 6 : 20) + (rnd() - 0.5) * 12, 20, 95); // afternoon dip persists
      const planned = Math.min(90, 30 + 10 * topic.difficulty);
      const completed = rnd() < 0.5 + progress * 0.42;
      const actual = completed ? planned + Math.round((rnd() - 0.5) * 10) : Math.round(planned * (0.3 + rnd() * 0.4));
      const start = day.set({ hour, minute: Math.floor(rnd() * 20), second: 0 });
      const session = new StudySession({
        userId: uid, subjectId: subj._id, topicName: topic.name, startTime: start.toJSDate(),
        endTime: start.plus({ minutes: actual }).toJSDate(), plannedMins: planned, actualMins: actual, completed,
        mode: subj.examModeActive ? 'exam' : 'rl',
      });
      const comps = [];
      for (let m = 0; m < actual; m++) {
        const p = base / 100;
        const keystroke = rnd() < clamp(p + 0.1, 0, 1) ? 100 : 0;
        const appSwitch = rnd() < (1 - p) * 0.6 ? Math.max(0, 100 - 25 * (1 + Math.floor(rnd() * 3))) : 100;
        const webcam = rnd() < 0.85 ? (rnd() < p ? 100 : pick([40, 0])) : null;
        const f = fuse({ keystroke, appSwitch, webcam });
        comps.push(f.composite);
        logs.push({ sessionId: session._id, minuteIndex: m, keystrokeScore: keystroke, appSwitchScore: appSwitch, webcamScore: webcam, compositeScore: f.composite, dominantSignal: f.dominantSignal });
      }
      session.avgFocusScore = Math.round((comps.reduce((a, b) => a + b, 0) / comps.length) * 100) / 100;
      const correct = rnd() < clamp(0.45 + progress * 0.4, 0, 0.92);
      session.selfRating = correct ? pick([3, 4, 4, 5]) : pick([1, 2, 2]);
      if (!subj.examModeActive) session.rlReward = Math.round((0.1 + rnd() * 0.45) * 1000) / 1000;
      sessions.push(session);

      topic.mastery = updateMastery(topic.mastery, session.selfRating >= 3);
      topic.masteryHistory.push({ date: start.toJSDate(), mastery: topic.mastery });
      topic.lastStudied = start.toJSDate();
      topic.studyCount += 1;
      if (subj.examModeActive) applyReview(topic, session.selfRating, subj.examDate, start.toJSDate());
    }
  }

  await Promise.all(subjects.map((s) => s.save()));
  await StudySession.insertMany(sessions);
  for (let i = 0; i < logs.length; i += 5000) await FocusLog.insertMany(logs.slice(i, i + 5000));

  // skipped slots last week for Computer Networks -> triggers the "behind schedule" alert
  const cn = subjects.find((s) => s.subjectName === 'Computer Networks');
  await ScheduleItem.insertMany([1, 2, 3].map((i) => {
    const st = lastWeek.plus({ days: i, hours: 16 });
    return { userId: uid, subjectId: cn._id, topicName: cn.topics[i].name, date: st.startOf('day').toJSDate(), startTime: st.toJSDate(), endTime: st.plus({ minutes: 60 }).toJSDate(), type: 'study', plannedMins: 60, status: 'skipped', generatedBy: 'rl', weekStart: lastWeek.toISODate() };
  }));

  await Survey.create([{ userId: uid, type: 'pre', score: 4, createdAt: now.minus({ days: DAYS }).toJSDate() }, { userId: uid, type: 'post', score: 8 }]);
  user.rlWeights = [0.02, 0.33, 0.22, 0.3, 0.08, 0.12];
  user.rlEpisodes = 30;
  await user.save();
  await RLSnapshot.create({ userId: uid, weights: user.rlWeights, episodes: user.rlEpisodes });
  await generateSchedule(user);
  return { subjects: subjects.length, sessions: sessions.length, focusLogs: logs.length };
}

// CLI: npm run seed
if (process.argv[1]?.endsWith('seedData.js')) {
  await mongoose.connect(process.env.MONGO_URI);
  let user = await User.findOne({ email: 'demo@demo.com' });
  if (!user) user = await User.create({ fullName: 'Demo Student', email: 'demo@demo.com', passwordHash: await bcrypt.hash('demo1234', 12), timezone: 'Asia/Kolkata' });
  console.log(await seedForUser(user));
  console.log('Login with demo@demo.com / demo1234');
  await mongoose.disconnect();
}
