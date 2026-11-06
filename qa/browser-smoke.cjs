const {chromium}=require('playwright');
const assert=require('node:assert/strict');
let vite,socketServer;
(async()=>{
 const {spawn}=require('node:child_process');
 const ready=(p,word)=>new Promise((resolve,reject)=>{p.stdout.on('data',d=>{if(d.toString().includes(word))resolve()});p.stderr.on('data',d=>process.stderr.write(d));p.once('exit',c=>reject(new Error('Server exited '+c)));});
 vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{cwd:__dirname+'/../client',stdio:['ignore','pipe','pipe']});await ready(vite,'ready');
 socketServer=spawn(process.execPath,[__dirname+'/browser-socket.mjs'],{stdio:['ignore','pipe','pipe']});await ready(socketServer,'ready');
 const browser=await chromium.launch({headless:true}); const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const user={_id:'u',fullName:'Test Student',timezone:'Asia/Kolkata',dailyGoalMins:60,maxSessionMins:90,preferredStartHour:9,preferredEndHour:22,schedulerMode:'auto'};
 const subject={_id:'s',subjectName:'Algorithms',difficulty:3,topics:[{_id:'t',name:'Trees',mastery:0.25}],examDate:null};
 let authRefreshes=0,meCalls=0,finishBody;
 await page.route('**/api/**',async route=>{
  const req=route.request(),p=new URL(req.url()).pathname.replace('/api','');let data={};
  if(p==='/auth/refresh'){authRefreshes++;data={accessToken:'new-token'};}
  else if(p==='/auth/me'){meCalls++;if(meCalls===1)return route.fulfill({status:401,json:{message:'expired'}});data=user;}
  else if(p==='/subjects')data=[subject];
  else if(p==='/surveys')data=[{type:'pre',score:5}];
  else if(p==='/schedule')data=[];
  else if(p==='/analytics/summary')data={streak:0,totalSessions:0,todayMins:0,avgFocus:0,productivity:0};
  else if(p==='/analytics/readiness')data=[];
  else if(p==='/analytics/focus-trend')data={series:[],insights:[],overall:0};
  else if(p==='/exams/generate')data={_id:'exam1',expiresAt:new Date(Date.now()+60000).toISOString(),questions:[{_id:'q',snapshot:{questionText:'Which is a tree?',options:['Oak','Sky','Sea','Rock']}}]};
  else if(p==='/exams/exam1/submit')data={score:1,percentage:100,submittedAt:new Date().toISOString(),questions:[{_id:'q',selectedIdx:0,snapshot:{questionText:'Which is a tree?',options:['Oak','Sky','Sea','Rock'],correctOptionIdx:0,explanation:'Oak is a tree.'}}]};
  else if(p==='/sessions/start')data={_id:'session1'};
  else if(p==='/sessions/session1/end'){finishBody=req.postDataJSON();data={avgFocus:100,actualMins:0.2,mastery:{before:0.25,after:0.5},reward:0.1};}
  return route.fulfill({status:p==='/exams/generate'?201:200,json:data});
 });
 await page.goto('http://127.0.0.1:5173');
 await page.evaluate(()=>localStorage.setItem('auth','broken-json'));
 await page.reload();await page.getByRole('heading',{name:'Welcome back'}).waitFor();console.log('PASS corrupt saved auth does not crash');
 await page.evaluate(u=>localStorage.setItem('auth',JSON.stringify({user:u,accessToken:'expired',refreshToken:'refresh'})),user);
 await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Take Weekly Exam'}).waitFor();console.log('PASS dashboard exam button renders');
 // Exercise the real Axios interceptor through a protected auth endpoint.
 await page.evaluate(async()=>{const {default:api}=await import('/src/api.js');await api.get('/auth/me');});
 assert.equal(authRefreshes,1);assert.equal(meCalls,2);console.log('PASS /auth/me refreshes and retries expired access token');
 await page.goto('http://127.0.0.1:5173/weekly-exam');
 await page.getByRole('button',{name:'Generate Exam'}).click();await page.getByText('Which is a tree?').waitFor();await page.getByText(/Time left:/).waitFor();
 await page.getByRole('radio').first().check();await page.getByRole('button',{name:'Submit Exam',exact:true}).click();await page.getByText('Score: 1 / 1').waitFor();await page.getByRole('button',{name:'Take another exam'}).click();await page.getByRole('button',{name:'Generate Exam'}).waitFor();console.log('PASS exam generation, countdown, submit, result and reset');
 await page.goto('http://127.0.0.1:5173/study');await page.getByText('Demo speed:',{exact:false}).click();await page.getByRole('button',{name:'Start session',exact:true}).click();
 await page.getByRole('button',{name:'Finish session'}).waitFor();await page.keyboard.press('A');await page.waitForTimeout(10500);await page.getByRole('img',{name:'Focus score 100'}).waitFor();await page.getByRole('button',{name:'Finish session'}).click();await page.getByRole('dialog').getByRole('button',{name:'4',exact:true}).click();await page.getByRole('heading',{name:'Session complete'}).waitFor();assert.ok(finishBody.actualMins>0);assert.equal(finishBody.completed,true);console.log('PASS live focus socket, finish acknowledgement and session summary');
 assert.deepEqual(errors,[]);console.log('PASS no uncaught browser errors');await browser.close();vite.kill();socketServer.kill();
})().catch(e=>{console.error(e);vite?.kill();socketServer?.kill();process.exit(1)});
