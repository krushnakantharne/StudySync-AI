import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api';
import { Empty, fmtDay, fmtTime, Notice, Page, startOfToday, useLoad } from '../ui.jsx';

export default function Schedule() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('');
  const { data, loading, reload, error: loadError } = useLoad(() => {
    const from = startOfToday();
    return api.get('/schedule', { params: { from: from.toISOString(), to: new Date(from.getTime() + 8 * 864e5).toISOString() } });
  });

  async function generate() {
    setBusy(true); setErr('');
    try { const r = await api.post('/schedule/generate'); setMode(r.data.mode); await reload(); } catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  }
  const setStatus = (id, status) => api.patch(`/schedule/${id}`, { status }).then(reload).catch((e) => setErr(errMsg(e)));

  const days = {};
  (data || []).forEach((i) => { (days[fmtDay(i.startTime)] ||= []).push(i); });

  return (
    <Page title="Weekly schedule" sub="Study blocks are capped at 90 minutes with breaks in between. Hard subjects get longer breaks."
      action={<button className="btn" onClick={generate} disabled={busy}>{busy ? 'Planning…' : 'Regenerate plan'}</button>}>
      <Notice tone="teal">{mode && `Planned with the ${mode === 'rl' ? 'reinforcement-learning agent' : 'priority ranker'}.`}</Notice>
      <Notice>{err || loadError}</Notice>
      {!loading && !data?.length ? <Empty>No schedule yet. Add subjects, then regenerate the plan.</Empty> : (
        <div className="space-y-8">
          {Object.entries(days).map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-2 text-xl font-semibold">{day}</h2>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
                {items.map((i) => i.type === 'break' ? (
                  <li key={i._id} className="px-4 py-1.5 text-xs text-ink/50">{fmtTime(i.startTime)} · {i.plannedMins} min break</li>
                ) : (
                  <li key={i._id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`h-10 w-1.5 rounded-full ${i.type === 'review' ? 'bg-amber' : 'bg-teal'}`} />
                      <div>
                        <p className="font-semibold">{i.topicName}</p>
                        <p className="text-sm text-ink/60">{i.subjectId?.subjectName} · {fmtTime(i.startTime)}–{fmtTime(i.endTime)} · {i.type === 'review' ? 'spaced review' : `${i.plannedMins} min`}</p>
                      </div>
                    </div>
                    {i.status === 'planned' ? (
                      <div className="flex gap-2">
                        <button className="btn-ghost" onClick={() => nav('/study', { state: { subjectId: i.subjectId?._id, topicName: i.topicName, plannedMins: i.plannedMins, scheduleItemId: i._id } })}>Start</button>
                        <button className="btn-danger" onClick={() => setStatus(i._id, 'skipped')}>Skip</button>
                      </div>
                    ) : <span className={`text-sm font-medium ${i.status === 'done' ? 'text-leaf' : 'text-ink/50'}`}>{i.status === 'done' ? 'Done' : 'Skipped'}</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
