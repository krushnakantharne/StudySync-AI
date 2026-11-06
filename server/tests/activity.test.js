import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, normalDomain, durationTotals, weightedScore, validActivityInterval, intervalsOverlap } from '../src/services/activityCore.js';

test('unknown sites and YouTube are never silently marked as study', () => {
  assert.equal(classify('youtube.com'), 'Unknown');
  assert.equal(classify('www.youtube.com'), 'Unknown');
  assert.equal(classify('random.example.com'), 'Unknown');
  assert.equal(classify(null), 'Unknown');
});
test('known defaults and user overrides use domain-boundary matching', () => {
  assert.equal(classify('developer.mozilla.org'), 'Reference');
  assert.equal(classify('github.com'), 'Coding');
  assert.equal(classify('sub.github.com'), 'Coding');
  assert.equal(classify('fakegithub.com'), 'Unknown');
  assert.equal(classify('youtube.com', [{ domain: 'youtube.com', category: 'Study' }]), 'Study');
  assert.equal(classify('docs.github.com', [{ domain: 'github.com', category: 'Reference' }]), 'Reference');
});
test('domain normalization rejects URLs, private page content, whitespace', () => {
  assert.equal(normalDomain('WWW.YouTube.COM'), 'youtube.com');
  assert.equal(normalDomain('https://youtube.com/watch?v=1'), null);
  assert.equal(normalDomain('youtube.com/path'), null);
  assert.equal(normalDomain('localhost'), null);
  assert.equal(normalDomain('foo..com'), null);
});
test('durations never credit unknown, idle or gaming as verified study', () => {
  const origin = new Date('2026-01-01T00:00:00.000Z').getTime();
  const log = (category, start, end) => ({ category, from: new Date(origin + start), to: new Date(origin + end) });
  const result = durationTotals([log('Study', 0, 30_000), log('Coding', 30_000, 60_000), log('Entertainment', 60_000, 90_000), log('Idle', 90_000, 120_000), log('Unknown', 120_000, 150_000)]);
  assert.equal(result.studyMinutes, 1);
  assert.equal(result.distractionMinutes, 0.5);
  assert.equal(result.idleMinutes, 0.5);
  assert.equal(result.unknownMinutes, 0.5);
  assert.equal(result.totalMinutes, 2.5);
});
test('weighted score omits missing quiz instead of assuming a score, webcam not used', () => {
  assert.equal(weightedScore({ activity: 100, mastery: 100, review: 100, quiz: 100, topicCompletion: 100 }), 100);
  assert.equal(weightedScore({ activity: 0, mastery: 0, review: 0, quiz: 0, topicCompletion: 0 }), 0);
  assert.equal(weightedScore({ activity: 50 }), 50);
  assert.equal(weightedScore({}), null);
  assert.equal(weightedScore({ activity: 75, quiz: null }), 75);
});

test('interval validation rejects stale, future, zero-length, oversized events', () => {
  const now = Date.parse('2026-11-04T12:00:00.000Z');
  const iso = (ms) => new Date(ms).toISOString();
  assert.equal(validActivityInterval(iso(now - 30_000), iso(now), now), true);
  assert.equal(validActivityInterval(iso(now - 121_000), iso(now - 120_000), now), false);
  assert.equal(validActivityInterval(iso(now), iso(now + 10_000), now), false);
  assert.equal(validActivityInterval(iso(now - 80_000), iso(now), now), false);
  assert.equal(validActivityInterval(iso(now), iso(now), now), false);
  assert.equal(intervalsOverlap(0, 20, 10, 30), true);
  assert.equal(intervalsOverlap(0, 20, 20, 30), false);
});
