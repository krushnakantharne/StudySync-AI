// Schedule Generation Engine: ranker (heuristic or RL) -> time allocator (bin-packing into free slots).
import { DateTime } from 'luxon';
import { Subject, ScheduleItem, StudySession } from '../models.js';
import { rankTopics, topicPriority, topicKey, bestTopic } from './priority.js';
import * as rl from './rl.js';
import { dueReviews } from './spacedRep.js';
import { exclusive } from '../utils/locks.js';
import { REVIEW_MINS, RL } from '../config/constants.js';

const roundUp = (dt, m) => DateTime.fromMillis(Math.ceil(dt.toMillis() / (m * 60000)) * m * 60000, { zone: dt.zone });

function pickNext(normal, at, sim, lastId, useRL, user) {
  if (useRL) {
    const s = rl.chooseSubject(user, normal, at, { sim, excludeId: lastId, explore: true });
    return s ? { subject: s, topic: bestTopic(s, at, sim) } : null;
  }
  const ranked = rankTopics(normal, at, sim);
  return ranked.find((r) => String(r.subject._id) !== String(lastId)) || ranked[0] || null;
}

/**
 * Pure planning function (no DB) so it can be unit-tested.
 * `now` is a luxon DateTime in the user's timezone.
 */
export function buildSchedule({ user, subjects, now, avgFocus = 70, useRL = false, doneMinsToday = 0, reservedItems = [] }) {
  const goal = user.dailyGoalMins;
  const normal = subjects.filter((s) => (!s.examModeActive || !s.examDate || new Date(s.examDate) <= now.toJSDate()) && s.topics.length);
  const reviews = dueReviews(subjects.filter((s) => s.examModeActive), user, now, avgFocus);
  const sim = new Map();
  const items = [];
  let lastId = null;

  const add = (start, mins, extra) => {
    const end = start.plus({ minutes: mins });
    items.push({
      userId: user._id, status: 'planned', plannedMins: mins,
      weekStart: start.startOf('week').toISODate(),
      date: start.startOf('day').toJSDate(), startTime: start.toJSDate(), endTime: end.toJSDate(),
      ...extra,
    });
    return end;
  };

  for (let d = 0; d < 7; d++) {
    const day = now.startOf('day').plus({ days: d });
    let cursor = day.set({ hour: user.preferredStartHour });
    const end = day.set({ hour: user.preferredEndHour });
    if (cursor < now) cursor = roundUp(now, 15);
    const reserved = reservedItems.filter((i) => DateTime.fromJSDate(new Date(i.startTime)).setZone(now.zone).hasSame(day, 'day'));
    let used = (d === 0 ? doneMinsToday : 0) + reserved.filter((i) => i.type !== 'break').reduce((n, i) => n + i.plannedMins, 0);
    const slot = (mins) => {
      let start = cursor;
      for (const block of [...reservedItems].sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))) {
        if (+start < +new Date(block.endTime) && +start.plus({ minutes: mins }) > +new Date(block.startTime)) {
          start = DateTime.fromJSDate(new Date(block.endTime)).setZone(now.zone);
        }
      }
      return start;
    };

    // 1) Exam-mode spaced-repetition reviews come first.
    for (const r of reviews.get(day.toISODate()) || []) {
      const reviewMins = Math.min(REVIEW_MINS, user.maxSessionMins || 90);
      if (used + reviewMins > goal) break;
      cursor = slot(reviewMins);
      if (cursor.plus({ minutes: reviewMins }) > end) break;
      if (+cursor.plus({ minutes: reviewMins }) > +new Date(r.subject.examDate)) continue;
      cursor = add(cursor, reviewMins, { subjectId: r.subject._id, topicName: r.topic.name, type: 'review', generatedBy: 'exam' });
      used += reviewMins;
      if (+slot(10) === +cursor && cursor.plus({ minutes: 10 }) < end) cursor = add(cursor, 10, { type: 'break', topicName: 'Break', generatedBy: 'exam' });
    }

    // 2) Regular study sessions (RL agent or priority ranker).
    while (normal.length) {
      const pick = pickNext(normal, cursor.toJSDate(), sim, lastId, useRL, user);
      if (!pick || !pick.topic) break;
      const len = Math.min(90, user.maxSessionMins || 90, 30 + 10 * pick.topic.difficulty, goal - used);
      if (len < 5) break;
      cursor = slot(len);
      if (used + len > goal || cursor.plus({ minutes: len }) > end) break;
      const subjectId = pick.subject._id;
      cursor = add(cursor, len, { subjectId, topicName: pick.topic.name, type: 'study', generatedBy: useRL ? 'rl' : 'heuristic' });
      used += len;
      sim.set(topicKey(pick.subject, pick.topic), cursor.toJSDate()); // simulate recency = 0 so subjects rotate
      lastId = subjectId;
      const brk = pick.subject.difficulty >= 4 ? 15 : 10;
      if (+slot(brk) === +cursor && cursor.plus({ minutes: brk }) < end) cursor = add(cursor, brk, { type: 'break', topicName: 'Break', generatedBy: useRL ? 'rl' : 'heuristic' });
    }
  }
  return items;
}

export async function generateSchedule(user) {
  return exclusive(`schedule:${user._id}`, () => generateForUser(user));
}

async function generateForUser(user) {
  const now = DateTime.now().setZone(user.timezone || 'Asia/Kolkata');
  const dayStart = now.startOf('day').toJSDate();
  const [subjects, doneCount, recent, todays] = await Promise.all([
    Subject.find({ userId: user._id }),
    StudySession.countDocuments({ userId: user._id, completed: true }),
    StudySession.find({ userId: user._id, avgFocusScore: { $ne: null } }).sort({ startTime: -1 }).limit(5),
    StudySession.find({ userId: user._id, startTime: { $gte: dayStart }, actualMins: { $ne: null } }),
  ]);
  // Keep active sessions and retain their time while replacing other future plans.
  const active = await StudySession.find({ userId: user._id, endTime: null });
  const activeIds = active.map((s) => s.scheduleItemId).filter(Boolean);
  await ScheduleItem.updateMany({ userId: user._id, _id: { $nin: activeIds }, status: 'planned', type: { $ne: 'break' }, endTime: { $lt: now.toJSDate() } }, { status: 'skipped' });
  await ScheduleItem.deleteMany({ userId: user._id, status: 'planned', _id: { $nin: activeIds }, endTime: { $gte: now.toJSDate() } });
  const reservedItems = await ScheduleItem.find({ userId: user._id, _id: { $nin: activeIds }, endTime: { $gte: now.toJSDate() } });
  for (const s of active) {
    const endTime = new Date(Math.max(+s.startTime + s.plannedMins * 60000, +now.plus({ minutes: 5 })));
    reservedItems.push({ startTime: s.startTime, endTime, plannedMins: s.plannedMins, type: 'study' });
  }

  const avgFocus = recent.length ? recent.reduce((a, s) => a + s.avgFocusScore, 0) / recent.length : 70;
  const useRL = user.schedulerMode === 'rl' || (user.schedulerMode === 'auto' && doneCount >= RL.minSessions);
  const doneMinsToday = todays.reduce((a, s) => a + (s.actualMins || 0), 0);
  const items = buildSchedule({ user, subjects, now, avgFocus, useRL, doneMinsToday, reservedItems });
  if (items.length) await ScheduleItem.insertMany(items);
  return { items, mode: useRL ? 'rl' : 'heuristic' };
}
