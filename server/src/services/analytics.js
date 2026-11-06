// Analytics: aggregates sessions / focus data into the dashboard views.
import { DateTime } from 'luxon';
import { Subject, StudySession, ScheduleItem } from '../models.js';
import { PRIOR } from '../config/constants.js';

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (n) => Math.round(n * 10) / 10;
const zone = (u) => u.timezone || 'Asia/Kolkata';
const wk = (d, tz) => DateTime.fromJSDate(new Date(d)).setZone(tz).startOf('week').toISODate();
const hourLabel = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;

/** Stacked bar data: minutes per subject per week + alert when last week < 50% of plan. */
export async function timeDistribution(user, weeks = 4) { // Aggregate actualMins (minutes) per subject per week for the past `weeks` weeks
  const tz = zone(user);
  const thisWeek = DateTime.now().setZone(tz).startOf('week');
  const first = thisWeek.minus({ weeks: weeks - 1 });
  const sessions = await StudySession.find({ userId: user._id, startTime: { $gte: first.toJSDate() }, actualMins: { $ne: null } }).populate('subjectId', 'subjectName');
  const rows = {};
  for (let i = 0; i < weeks; i++) rows[first.plus({ weeks: i }).toISODate()] = {};
  const names = new Set();
  for (const s of sessions) {
    const n = s.subjectId?.subjectName;
    if (!n) continue;
    names.add(n);
    const w = wk(s.startTime, tz);
    if (rows[w]) rows[w][n] = (rows[w][n] || 0) + s.actualMins;
  }
  // alerts: previous full week, actual vs planned (sessions + skipped slots)
  const lw = thisWeek.minus({ weeks: 1 });
  const [lwSessions, skipped] = await Promise.all([
    StudySession.find({ userId: user._id, startTime: { $gte: lw.toJSDate(), $lt: thisWeek.toJSDate() } }).populate('subjectId', 'subjectName'),
    ScheduleItem.find({ userId: user._id, type: { $ne: 'break' }, status: 'skipped', startTime: { $gte: lw.toJSDate(), $lt: thisWeek.toJSDate() } }).populate('subjectId', 'subjectName'),
  ]);
  const agg = {};
  for (const s of lwSessions) { const n = s.subjectId?.subjectName; if (n) { agg[n] ??= { planned: 0, actual: 0 }; agg[n].planned += s.plannedMins; agg[n].actual += s.actualMins || 0; } }
  for (const i of skipped) { const n = i.subjectId?.subjectName; if (n) { agg[n] ??= { planned: 0, actual: 0 }; agg[n].planned += i.plannedMins; } }
  const alerts = Object.entries(agg)
    .filter(([, v]) => v.planned > 0 && v.actual < 0.5 * v.planned)
    .map(([subject, v]) => ({ subject, planned: v.planned, actual: v.actual }));
  return { subjects: [...names], rows: Object.entries(rows).map(([week, v]) => ({ week, ...v })), alerts };
}

/** Daily focus, 7-day moving average and recurring low-focus time windows. */
/** Daily focus trend: returns per‑day avgFocusScore and 7‑day moving average */
export async function focusTrend(user, days = 30) {
  const tz = zone(user);
  const since = DateTime.now().minus({ days }).toJSDate();
  const sessions = await StudySession.find({ userId: user._id, startTime: { $gte: since }, avgFocusScore: { $ne: null } });
  const daily = {}, hourly = {};
  for (const s of sessions) {
    const dt = DateTime.fromJSDate(s.startTime).setZone(tz);
    (daily[dt.toISODate()] ??= []).push(s.avgFocusScore);
    (hourly[dt.hour] ??= []).push(s.avgFocusScore);
  }
  const dates = Object.keys(daily).sort();
  const means = Object.fromEntries(dates.map((d) => [d, mean(daily[d])]));
  const series = dates.map((d) => {
    const lo = DateTime.fromISO(d).minus({ days: 6 }).toISODate();
    const win = dates.filter((x) => x >= lo && x <= d).map((x) => means[x]);
    return { date: d, focus: r1(means[d]), avg7: r1(mean(win)) };
  });
  const overall = mean(sessions.map((s) => s.avgFocusScore));
  const low = Object.entries(hourly).filter(([, v]) => v.length >= 3 && mean(v) < overall - 10).map(([h]) => Number(h)).sort((a, b) => a - b);
  const windows = [];
  for (const h of low) {
    const last = windows[windows.length - 1];
    if (last && last.to === h) last.to = h + 1; else windows.push({ from: h, to: h + 1 });
  }
  const insights = windows.map((w) => ({
    from: w.from, to: w.to,
    message: `Your focus drops between ${hourLabel(w.from)} and ${hourLabel(w.to)}. Plan lighter tasks or take a break then.`,
  }));
  return { series, overall: r1(overall), insights };
}

/** Mastery per subject per week + stagnation flags. */
/**
 * Subject mastery over time.
 * For each week, computes the average of each topic's latest mastery value
 * (as stored in Topic.masteryHistory) up to the week end, then scales to 0‑100.
 * Returns rows [{ week, <subjectName>: mastery% }...] and any stagnation flags.
 */
export async function masteryProgress(user) {
  const tz = zone(user);
  const subjects = await Subject.find({ userId: user._id });
  const weeks = new Set();
  subjects.forEach((s) => s.topics.forEach((t) => t.masteryHistory.forEach((p) => weeks.add(wk(p.date, tz)))));
  const sorted = [...weeks].sort();
  const rows = sorted.map((w) => {
    const end = DateTime.fromISO(w, { zone: tz }).endOf('week').toJSDate();
    const row = { week: w };
    for (const s of subjects) {
      row[s.subjectName] = r1(100 * mean(s.topics.map((t) => {
        const h = t.masteryHistory.filter((p) => p.date <= end);
        return h.length ? h[h.length - 1].mastery : PRIOR[t.difficulty] ?? 0.25;
      })));
    }
    return row;
  });
  const flags = [];
  for (const s of subjects)
    for (const t of s.topics) {
      const h = t.masteryHistory;
      if (h.length >= 4 && t.mastery < 0.9 && h[h.length - 1].mastery - h[h.length - 4].mastery < 0.05)
        flags.push({ subject: s.subjectName, topic: t.name, message: 'Progress has stalled. Try active self-testing instead of passive reading.' });
    }
  return { subjects: subjects.map((s) => s.subjectName), rows, flags };
}

/** Exam readiness = difficulty-weighted mean of topic mastery. */
/**
 * Exam readiness calculation.
 * For each subject with a future examDate, compute difficulty‑weighted
 * average mastery of its topics, then round to % (0‑100).
 * Also return days remaining until the exam.
 */
export async function readiness(user) {
  const subjects = await Subject.find({ userId: user._id, examDate: { $ne: null } }).sort({ examDate: 1 });
  return subjects.map((s) => {
    const wsum = s.topics.reduce((a, t) => a + t.difficulty, 0) || 1;
    const score = s.topics.reduce((a, t) => a + t.mastery * t.difficulty, 0) / wsum;
    return {
      subjectId: s._id, subject: s.subjectName, paperCode: s.paperCode, examModeActive: s.examModeActive,
      readiness: Math.round(score * 100),
      daysRemaining: Math.ceil((new Date(s.examDate) - Date.now()) / 864e5),
      topics: s.topics.map((t) => ({ name: t.name, mastery: Math.round(t.mastery * 100), difficulty: t.difficulty })),
    };
  });
}

/** Weekly productivity = 0.4*completion + 0.4*focus + 0.2*goal attainment (goal = daily goal x 5 study days). */
/**
 * Weekly productivity score.
 * For each week compute:
 *   completion = 100 * (completed sessions / total sessions)
 *   focus = average of avgFocusScore across sessions (0‑100 range)
 *   goal = min(100, actualMins total / (dailyGoalMins * 5))
 * Then score = round(0.4*completion + 0.4*focus + 0.2*goal).
 * Result is bounded 0‑100.
 */
export async function productivity(user, weeks = 6) {
  const tz = zone(user);
  const first = DateTime.now().setZone(tz).startOf('week').minus({ weeks: weeks - 1 });
  const sessions = await StudySession.find({ userId: user._id, startTime: { $gte: first.toJSDate() }, endTime: { $ne: null } });
  const out = [];
  for (let i = 0; i < weeks; i++) {
    const w = first.plus({ weeks: i }).toISODate();
    const ws = sessions.filter((s) => wk(s.startTime, tz) === w);
    const completion = ws.length ? (100 * ws.filter((s) => s.completed).length) / ws.length : 0;
    const focus = mean(ws.filter((s) => s.avgFocusScore != null).map((s) => s.avgFocusScore));
    const goal = Math.min(100, (100 * ws.reduce((a, s) => a + (s.actualMins || 0), 0)) / (user.dailyGoalMins * 5));
    out.push({ week: w, score: ws.length ? Math.round(0.4 * completion + 0.4 * focus + 0.2 * goal) : 0, completion: Math.round(completion), focus: Math.round(focus), goal: Math.round(goal) });
  }
  return out;
}

export async function summary(user) {
  const tz = zone(user);
  const sessions = await StudySession.find({ userId: user._id, endTime: { $ne: null } });
  const done = sessions.filter((s) => s.completed);
  const days = new Set(done.map((s) => DateTime.fromJSDate(s.startTime).setZone(tz).toISODate()));
  let d = DateTime.now().setZone(tz).startOf('day');
  if (!days.has(d.toISODate())) d = d.minus({ days: 1 });
  let streak = 0;
  while (days.has(d.toISODate())) { streak++; d = d.minus({ days: 1 }); }
  const todayKey = DateTime.now().setZone(tz).toISODate();
  const prod = await productivity(user, 1);
  const recent = sessions.filter((s) => s.avgFocusScore != null && DateTime.fromJSDate(s.startTime) > DateTime.now().minus({ days: 30 }));
  return {
    streak,
    totalSessions: sessions.length,
    totalHours: r1(sessions.reduce((a, s) => a + (s.actualMins || 0), 0) / 60),
    completionRate: sessions.length ? Math.round((100 * done.length) / sessions.length) : 0,
    avgFocus: Math.round(mean(recent.map((s) => s.avgFocusScore))),
    todayMins: sessions.filter((s) => DateTime.fromJSDate(s.startTime).setZone(tz).toISODate() === todayKey).reduce((a, s) => a + (s.actualMins || 0), 0),
    productivity: prod[0]?.score || 0,
  };
}
