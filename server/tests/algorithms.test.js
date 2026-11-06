import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { updateMastery } from '../src/services/bkt.js';
import { fuse } from '../src/services/focus.js';
import { applyReview, proximityFactor, dueReviews } from '../src/services/spacedRep.js';
import { topicPriority, rankTopics } from '../src/services/priority.js';
import { buildSchedule } from '../src/services/scheduler.js';
import * as rl from '../src/services/rl.js';

const DAY = 864e5;
const mkTopic = (name, d = 3, m = 0.25, extra = {}) => ({ name, difficulty: d, mastery: m, lastStudied: null, studyCount: 0, easeFactor: 2.5, intervalDays: 1, repetitions: 0, nextReview: null, ...extra });
const mkSubject = (id, diff, topics, extra = {}) => ({ _id: id, subjectName: id, difficulty: diff, examDate: null, examModeActive: false, topics, ...extra });
const user = () => ({ _id: 'u1', timezone: 'Asia/Kolkata', dailyGoalMins: 180, maxSessionMins: 90, preferredStartHour: 9, preferredEndHour: 22, rlWeights: [0, 0.35, 0.25, 0.25, 0.1, 0.15], rlEpisodes: 0 });

test('BKT: correct answers raise mastery, wrong answers lower it', () => {
  assert.ok(updateMastery(0.3, true) > 0.3);
  assert.ok(updateMastery(0.6, false) < 0.6 + 0.15);
  assert.ok(updateMastery(0.99, true) <= 0.99);
});

test('Focus fusion matches 0.40/0.35/0.25 and renormalises without webcam', () => {
  assert.equal(fuse({ keystroke: 100, appSwitch: 100, webcam: 100 }).composite, 100);
  assert.equal(fuse({ keystroke: 100, appSwitch: 0, webcam: 0 }).composite, 40);
  assert.equal(fuse({ keystroke: 100, appSwitch: 100, webcam: null }).composite, 100);
  const f = fuse({ keystroke: 0, appSwitch: 100, webcam: 0 });
  assert.equal(f.dominantSignal, 'appSwitch');
});

test('SM-2 variant: interval = prev * EF * P, shrinks near the exam, capped before exam', () => {
  assert.equal(proximityFactor(28), 1);
  assert.equal(proximityFactor(7), 0.5);
  const far = mkTopic('a', 3, 0.5, { intervalDays: 4 });
  applyReview(far, 5, new Date(Date.now() + 60 * DAY), new Date());
  assert.ok(far.intervalDays >= 10, `far interval ${far.intervalDays}`);
  const near = mkTopic('b', 3, 0.5, { intervalDays: 4 });
  applyReview(near, 5, new Date(Date.now() + 3 * DAY), new Date());
  assert.ok(near.intervalDays <= 3);
  assert.ok(near.nextReview < new Date(Date.now() + 3 * DAY));
  const fail = mkTopic('c', 3, 0.5, { intervalDays: 10, repetitions: 3 });
  applyReview(fail, 1, new Date(Date.now() + 60 * DAY), new Date());
  assert.equal(fail.intervalDays, 1);
  assert.equal(fail.repetitions, 0);
  assert.ok(fail.easeFactor >= 1.3);
});

test('Priority: weak, neglected, exam-near topics rank first', () => {
  const now = new Date();
  const s = mkSubject('S', 3, [mkTopic('weak', 3, 0.1), mkTopic('strong', 3, 0.9, { lastStudied: now })]);
  assert.equal(rankTopics([s], now)[0].topic.name, 'weak');
  const withExam = { ...s, examDate: new Date(now.getTime() + 2 * DAY) };
  assert.ok(topicPriority(withExam, s.topics[0], now) > topicPriority(s, s.topics[0], now));
});

test('Exam reviews are load-balanced and never scheduled after the exam', () => {
  const tz = 'Asia/Kolkata';
  const now = DateTime.now().setZone(tz);
  const topics = Array.from({ length: 12 }, (_, i) => mkTopic('t' + i, 3, 0.2 + i * 0.05, { nextReview: now.toJSDate() }));
  const s = mkSubject('E', 4, topics, { examModeActive: true, examDate: now.plus({ days: 5 }).toJSDate() });
  const u = user();
  const m = dueReviews([s], u, now, 70);
  const cap = Math.floor((u.dailyGoalMins / 30) * (0.5 + 70 / 200));
  let total = 0;
  for (const [day, list] of m) {
    total += list.length;
    if (list.length) assert.ok(day < now.plus({ days: 5 }).toISODate(), 'review on/after exam day: ' + day);
    if (day < now.plus({ days: 4 }).toISODate()) assert.ok(list.length <= cap);
  }
  assert.equal(total, 12);
});

test('Schedule: sessions <= 90 min, daily goal respected, no overlaps, inside preferred hours, breaks present', () => {
  const tz = 'Asia/Kolkata';
  const now = DateTime.now().setZone(tz).set({ hour: 7, minute: 0 });
  const subs = [
    mkSubject('A', 5, [mkTopic('a1', 5), mkTopic('a2', 5), mkTopic('a3', 4)], { examDate: new Date(Date.now() + 9 * DAY) }),
    mkSubject('B', 2, [mkTopic('b1', 2), mkTopic('b2', 2)]),
    mkSubject('C', 3, [mkTopic('c1', 3), mkTopic('c2', 3)]),
  ];
  const u = user();
  for (const useRL of [false, true]) {
    const items = buildSchedule({ user: u, subjects: subs, now, useRL });
    assert.ok(items.length > 0);
    const perDay = {};
    let prevEnd = 0;
    for (const it of items) {
      assert.ok(it.plannedMins <= 90);
      assert.ok(+it.startTime >= prevEnd, 'overlap');
      prevEnd = +it.endTime;
      const st = DateTime.fromJSDate(it.startTime).setZone(tz), en = DateTime.fromJSDate(it.endTime).setZone(tz);
      assert.ok(st.hour >= 9 && (en.hour < 22 || (en.hour === 22 && en.minute === 0)));
      if (it.type !== 'break') perDay[it.weekStart + it.date] = (perDay[it.weekStart + it.date] || 0) + it.plannedMins;
    }
    for (const v of Object.values(perDay)) assert.ok(v <= u.dailyGoalMins);
    assert.ok(items.some((i) => i.type === 'break'));
    assert.ok(new Set(items.filter((i) => i.type === 'study').map((i) => String(i.subjectId))).size >= 2, 'subjects should rotate');
  }
});

test('Schedule: exam-mode subject yields review items, not study items', () => {
  const now = DateTime.now().setZone('Asia/Kolkata').set({ hour: 7, minute: 0 });
  const e = mkSubject('E', 4, [mkTopic('e1', 4, 0.3, { nextReview: now.toJSDate() }), mkTopic('e2', 4, 0.3, { nextReview: now.toJSDate() })], { examModeActive: true, examDate: now.plus({ days: 8 }).toJSDate() });
  const items = buildSchedule({ user: user(), subjects: [e], now });
  assert.ok(items.some((i) => i.type === 'review'));
  assert.ok(!items.some((i) => i.type === 'study'));
});

test('RL: weights move toward rewarded features; reward follows Table 3.7', () => {
  const u = user();
  const now = new Date();
  const s = mkSubject('S', 4, [mkTopic('x', 4, 0.2)], { examDate: new Date(Date.now() + 5 * DAY) });
  const o = mkSubject('O', 3, [mkTopic('y', 3, 0.5, { lastStudied: new Date(Date.now() - 14 * DAY) })]);
  const phi = rl.features(s, now);
  const r = rl.computeReward({ subject: s, others: [o], preMastery: 0.2, completed: true, now });
  assert.ok(r > 0 && r < 1);
  const before = rl.q(Array.from(u.rlWeights), phi);
  for (let i = 0; i < 50; i++) rl.update(u, phi, 1, [s, o], now);
  assert.ok(rl.q(Array.from(u.rlWeights), phi) > before);
  assert.equal(u.rlEpisodes, 50);
  assert.ok(rl.chooseSubject(u, [s, o], now, { explore: false }));
});
