import { useState } from 'react';
import api, { errMsg } from '../api';
import { Empty, Notice, Page, Panel, useLoad } from '../ui.jsx';

const blank = { subjectName: '', difficulty: 3, topics: '', examDate: '', paperCode: '' };

export default function Subjects() {
  const { data: subjects, reload, error: loadError } = useLoad(() => api.get('/subjects'));
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  const [newTopic, setNewTopic] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const run = async (fn) => { setErr(''); try { await fn(); await reload(); } catch (e) { setErr(errMsg(e)); } };

  const add = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post('/subjects', { ...f, difficulty: +f.difficulty, examDate: f.examDate || null, topics: f.topics.split(',').map((t) => t.trim()).filter(Boolean) });
      setF(blank);
    });
  };

  return (
    <Page title="Subjects" sub={`Add the subjects and topics you study. ${subjects?.length ?? 0} of 15 used.`}>
      <Notice>{err || loadError}</Notice>
      <Panel title="Add a subject" className="mb-8">
        <form onSubmit={add} className="grid gap-3 md:grid-cols-6">
          <div className="md:col-span-3"><label className="label" htmlFor="sn">Subject name</label><input id="sn" className="input" required value={f.subjectName} onChange={set('subjectName')} /></div>
          <div className="md:col-span-1"><label className="label" htmlFor="sd">Difficulty (1-5)</label><input id="sd" type="number" min={1} max={5} className="input" value={f.difficulty} onChange={set('difficulty')} /></div>
          <div className="md:col-span-2"><label className="label" htmlFor="pc">Paper code</label><input id="pc" className="input" value={f.paperCode} onChange={set('paperCode')} /></div>
          <div className="md:col-span-4"><label className="label" htmlFor="st">Topics, separated by commas</label><input id="st" className="input" placeholder="Trees, Graphs, Hashing" value={f.topics} onChange={set('topics')} /></div>
          <div className="md:col-span-2"><label className="label" htmlFor="ed">Exam date (within 12 weeks)</label><input id="ed" type="date" className="input" value={f.examDate} onChange={set('examDate')} /></div>
          <div className="md:col-span-6"><button className="btn">Add subject</button></div>
        </form>
      </Panel>
      {!subjects?.length ? <Empty>No subjects yet. Add your first one above, or load demo data from Settings.</Empty> : (
        <div className="space-y-4">
          {subjects.map((s) => (
            <Panel key={s._id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold">{s.subjectName}</h3>
                  <p className="text-sm text-ink/60">Difficulty {s.difficulty}/5{s.paperCode && ` · ${s.paperCode}`}{s.examDate && ` · exam ${new Date(s.examDate).toLocaleDateString()}`}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input type="date" aria-label="Exam date" className="input !w-auto" value={s.examDate ? s.examDate.slice(0, 10) : ''} onChange={(e) => run(() => api.put(`/subjects/${s._id}`, { examDate: e.target.value || null }))} />
                  <button className={s.examModeActive ? 'btn' : 'btn-ghost'} onClick={() => run(() => api.post(`/subjects/${s._id}/exam-mode`, { active: !s.examModeActive }))}>
                    Exam Mode {s.examModeActive ? 'on' : 'off'}
                  </button>
                  <button className="btn-danger" onClick={() => confirm(`Delete ${s.subjectName}?`) && run(() => api.delete(`/subjects/${s._id}`))}>Delete</button>
                </div>
              </div>
              <ul className="mt-4 flex flex-wrap gap-2">
                {s.topics.map((t) => (
                  <li key={t._id} className="flex items-center gap-2 rounded-full bg-mist py-1 pl-3 pr-2 text-sm">
                    {t.name} <span className="text-ink/50">{Math.round(t.mastery * 100)}%</span>
                    <button aria-label={`Remove ${t.name}`} className="text-ink/40 hover:text-berry" onClick={() => run(() => api.delete(`/subjects/${s._id}/topics/${encodeURIComponent(t.name)}`))}>×</button>
                  </li>
                ))}
              </ul>
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = (newTopic[s._id] || '').trim(); if (v) run(async () => { await api.post(`/subjects/${s._id}/topics`, { names: v.split(',').map((x) => x.trim()) }); setNewTopic({ ...newTopic, [s._id]: '' }); }); }}>
                <input className="input" placeholder="Add topics…" aria-label="Add topics" value={newTopic[s._id] || ''} onChange={(e) => setNewTopic({ ...newTopic, [s._id]: e.target.value })} />
                <button className="btn-ghost">Add</button>
              </form>
            </Panel>
          ))}
        </div>
      )}
    </Page>
  );
}
