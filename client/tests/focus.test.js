import test from 'node:test';
import assert from 'node:assert/strict';
function stub(t, name, value) {
  const old = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {value, configurable:true, writable:true});
  t.after(() => { if(old) Object.defineProperty(globalThis,name,old); else delete globalThis[name]; });
}

import { FocusTracker, classifyFace } from '../src/focus.js';

test('face classification handles absence', () => {
  assert.equal(classifyFace([], {videoWidth:320}), 'absent');
});
test('focus tracking flushes once and removes listeners when stopped', async (t) => {
  stub(t, 'document', new EventTarget());
  stub(t, 'window', new EventTarget());
  const readings=[];
  const tracker=new FocusTracker({windowMs:100000,onWindow:async (w)=>readings.push(w)});
  await tracker.start({camera:false});
  document.dispatchEvent(new Event('keydown'));
  await tracker.flush();
  assert.equal(readings[0].keystroke,100);
  assert.equal(readings[0].webcam,null);
  await tracker.stop(); await tracker.stop();
  assert.equal(readings.length,1);
  document.dispatchEvent(new Event('keydown'));
  assert.equal(tracker.keys,false);
});
test('stopping while camera permission is pending stops the late stream', async (t) => {
  stub(t, 'document', new EventTarget());
  stub(t, 'window', new EventTarget());
  let grant;
  const permission = new Promise((resolve)=>{grant=resolve;});
  let stopped=0, played=0;
  stub(t, 'navigator', {mediaDevices:{getUserMedia:()=>permission}});
  const tracker=new FocusTracker({windowMs:100000,onWindow:async()=>{}});
  await tracker.start({camera:true,videoEl:{play:()=>{played++;}}});
  await tracker.stop();
  grant({getTracks:()=>[{stop:()=>{stopped++;}}]});
  await new Promise((resolve)=>setImmediate(resolve));
  assert.equal(stopped,1); assert.equal(played,0); assert.equal(tracker.stream,null);
});

test('corrupt auth storage cannot prevent the app from starting', async (t) => {
  stub(t,'localStorage',{getItem:()=>'{broken',setItem:()=>{},removeItem:()=>{}});
  const {useAuth}=await import('../src/store.js?corrupt');
  assert.equal(useAuth.getState().accessToken,null);
  useAuth.getState().setAuth({accessToken:'a',user:{fullName:'Test'}});
  assert.equal(useAuth.getState().accessToken,'a');
});
test('auth state remains usable when browser storage is disabled', async (t) => {
  stub(t,'localStorage',{getItem:()=>{throw new Error('blocked')},setItem:()=>{throw new Error('blocked')},removeItem:()=>{throw new Error('blocked')}});
  const {useAuth}=await import('../src/store.js?disabled');
  useAuth.getState().setAuth({accessToken:'a'});
  assert.equal(useAuth.getState().accessToken,'a');
  useAuth.getState().logout();assert.equal(useAuth.getState().accessToken,null);
});
