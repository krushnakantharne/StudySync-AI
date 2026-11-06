import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { User, Subject, ScheduleItem, StudySession, ExamAttempt } from '../src/models.js';
process.env.JWT_SECRET='test-access'; process.env.JWT_REFRESH_SECRET='test-refresh';
const {default:app}=await import('../src/app.js');

test('API regression checks with isolated model stubs (no external DB)', async (t) => {
  const user=new User({fullName:'Tester',email:'test@example.com',passwordHash:'unused'});
  t.mock.method(User,'findById',async()=>user);
  const server=app.listen(0,'127.0.0.1');
  await new Promise((resolve)=>server.once('listening',resolve));
  t.after(()=>new Promise((resolve)=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const token=jwt.sign({id:user._id},process.env.JWT_SECRET);
  const request=async(path,method='GET',body)=>{
    const r=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:r.status,data:await r.json()};
  };
  const subj=new Subject({userId:user._id,subjectName:'Algorithms',difficulty:3,topics:[{name:'Trees'}]});
  await t.test('invalid topics and foreign schedule links are rejected',async(t)=>{
    t.mock.method(Subject,'findOne',async()=>subj);
    t.mock.method(ScheduleItem,'findOne',async(filter)=>{assert.equal(String(filter.userId),String(user._id));return null;});
    assert.equal((await request('/sessions/start','POST',{subjectId:subj._id,topicName:'missing',plannedMins:30})).status,400);
    assert.equal((await request('/sessions/start','POST',{subjectId:subj._id,topicName:'Trees',plannedMins:30,scheduleItemId:String(new Subject()._id)})).status,400);
  });
  await t.test('invalid minutes and fractional question counts are rejected',async(t)=>{
    t.mock.method(Subject,'findOne',async()=>subj);
    assert.equal((await request('/sessions/start','POST',{subjectId:subj._id,topicName:'Trees',plannedMins:200})).status,400);
    assert.equal((await request('/exams/generate','POST',{subjectId:subj._id,count:1.5})).status,400);
    assert.equal((await request('/exams/generate','POST',{subjectId:subj._id,topics:['foreign']})).status,400);
  });
  await t.test('all pending-exam read endpoints hide answer keys',async(t)=>{
    const exam=new ExamAttempt({userId:user._id,subjectId:subj._id,source:'BANK',expiresAt:new Date(Date.now()+60000),questions:[{snapshot:{questionText:'Q',options:['a','b','c','d'],correctOptionIdx:0,explanation:'secret'}}]});
    t.mock.method(ExamAttempt,'findOne',async()=>exam);
    t.mock.method(ExamAttempt,'find',()=>({sort:async()=>[exam]}));
    for(const path of ['/exams',`/exams/${exam._id}`]){
      const out=await request(path); assert.equal(out.status,200);
      const item=Array.isArray(out.data)?out.data[0]:out.data;
      assert.equal(item.questions[0].snapshot.correctOptionIdx,undefined);
      assert.equal(item.questions[0].snapshot.explanation,undefined);
    }
  });
  await t.test('duplicate answers fail before a database write; valid scores use an atomic submit filter',async(t)=>{
    const exam=new ExamAttempt({userId:user._id,subjectId:subj._id,source:'BANK',expiresAt:new Date(Date.now()+60000),questions:[{snapshot:{questionText:'Q',options:['a','b','c','d'],correctOptionIdx:0}}]});
    t.mock.method(ExamAttempt,'findOne',async()=>exam);
    let writes=0;
    t.mock.method(ExamAttempt,'findOneAndUpdate',async(filter,update)=>{
      writes++;assert.equal(filter.submittedAt,null);assert.ok(filter.expiresAt.$gte instanceof Date);
      return new ExamAttempt({...exam.toObject(),...update.$set});
    });
    const answer={questionId:String(exam.questions[0]._id),selectedIdx:0};
    assert.equal((await request(`/exams/${exam._id}/submit`,'POST',{answers:[answer,answer]})).status,400);
    assert.equal(writes,0);
    const out=await request(`/exams/${exam._id}/submit`,'POST',{answers:[answer]});
    assert.equal(out.status,200);assert.equal(out.data.score,1);assert.equal(out.data.percentage,100);assert.equal(writes,1);
  });
  await t.test('bad settings and query bounds return useful 400 errors',async()=>{
    assert.equal((await request('/auth/me','PUT',{preferredStartHour:9.5})).status,400);
    assert.equal((await request('/auth/me','PUT',{timezone:{}})).status,400);
    assert.equal((await request('/auth/register','POST',{fullName:123,email:'x',password:'abcdef'})).status,400);
    assert.equal((await request('/schedule?from=invalid')).status,400);
    assert.equal((await request('/analytics/focus-trend?days=-4')).status,400);
    assert.equal((await request('/sessions?limit=-1')).status,400);
  });
  await t.test('malformed topic arrays and boolean strings are rejected',async(t)=>{
    t.mock.method(Subject,'findOne',async()=>subj);
    assert.equal((await request('/subjects','POST',{subjectName:'A',difficulty:3,topics:'bad'})).status,400);
    assert.equal((await request(`/subjects/${subj._id}/topics`,'POST',{names:'bad'})).status,400);
    assert.equal((await request(`/subjects/${subj._id}/exam-mode`,'POST',{active:'false'})).status,400);
  });
  await t.test('session finalization validates time before changing mastery',async(t)=>{
    const find=t.mock.method(StudySession,'findOne',()=>{throw new Error('Must not touch session for malformed input');});
    assert.equal((await request(`/sessions/${new Subject()._id}/end`,'POST',{selfRating:4,actualMins:-10,completed:true})).status,400);
    assert.equal(find.mock.callCount(),0);
  });
});
