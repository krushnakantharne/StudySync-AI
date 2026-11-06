import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '../api';
import { COLORS, Empty, fmtWeek, Meter, Notice, Page, Panel, useLoad } from '../ui.jsx';

const Chart = ({ children }) => <div className="h-64 w-full"><ResponsiveContainer>{children}</ResponsiveContainer></div>;
const axis = { stroke: '#16243B', tick: { fontSize: 12, fill: '#16243B99' }, tickLine: false };

export default function Analytics() {
  const time = useLoad(() => api.get('/analytics/time-distribution?weeks=4'));
  const focus = useLoad(() => api.get('/analytics/focus-trend?days=30'));
  const mastery = useLoad(() => api.get('/analytics/mastery'));
  const ready = useLoad(() => api.get('/analytics/readiness'));
  const prod = useLoad(() => api.get('/analytics/productivity?weeks=5'));
  const surveys = useLoad(() => api.get('/surveys'));
  const activity = useLoad(() => api.get('/activity/summary'));
  const [open, setOpen] = useState(null);

  const pre = surveys.data?.filter((s) => s.type === 'pre').at(-1)?.score;
  const post = surveys.data?.filter((s) => s.type === 'post').at(-1)?.score;
  const prodRows = (prod.data || []).filter((r) => r.score > 0).map((r) => ({ ...r, week: fmtWeek(r.week) }));

  return (
    <Page title="Analytics" sub="How you are studying, how well you focus, and how ready you are.">
      <Notice>{time.error || focus.error || mastery.error || ready.error || prod.error || surveys.error || activity.error}</Notice>
      <div className="space-y-6">
        <Panel title="Activity-aware productivity" aside={<span className="text-xs text-ink/50">Browser extension · real events only</span>}>
          {!activity.data?.trackedEvents ? <Empty>No browser activity has been tracked. Pair the Chrome extension in Settings, then opt in when starting a study session.</Empty> : <><div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">{[['Verified learning', `${activity.data.studyMinutes}m`], ['Distractions', `${activity.data.distractionMinutes}m`], ['Idle', `${activity.data.idleMinutes}m`], ['Unknown', `${activity.data.unknownMinutes}m`], ['Productivity', `${activity.data.score ?? '—'}%`]].map(([label, value]) => <div key={label} className="rounded-xl bg-mist p-3"><p className="text-xs text-ink/60">{label}</p><p className="mt-1 font-display text-2xl font-bold">{value}</p></div>)}</div><div className="h-3 flex w-full overflow-hidden rounded-full bg-mist">{[['Study', '#3458c7'], ['Coding', '#3f9f96'], ['Reference', '#86a7ef'], ['Entertainment', '#ea8390'], ['Gaming', '#efaf72'], ['Idle', '#b8c1d3'], ['Unknown', '#8995ab']].map(([k, color]) => <div key={k} title={`${k}: ${activity.data.breakdown[k]} minutes`} style={{ width: `${activity.data.breakdown[k] / (activity.data.totalMinutes || 1) * 100}%`, backgroundColor: color }} />)}</div><p className="mt-3 text-xs text-ink/60">Activity 50%, BKT mastery 25%, SM-2 review 10%, quiz 10%, mastered topics 5%. Missing learning signals are excluded and weights renormalized. Unknown is not counted as verified learning. Webcam use never changes this score.</p></>}
        </Panel>
        <Panel title="Study time per subject, by week">
          {!time.data?.subjects.length ? <Empty>Complete a few sessions to see where your time goes.</Empty> : (
            <>
              {time.data.alerts.map((a) => (
                <p key={a.subject} className="mb-3 rounded-lg bg-berry-soft px-3 py-2 text-sm text-berry">Behind on {a.subject}: you studied {a.actual} of {a.planned} planned minutes last week.</p>
              ))}
              <Chart>
                <BarChart data={time.data.rows.map((r) => ({ ...r, week: fmtWeek(r.week) }))}>
                  <CartesianGrid vertical={false} stroke="#D7DEE7" /><XAxis dataKey="week" {...axis} /><YAxis {...axis} unit="m" width={44} /><Tooltip /><Legend />
                  {time.data.subjects.map((s, i) => <Bar key={s} dataKey={s} stackId="t" fill={COLORS[i % COLORS.length]} />)}
                </BarChart>
              </Chart>
            </>
          )}
        </Panel>

        <Panel title="Focus quality">
          {!focus.data?.series.length ? <Empty>Focus trends appear after your first tracked sessions.</Empty> : (
            <>
              {focus.data.insights.map((i) => <p key={i.from} className="mb-3 rounded-lg bg-amber-soft px-3 py-2 text-sm">{i.message}</p>)}
              <Chart>
                <LineChart data={focus.data.series.map((r) => ({ ...r, date: fmtWeek(r.date) }))}>
                  <CartesianGrid vertical={false} stroke="#D7DEE7" /><XAxis dataKey="date" {...axis} minTickGap={24} /><YAxis {...axis} domain={[0, 100]} width={36} /><Tooltip /><Legend />
                  <Line name="Daily focus" dataKey="focus" stroke="#9AA6B6" dot={{ r: 2 }} strokeWidth={1.5} />
                  <Line name="7-day average" dataKey="avg7" stroke="#0B7A75" dot={false} strokeWidth={3} />
                </LineChart>
              </Chart>
            </>
          )}
        </Panel>

        <Panel title="Subject mastery over time">
          {!mastery.data?.rows.length ? <Empty>Mastery builds up as you finish sessions and rate your understanding.</Empty> : (
            <>
              {mastery.data.flags.map((f) => <p key={f.topic} className="mb-2 rounded-lg bg-amber-soft px-3 py-2 text-sm"><b>{f.subject} · {f.topic}:</b> {f.message}</p>)}
              <Chart>
                <LineChart data={mastery.data.rows.map((r) => ({ ...r, week: fmtWeek(r.week) }))}>
                  <CartesianGrid vertical={false} stroke="#D7DEE7" /><XAxis dataKey="week" {...axis} /><YAxis {...axis} domain={[0, 100]} unit="%" width={44} /><Tooltip /><Legend />
                  {mastery.data.subjects.map((s, i) => <Line key={s} dataKey={s} stroke={COLORS[i % COLORS.length]} strokeWidth={2.5} dot={false} />)}
                </LineChart>
              </Chart>
            </>
          )}
        </Panel>

        <Panel title="Exam readiness">
          {!ready.data?.length ? <Empty>Add an exam date to a subject to see readiness.</Empty> : (
            <ul className="space-y-4">
              {ready.data.map((r) => (
                <li key={r.subjectId}>
                  <button className="w-full text-left" onClick={() => setOpen(open === r.subjectId ? null : r.subjectId)} aria-expanded={open === r.subjectId}>
                    <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{r.subject}</span><span className="text-ink/60">{r.readiness}% ready · {r.daysRemaining} days left</span></div>
                    <Meter value={r.readiness} color={r.readiness < 40 ? 'bg-berry' : r.readiness < 70 ? 'bg-amber' : 'bg-leaf'} />
                  </button>
                  {open === r.subjectId && (
                    <ul className="mt-3 space-y-2 border-l-2 border-line pl-4">
                      {[...r.topics].sort((a, b) => a.mastery - b.mastery).map((t) => (
                        <li key={t.name}><div className="flex justify-between text-xs"><span>{t.name}</span><span>{t.mastery}%</span></div><Meter value={t.mastery} color="bg-teal" /></li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="grid gap-6 md:grid-cols-2">
          <Panel title="Productivity score by week">
            {!prodRows.length ? <Empty>No completed weeks yet.</Empty> : (
              <Chart><BarChart data={prodRows}><CartesianGrid vertical={false} stroke="#D7DEE7" /><XAxis dataKey="week" {...axis} /><YAxis {...axis} domain={[0, 100]} width={36} /><Tooltip /><Bar dataKey="score" name="Score" fill="#0B7A75" radius={[6, 6, 0, 0]} /></BarChart></Chart>
            )}
          </Panel>
          <Panel title="Your confidence, before and after">
            {pre == null ? <Empty>Rate your confidence from the dashboard to start tracking.</Empty> : (
              <div className="space-y-5 pt-2">
                <div><div className="mb-1 flex justify-between text-sm"><span>Before using the planner</span><b>{pre}/10</b></div><Meter value={pre * 10} color="bg-ink/40" /></div>
                <div><div className="mb-1 flex justify-between text-sm"><span>Now</span><b>{post != null ? `${post}/10` : 'not rated yet (Settings)'}</b></div><Meter value={(post || 0) * 10} color="bg-teal" /></div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </Page>
  );
}
