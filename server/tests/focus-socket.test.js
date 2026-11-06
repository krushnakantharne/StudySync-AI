import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { io as connect } from 'socket.io-client';
import { StudySession, FocusLog } from '../src/models.js';
import { initSockets } from '../src/sockets/focusSocket.js';
process.env.JWT_SECRET='socket-test-only';

test('real focus socket transport with isolated persistence stubs', async(t)=>{
  const sid='507f1f77bcf86cd799439011',uid='507f1f77bcf86cd799439012';
  let active=true,fail=false;
  const stored=[];
  t.mock.method(StudySession,'exists',async(filter)=>filter._id===sid&&filter.userId===uid&&(filter.endTime===undefined||active)?{_id:sid}:null);
  t.mock.method(FocusLog,'bulkWrite',async(ops)=>{if(fail)throw new Error('temporary database failure');stored.push(...ops.map((op)=>op.replaceOne.replacement));});
  const server=http.createServer();const io=initSockets(server);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const socket=connect(`http://127.0.0.1:${server.address().port}`,{auth:{token:jwt.sign({id:uid},process.env.JWT_SECRET)},transports:['websocket']});
  t.after(async()=>{socket.disconnect();await new Promise(resolve=>io.close(resolve));});
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
  const send=(m)=>socket.timeout(2000).emitWithAck('focus:update',{sessionId:sid,minuteIndex:0,keystroke:100,appSwitch:100,webcam:null,...m});
  const end=(id=sid)=>socket.timeout(2000).emitWithAck('session:end',id);
  await t.test('rejects invalid readings and foreign session flushes',async()=>{
    assert.equal((await send({keystroke:500})).ok,false);
    assert.equal((await send({minuteIndex:1.5})).ok,false);
    assert.equal((await end('507f1f77bcf86cd799439099')).ok,false);
    assert.equal(stored.length,0);
  });
  await t.test('deduplicates window indexes and acknowledges final persistence',async()=>{
    assert.equal((await send({})).ok,true);
    assert.equal((await send({})).ok,true);
    assert.equal((await end()).ok,true);
    assert.equal(stored.length,1);assert.equal(stored[0].compositeScore,100);
  });
  await t.test('failed flush keeps buffered readings for a successful retry',async()=>{
    await send({minuteIndex:1});fail=true;
    assert.equal((await end()).ok,false);fail=false;
    assert.equal((await end()).ok,true);assert.equal(stored.length,2);
  });
  await t.test('closed sessions reject further focus updates',async()=>{
    active=false;assert.equal((await send({minuteIndex:2})).ok,false);assert.equal(stored.length,2);
  });
});
