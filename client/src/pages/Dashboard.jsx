import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useAuth } from '../store';
import { Empty, fmtTime, Meter, Modal, Notice, Page, Panel, startOfToday, useLoad } from '../ui.jsx';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

export default function Dashboard() {
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [score, setScore] = useState(5);
  const sum = useLoad(() => api.get('/analytics/summary'));
  const today = useLoad(() => {
    const from = startOfToday(); const to = new Date(from.getTime() + 8 * 864e5);
    return api.get('/schedule', { params: { from: from.toISOString(), to: to.toISOString() } });
  });
  const ready = useLoad(() => api.get('/analytics/readiness'));
  const focus = useLoad(() => api.get('/analytics/focus-trend'));
  const surveys = useLoad(() => api.get('/surveys'));
  const activity = useLoad(() => api.get('/activity/summary'));
  const needsPre = surveys.data && !surveys.data.some((s) => s.type === 'pre');

  async function generate() {
    setBusy(true); setErr(''); setOk('');
    try { const r = await api.post('/schedule/generate'); await today.reload(); setOk(r.data.count ? `Plan ready: ${r.data.count} blocks planned for the next 7 days (${r.data.mode === 'rl' ? 'AI agent' : 'priority ranker'}). See the Schedule page for the full week.` : 'No blocks could be planned. Add subjects with topics, or check your study hours in Settings.'); } catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  }
  async function savePre() { try { await api.post('/surveys', { type: 'pre', score }); surveys.reload(); } catch (e) { setErr(errMsg(e)); } }

  const s = sum.data;
  const all = (today.data || []).filter((i) => i.type !== 'break');
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  const items = all.filter((i) => sameDay(i.startTime, new Date()));
  const upcoming = all.filter((i) => i.status === 'planned' && new Date(i.startTime) > new Date() && !sameDay(i.startTime, new Date())).slice(0, 4);
  const stats = s ? [['Day streak', s.streak], ['Focus, 30 days', s.avgFocus ?? '–'], ['Sessions completed', `${s.completionRate}%`], ['Productivity this week', s.productivity ?? '–']] : [];

  return (
    <Page title={`${greeting()}, ${user?.fullName?.split(' ')[0] || 'there'}`} sub="Here is what to study today."
      action={<button className="btn" onClick={generate} disabled={busy}>{busy ? 'Planning…' : 'Generate this week’s plan'}</button>}>
      <div className="hero-banner mb-7 rounded-3xl p-6 shadow-xl shadow-blue-900/10 md:p-8"><div className="relative z-10 max-w-xl"><p className="text-[11px] font-bold uppercase tracking-[.2em] text-sky-200">TODAY'S STUDY MISSION</p><h2 className="mt-2 text-2xl font-extrabold md:text-3xl">Build consistency. See your progress.</h2><p className="mt-3 text-sm leading-relaxed text-blue-100/90">Your adaptive planner, focused sessions, and practice exams all work together to keep you moving forward.</p><div className="mt-5 flex flex-wrap gap-2"><button className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#2746a2] hover:bg-blue-100" onClick={() => nav('/study')}>Start focusing</button><button className="rounded-xl border border-white/30 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10" onClick={() => nav('/analytics')}>View progress</button></div></div></div>
      <Notice>{err || sum.error || today.error || ready.error || focus.error || surveys.error || activity.error}</Notice><Notice tone="teal">{ok}</Notice>
      {s && (
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-ink/50">{k}</p>
              <p className="mt-3 font-display text-3xl font-extrabold">{v}</p>
            </div>
          ))}
        </div>
      )}
      {activity.data?.trackedEvents > 0 && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-5"><div><p className="text-xs font-bold uppercase tracking-wide text-ink/50">ACTIVITY-AWARE SCORE</p><p className="mt-1 text-sm text-ink/70">Verified {activity.data.studyMinutes} min · Distractions {activity.data.distractionMinutes} min · Idle {activity.data.idleMinutes} min</p></div><p className="font-display text-3xl font-extrabold text-teal">{activity.data.score ?? '—'}%</p></div>}
      <div className="grid gap-6 md:grid-cols-5">
        <Panel title="Today’s plan" className="md:col-span-3">
          {!items.length ? (
            <div>
              <Empty>Nothing left to study today.</Empty>
              {upcoming.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-sm font-semibold text-ink/70">Up next</p>
                  <ul className="divide-y divide-line">
                    {upcoming.map((i) => (
                      <li key={i._id} className="flex items-center justify-between gap-3 py-2.5">
                        <div><p className="font-semibold">{i.topicName}</p><p className="text-sm text-ink/60">{i.subjectId?.subjectName} · {new Date(i.startTime).toLocaleDateString([], { weekday: 'short' })} {fmtTime(i.startTime)} · {i.plannedMins} min</p></div>
                        <button className="btn-ghost" onClick={() => nav('/study', { state: { subjectId: i.subjectId?._id, topicName: i.topicName, plannedMins: i.plannedMins, scheduleItemId: i._id } })}>Start</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((i) => (
                <li key={i._id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{i.topicName}</p>
                    <p className="text-sm text-ink/60">{i.subjectId?.subjectName} · {fmtTime(i.startTime)} · {i.plannedMins} min {i.type === 'review' && '· review'}</p>
                  </div>
                  {i.status === 'done' ? <span className="text-sm font-medium text-leaf">Done</span> : i.status === 'skipped' ? <span className="text-sm text-ink/50">Skipped</span> : (
                    <button className="btn-ghost" onClick={() => nav('/study', { state: { subjectId: i.subjectId?._id, topicName: i.topicName, plannedMins: i.plannedMins, scheduleItemId: i._id } })}>Start</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="space-y-6 md:col-span-2">
          <Panel title="Exam readiness">
            {!ready.data?.length ? <Empty>Add an exam date to a subject to track readiness.</Empty> : (
              <ul className="space-y-4">
                {ready.data.map((r) => (
                  <li key={r.subjectId}>
                    <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{r.subject}</span><span className="text-ink/60">{r.readiness}% · {r.daysRemaining} days left</span></div>
                    <Meter value={r.readiness} color={r.readiness < 40 ? 'bg-berry' : r.readiness < 70 ? 'bg-amber' : 'bg-leaf'} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Weekly Exam" className="md:col-span-5" action={<button className="btn" onClick={() => nav('/weekly-exam')}>Take Weekly Exam</button>}></Panel>
          {focus.data?.insights?.map((i) => (
            <div key={i.from} className="rounded-2xl bg-amber-soft p-5">
              <p className="font-semibold">Focus insight</p>
              <p className="mt-1 text-sm">{i.message}</p>
            </div>
          ))}
        </div>
      </div>
      {needsPre && (
        <Modal title="How confident do you feel about your exams?">
          <Notice>{err}</Notice>
          <p className="mb-4 text-sm text-ink/70">Rate yourself from 1 (not at all) to 10 (fully ready). We will ask again later to show your progress.</p>
          <input type="range" min={1} max={10} value={score} onChange={(e) => setScore(+e.target.value)} className="w-full accent-teal" aria-label="Confidence" />
          <p className="my-2 text-center font-display text-4xl font-bold">{score}</p>
          <button className="btn w-full" onClick={savePre}>Save my starting point</button>
        </Modal>
      )}
    </Page>
  );
}
