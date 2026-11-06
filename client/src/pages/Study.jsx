import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import api, { SOCKET_URL, errMsg } from '../api';
import { useAuth } from '../store';
import { FocusTracker } from '../focus';
import { Modal, Notice, Page } from '../ui.jsx';

const tone = (v) => (v == null ? '#9AA6B6' : v < 40 ? '#C94F6D' : v < 70 ? '#E8A33D' : '#0B7A75');
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function Ring({ value }) {
  const R = 84, C = 2 * Math.PI * R, v = value ?? 0;
  return (
    <svg viewBox="0 0 200 200" className="mx-auto w-56 md:w-64" role="img" aria-label={`Focus score ${value ?? 'not yet measured'}`}>
      <circle cx="100" cy="100" r={R} fill="none" stroke="#D7DEE7" strokeWidth="14" />
      <circle cx="100" cy="100" r={R} fill="none" stroke={tone(value)} strokeWidth="14" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C * (1 - v / 100)} transform="rotate(-90 100 100)" style={{ transition: 'stroke-dashoffset .6s, stroke .6s' }} />
      <text x="100" y="104" textAnchor="middle" className="font-display" fontSize="52" fontWeight="700" fill="#16243B">{value == null ? '–' : Math.round(value)}</text>
      <text x="100" y="130" textAnchor="middle" fontSize="13" fill="#16243B" opacity=".6">{value == null ? 'waiting for first reading' : 'focus score'}</text>
    </svg>
  );
}

export default function Study() {
  const nav = useNavigate();
  const pre = useLocation().state;
  const videoRef = useRef(null), tracker = useRef(null), socket = useRef(null);
  const [subjects, setSubjects] = useState([]);
  const [form, setForm] = useState({ subjectId: pre?.subjectId || '', topicName: pre?.topicName || '', plannedMins: pre?.plannedMins || 45 });
  const [phase, setPhase] = useState('setup'); // setup | running | rating | done
  const [sid, setSid] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [scores, setScores] = useState([]);
  const [cam, setCam] = useState(false);
  const [activityOn, setActivityOn] = useState(false);
  const [activityPaused, setActivityPaused] = useState(false);
  const [activityTotals, setActivityTotals] = useState(null);
  const [activityBusy, setActivityBusy] = useState(false);
  const [camStatus, setCamStatus] = useState({ s: 'off', label: '' });
  const [fast, setFast] = useState(false);
  const [err, setErr] = useState('');
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const finishing = useRef(false);
  const startedAt = useRef(null);
  const finishedSeconds = useRef(null);
  const [summary, setSummary] = useState(null);
  const live = scores.length ? scores[scores.length - 1] : null;

  useEffect(() => {
    api.get('/subjects').then(({ data }) => {
      setSubjects(data);
      setForm((f) => (f.subjectId || !data[0] ? f : { ...f, subjectId: data[0]._id, topicName: data[0].topics[0]?.name || '' }));
    }).catch((e) => setErr(errMsg(e)));
    return () => { tracker.current?.stop().catch(() => {}); socket.current?.disconnect(); };
  }, []);

  useEffect(() => {
    if (phase !== 'running' || !sid || tracker.current) return;
    const sock = socket.current;
    const focus = new FocusTracker({
      windowMs: fast ? 10000 : 60000,
      onWindow: async (w) => {
        const result = await sock.timeout(8000).emitWithAck('focus:update', { sessionId: sid, ...w });
        if (!result.ok) throw new Error(result.message);
      },
      onCamStatus: (s, label) => setCamStatus((c) => ({ s, label: label || c.label })),
    });
    tracker.current = focus;
    focus.start({ camera: cam, videoEl: videoRef.current }).catch((e) => setErr(errMsg(e)));
  }, [phase, sid]);

  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => { if (phase === 'running' && elapsed >= form.plannedMins * 60) finish(); }, [elapsed]); // eslint-disable-line

  const subject = subjects.find((s) => s._id === form.subjectId);

  async function start() {
    if (starting) return;
    setStarting(true); setErr('');
    try {
      if (activityOn) await api.put('/activity/consent', { enabled: true });
      const { data } = await api.post('/sessions/start', { ...form, activityTracking: activityOn, plannedMins: +form.plannedMins, scheduleItemId: pre?.scheduleItemId });
      setSid(data._id);
      const sock = io(SOCKET_URL, { auth: (cb) => cb({ token: useAuth.getState().accessToken }) });
      sock.on('connect_error', async (e) => {
        if (e.message === 'unauthorized') {
          try { await api.get('/auth/me'); sock.connect(); } catch (error) { setErr(errMsg(error)); }
        } else setErr('Focus connection unavailable. Check that the server is running.');
      });
      sock.on('focus:score', (m) => setScores((s) => [...s, m.composite]));
      socket.current = sock;
      startedAt.current = Date.now();
      setElapsed(0); setScores([]); setPhase('running');
    } catch (e) { setErr(errMsg(e)); setPhase('setup'); } finally { setStarting(false); }
  }

  async function finish() {
    if (finishing.current) return;
    finishing.current = true;
    finishedSeconds.current = Math.floor((Date.now() - startedAt.current) / 1000);
    try {
      await tracker.current?.stop();
      const result = await socket.current.timeout(8000).emitWithAck('session:end', sid);
      if (!result.ok) throw new Error(result.message);
    } catch (e) { setErr(`Focus data could not be fully saved: ${errMsg(e)}`); }
    setPhase('rating');
  }

  async function submit(rating) {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { data } = await api.post(`/sessions/${sid}/end`, {
        selfRating: rating, completed: fast || finishedSeconds.current >= form.plannedMins * 60 * 0.8, actualMins: Math.round(finishedSeconds.current / 60 * 100) / 100,
      });
      setSummary(data);
      if (activityOn) { try { const activity = await api.get('/activity/summary', { params: { sessionId: sid } }); setActivityTotals(activity.data); } catch (e) { setErr(errMsg(e)); } }
      setPhase('done'); socket.current?.disconnect();
    } catch (e) { setErr(errMsg(e)); } finally { setSubmitting(false); }
  }

  async function toggleActivityPause() {
    setActivityBusy(true); setErr('');
    try { const { data } = await api.put(`/activity/sessions/${sid}/pause`, { paused: !activityPaused }); setActivityPaused(data.paused); } catch (e) { setErr(errMsg(e)); } finally { setActivityBusy(false); }
  }

  const left = Math.max(0, form.plannedMins * 60 - elapsed);

  return (
    <Page title="Study session" sub="Your focus score updates live from typing, tab switches and (optionally) your camera.">
      <Notice>{err}</Notice>
      {phase === 'setup' && (
        <div className="max-w-xl space-y-4">
          {!subjects.length ? <p>Add a subject first (Subjects page).</p> : (
            <>
              <div><label className="label" htmlFor="sj">Subject</label>
                <select id="sj" className="input" value={form.subjectId} onChange={(e) => { const s = subjects.find((x) => x._id === e.target.value); setForm({ ...form, subjectId: e.target.value, topicName: s?.topics[0]?.name || '' }); }}>
                  {subjects.map((s) => <option key={s._id} value={s._id}>{s.subjectName}</option>)}
                </select></div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2"><label className="label" htmlFor="tp">Topic</label>
                  <select id="tp" className="input" value={form.topicName} onChange={(e) => setForm({ ...form, topicName: e.target.value })}>
                    {subject?.topics.map((t) => <option key={t._id}>{t.name}</option>)}
                  </select></div>
                <div><label className="label" htmlFor="pm">Minutes</label><input id="pm" type="number" min={5} max={90} className="input" value={form.plannedMins} onChange={(e) => setForm({ ...form, plannedMins: e.target.value })} /></div>
              </div>
              <label className="flex items-start gap-3 rounded-xl bg-white p-4 text-sm">
                <input type="checkbox" className="mt-1 accent-teal" checked={cam} onChange={(e) => setCam(e.target.checked)} />
                <span><b>Use webcam focus detection (optional).</b><br />Video is analysed inside your browser. No images or video ever leave your device.</span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-line bg-white p-4 text-sm"><input type="checkbox" className="mt-1 accent-teal" checked={activityOn} onChange={(e) => setActivityOn(e.target.checked)} /><span><b>Enable browser activity tracking for this session (optional).</b><br />I consent to the extension recording bare domains, category, and idle time during this session. No URLs, page contents, passwords, or keystrokes. Install/pair the extension in Settings first. You can pause at any time. The camera is not required.</span></label>
              <label className="flex items-center gap-3 text-sm text-ink/70"><input type="checkbox" className="accent-teal" checked={fast} onChange={(e) => setFast(e.target.checked)} /> Demo speed: update focus every 10 seconds instead of every minute</label>
              <button className="btn" onClick={start} disabled={starting || !form.topicName}>{starting ? 'Starting…' : 'Start session'}</button>
              <p className="text-xs text-ink/50">Privacy: we record only whether you typed (never which keys), how many times you left this tab, and a face-present score.</p>
            </>
          )}
        </div>
      )}
      {phase !== 'setup' && (
        <div className="grid items-center gap-8 md:grid-cols-2">
          <div>
            <Ring value={live} />
            <div className="mx-auto mt-2 h-16 max-w-xs">
              <ResponsiveContainer><LineChart data={scores.map((v, i) => ({ i, v }))}><YAxis hide domain={[0, 100]} /><Line type="monotone" dataKey="v" stroke={tone(live)} strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>
            </div>
          </div>
          <div className="space-y-4">
            <p className="text-sm text-ink/60">{subject?.subjectName}</p>
            <h2 className="text-3xl font-bold">{form.topicName}</h2>
            <p className="font-display text-6xl font-bold tabular-nums">{mmss(left)}</p>
            <p className="text-sm text-ink/60">Camera: {camStatus.s === 'off' && !cam ? 'off' : camStatus.s === 'on' ? `on${camStatus.label ? ` · ${camStatus.label}` : ''}` : camStatus.s === 'loading' ? 'loading model…' : camStatus.s === 'error' ? 'unavailable, using keyboard and tab signals' : 'off'}</p>
            <video ref={videoRef} muted playsInline className={`w-40 rounded-lg ${cam && phase === 'running' ? '' : 'hidden'}`} />
            {phase === 'running' && <div className="flex flex-wrap gap-2">{activityOn && <button className="btn-ghost" disabled={activityBusy} onClick={toggleActivityPause}>{activityBusy ? 'Updating…' : activityPaused ? 'Resume browser tracking' : 'Pause browser tracking'}</button>}<button className="btn" onClick={finish}>Finish session</button></div>}
            {phase === 'running' && activityOn && <p className="text-xs text-ink/60">Browser tracking: {activityPaused ? 'paused' : 'enabled for this session'}. Extension must be paired and running for activity to be recorded.</p>}
          </div>
        </div>
      )}
      {phase === 'rating' && (
        <Modal title="How well did you understand this?">
          <Notice>{err}</Notice>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => <button key={n} className="btn-ghost !py-4 font-display text-xl" disabled={submitting} onClick={() => submit(n)}>{n}</button>)}
          </div>
          <div className="mt-2 flex justify-between text-xs text-ink/60"><span>Lost</span><span>Solid</span></div>
        </Modal>
      )}
      {phase === 'done' && summary && (
        <Modal title="Session complete">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt>Time studied</dt><dd className="font-semibold">{summary.actualMins} min</dd></div>
            <div className="flex justify-between"><dt>Average focus</dt><dd className="font-semibold">{summary.avgFocus ?? 'not measured'}</dd></div>
            {summary.mastery.after != null && <div className="flex justify-between"><dt>Topic mastery</dt><dd className="font-semibold">{Math.round(summary.mastery.before * 100)}% → {Math.round(summary.mastery.after * 100)}%</dd></div>}
            {summary.nextReview && <div className="flex justify-between"><dt>Next review</dt><dd className="font-semibold">{new Date(summary.nextReview).toLocaleDateString()}</dd></div>}
            {activityTotals && <><div className="mt-3 border-t border-line pt-3 font-semibold">Browser activity report</div><div className="flex justify-between"><dt>Verified study / coding / reference</dt><dd>{activityTotals.studyMinutes} min</dd></div><div className="flex justify-between"><dt>Distractions</dt><dd>{activityTotals.distractionMinutes} min</dd></div><div className="flex justify-between"><dt>Idle / unknown</dt><dd>{activityTotals.idleMinutes} / {activityTotals.unknownMinutes} min</dd></div><div className="flex justify-between"><dt>Activity-aware productivity</dt><dd className="font-bold">{activityTotals.score == null ? 'No verified events' : `${activityTotals.score}%`}</dd></div></>}
            {summary.reward != null && <div className="flex justify-between"><dt>Planner reward</dt><dd className="font-semibold">{summary.reward}</dd></div>}
          </dl>
          <button className="btn mt-5 w-full" onClick={() => nav('/')}>Back to dashboard</button>
        </Modal>
      )}
    </Page>
  );
}
