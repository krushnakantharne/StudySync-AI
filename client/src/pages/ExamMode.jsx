import { useNavigate } from 'react-router-dom';
import api from '../api';
import { Empty, Meter, Notice, Page, Panel, useLoad } from '../ui.jsx';

export default function ExamMode() {
  const nav = useNavigate();
  const { data, loading, error } = useLoad(() => api.get('/exam-mode/queue'));
  const when = (d) => (d ? new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'today');
  return (
    <Page title="Exam Mode" sub="For subjects with Exam Mode on, the planner switches to spaced repetition. Review gaps shrink as the exam gets closer.">
      <Notice>{error}</Notice>
      {!loading && !data?.subjects.length ? <Empty>Turn on Exam Mode for a subject that has an exam date (Subjects page).</Empty> : data && (
        <div className="grid gap-6 md:grid-cols-5">
          <Panel title={`Due today (${data.queue.length})`} className="md:col-span-2">
            {!data.queue.length ? <Empty>No reviews due today.</Empty> : (
              <ul className="divide-y divide-line">
                {data.queue.map((q, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 py-2.5">
                    <div><p className="font-medium">{q.topic}</p><p className="text-sm text-ink/60">{q.subject} · mastery {q.mastery}%</p></div>
                    <button className="btn-ghost" onClick={() => nav('/study', { state: { subjectId: q.subjectId, topicName: q.topic, plannedMins: 30 } })}>Review</button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <div className="space-y-6 md:col-span-3">
            {data.subjects.map((s) => (
              <Panel key={s._id} title={s.subjectName} aside={<span className="text-sm text-ink/60">{s.daysLeft} days to exam</span>}>
                <div className="mb-4 flex items-center gap-3"><Meter value={s.readiness} color="bg-amber" /><span className="w-12 text-right font-display text-lg font-bold">{s.readiness}%</span></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-ink/60"><tr><th className="py-1 font-medium">Topic</th><th className="font-medium">Mastery</th><th className="font-medium">Next review</th><th className="font-medium">Gap</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {s.topics.map((t) => (
                        <tr key={t.name}><td className="py-2 font-medium">{t.name}</td><td>{t.mastery}%</td><td>{when(t.nextReview)}</td><td>{t.intervalDays} d</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            ))}
          </div>
        </div>
      )}
    </Page>
  );
}
