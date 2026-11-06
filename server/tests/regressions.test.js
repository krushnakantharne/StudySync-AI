import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { gradeAttempt, publicAttempt } from '../src/services/examResults.js';
import { buildSchedule } from '../src/services/scheduler.js';
import { integer, num } from '../src/middleware/error.js';
import { generateAIQuestions } from '../src/services/aiProvider.js';
import { ExamAttempt } from '../src/models.js';

const attempt = () => ({ questions: [
  { _id: 'a', snapshot: { correctOptionIdx: 0, explanation: 'secret', questionText: 'Q', options: ['a','b','c','d'] } },
  { _id: 'b', snapshot: { correctOptionIdx: 2, explanation: 'secret', questionText: 'R', options: ['a','b','c','d'] } },
] });

test('grading rejects duplicates instead of counting one question twice', () => {
  assert.throws(() => gradeAttempt(attempt(), [{questionId:'a', selectedIdx:0}, {questionId:'a', selectedIdx:0}]), /Duplicate/);
});
test('grading counts each stored question and treats unanswered questions as incorrect', () => {
  const result = gradeAttempt(attempt(), [{questionId:'a', selectedIdx:0}, {questionId:'b', selectedIdx:null}]);
  assert.equal(result.score, 1); assert.equal(result.percentage, 50);
  assert.equal(gradeAttempt(attempt(), []).score, 0);
});
test('grading validates types, IDs and option bounds', () => {
  for (const answers of [{}, [null], [{questionId:'x', selectedIdx:0}], [{questionId:'a', selectedIdx:'0'}], [{questionId:'a', selectedIdx:1.5}], [{questionId:'a', selectedIdx:4}]]) {
    assert.throws(() => gradeAttempt(attempt(), answers));
  }
});
test('pending attempts hide answer keys without modifying the stored questions', () => {
  const doc = attempt();
  const out = publicAttempt(doc);
  assert.equal(out.questions[0].snapshot.correctOptionIdx, undefined);
  assert.equal(out.questions[0].snapshot.explanation, undefined);
  assert.equal(doc.questions[0].snapshot.correctOptionIdx, 0);
  doc.submittedAt = new Date();
  assert.equal(publicAttempt(doc).questions[0].snapshot.correctOptionIdx, 0);
});
test('projection works on real Mongoose documents too', () => {
  const doc = new ExamAttempt({ questions: attempt().questions.map(({_id,...q}) => q) });
  assert.equal(publicAttempt(doc).questions[0].snapshot.correctOptionIdx, undefined);
});
test('numeric validation rejects coercible objects and fractional integer fields', () => {
  for (const v of [null, true, [], {}, '', ' ', Infinity]) assert.throws(() => num(v, 0, 100, 'value'));
  assert.throws(() => integer(1.5, 1, 5, 'rating'));
  assert.equal(num(0, 0, 100, 'minutes'), 0);
});

const now = DateTime.fromISO('2026-10-29T09:00:15', { zone:'Asia/Kolkata' });
const user = { _id:'u', dailyGoalMins:60, maxSessionMins:90, preferredStartHour:9, preferredEndHour:22 };
const topic = (name) => ({ name, difficulty:5, mastery:0.2, nextReview:now.toJSDate() });
const normal = { _id:'n', subjectName:'normal', difficulty:5, topics:[topic('normal')] };
test('exam reviews respect the daily goal even on the last day before an exam', () => {
  const exam = {_id:'e', difficulty:5, examModeActive:true, examDate:now.plus({days:1}).toJSDate(), topics:Array.from({length:10}, (_,i)=>topic('t'+i))};
  const items = buildSchedule({user, subjects:[exam,normal], now, doneMinsToday:30});
  const today = items.filter((i)=>DateTime.fromJSDate(i.startTime).setZone(now.zone).hasSame(now,'day') && i.type!=='break');
  assert.ok(today.reduce((n,i)=>n+i.plannedMins,0)<=30);
});
test('small daily goals produce a plan and nothing starts before the current time', () => {
  const items=buildSchedule({user:{...user,dailyGoalMins:15},subjects:[normal],now});
  assert.ok(items.some((i)=>i.type==='study'));
  assert.ok(items.every((i)=>+i.startTime>=+now));
});
test('regeneration avoids existing reserved sessions and counts them toward the goal', () => {
  const reserved={startTime:now.startOf('hour').toJSDate(),endTime:now.startOf('hour').plus({minutes:30}).toJSDate(),plannedMins:30,type:'study'};
  const items=buildSchedule({user,subjects:[normal],now,reservedItems:[reserved]});
  for(const i of items) assert.ok(+i.startTime>=+reserved.endTime || +i.endTime<=+reserved.startTime);
  const today=items.filter((i)=>DateTime.fromJSDate(i.startTime).setZone(now.zone).hasSame(now,'day')&&i.type!=='break');
  assert.equal(today.reduce((n,i)=>n+i.plannedMins,0),30);
});
test('expired exam mode no longer removes a subject from all future plans', () => {
  const items=buildSchedule({user,subjects:[{...normal,examModeActive:true,examDate:now.minus({days:1}).toJSDate()}],now});
  assert.ok(items.some((i)=>i.type==='study'));
});
test('AI generation rejects malformed output and invalid batch settings cannot create an infinite loop', async (t) => {
  t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify([
    {questionText:'valid',options:['a','b','c','d'],correctOptionIdx:0,topic:'T'},
    {questionText:'bad',options:['a','b','c',{}],correctOptionIdx:0,topic:'T'},
    {questionText:'',options:['a','b','c','d'],correctOptionIdx:0,topic:'T'},
    {questionText:'bad topic',options:['a','b','c','d'],correctOptionIdx:0,topic:'unknown'},
    {questionText:'bad index',options:['a','b','c','d'],correctOptionIdx:null,topic:'T'},
  ])}]}}]})}));
  const oldKey=process.env.GEMINI_API_KEY, oldBatch=process.env.GEMINI_BATCH_SIZE;
  process.env.GEMINI_API_KEY='test-only'; process.env.GEMINI_BATCH_SIZE='-1';
  try {
    const questions=await generateAIQuestions({subjectName:'S',topics:['T'],difficulty:3,count:5});
    assert.equal(questions.length,1); assert.equal(questions[0].questionText,'valid');
  } finally {
    if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;
    if(oldBatch===undefined)delete process.env.GEMINI_BATCH_SIZE;else process.env.GEMINI_BATCH_SIZE=oldBatch;
  }
});
