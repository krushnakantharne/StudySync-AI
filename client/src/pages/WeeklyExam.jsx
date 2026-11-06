import { useEffect, useState } from 'react';
import api, { errMsg } from '../api';
import { Page, Notice, Panel } from '../ui.jsx';

export default function WeeklyExam() {
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [exam, setExam] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState(3);
  const [pickedTopics, setPickedTopics] = useState([]);
  const [remaining, setRemaining] = useState(null);
  const [elapsed, setElapsed] = useState(0);


  useEffect(() => {
    if (!exam || result) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((new Date(exam.expiresAt) - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [exam, result]);

  useEffect(() => {
    if (!generating) { setElapsed(0); return; }
    const t = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [generating]);

  useEffect(() => { setPickedTopics([]); }, [selectedSubject]);

  // Load subjects on mount
  useEffect(() => {
    async function fetchSubjects() {
      try {
        const res = await api.get('/subjects');
        setSubjects(res.data);
        if (res.data.length) setSelectedSubject(res.data[0]._id);
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setLoading(false);
      }
    }
    fetchSubjects();
  }, []);

  const generateExam = async () => {
    if (!selectedSubject || generating) return;
    setGenerating(true);
    setError('');
    try {
      const payload = {
        subjectId: selectedSubject,
        difficulty,
        count,
        durationMins: Math.max(5, Math.ceil(count * 1.5)),
        topics: pickedTopics,
      };
      // server enforces a ~40s limit; give the browser a little more
      const res = await api.post('/exams/generate', payload, { timeout: 60000 });
      const examData = res.data;
      setExam({
        ...examData,
        questions: examData.questions.map((q) => ({ ...q, selectedIdx: null })),
      });
    } catch (e) {
      setError(e?.code === 'ECONNABORTED' ? 'Generation took too long. Please try again.' : errMsg(e));
    } finally {
      setGenerating(false);
    }
  };
  const submitExam = async () => {
    if (!exam || submitting) return;
    setError('');
    const answers = exam.questions.map((q) => ({
      questionId: q._id,
      selectedIdx: q.selectedIdx ?? null,
    }));
    setSubmitting(true);
    try {
      const res = await api.post(`/exams/${exam._id}/submit`, { answers });
      setResult(res.data);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOptionSelect = (qid, idx) => {
    setExam(prev => {
      if (!prev) return prev;
      const newQs = prev.questions.map(q => q._id === qid ? { ...q, selectedIdx: idx } : q);
      return { ...prev, questions: newQs };
    });
  };


  if (loading) return <Page title="Weekly Exam" sub="Loading…" />;
  if (!subjects.length) {
    return (
      <Page title="Weekly Exam">
        <Notice>No subjects found. Create a subject before taking a weekly exam.</Notice>
      </Page>
    );
  }

  return (
    <Page title="Weekly Exam">
      {error && <div style={{ marginBottom: '1rem' }}><Notice>{error}</Notice></div>}
      {!exam && (
        <Panel title="Prepare Exam">
          <label>
            Subject:
            <select
              disabled={generating}
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              style={{ marginLeft: '0.5rem' }}
            >
              {subjects.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.subjectName}
                </option>
              ))}
            </select>
          </label>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <label>Questions:{' '}
              <select value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={generating}>
                {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label>Difficulty:{' '}
              <select value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} disabled={generating}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          {(subjects.find((s) => s._id === selectedSubject)?.topics || []).length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <p style={{ marginBottom: '0.25rem' }}>Topics (leave all unticked to use every topic):</p>
              {subjects.find((s) => s._id === selectedSubject).topics.map((t) => (
                <label key={t.name} style={{ display: 'inline-block', marginRight: '1rem' }}>
                  <input
                    type="checkbox"
                    disabled={generating}
                    checked={pickedTopics.includes(t.name)}
                    onChange={(e) => setPickedTopics((p) => e.target.checked ? [...p, t.name] : p.filter((x) => x !== t.name))}
                  />{' '}{t.name}
                </label>
              ))}
            </div>
          )}
          <button
            onClick={generateExam}
            disabled={generating}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}
          >
            {generating ? `Generating… ${elapsed}s` : error ? 'Try again' : 'Generate Exam'}
          </button>
        </Panel>
      )}
      {exam && !result && (
        <Panel title="Exam Details">
          <p className="mb-4 font-semibold">Time left: {Math.floor((remaining ?? 0) / 60)}:{String((remaining ?? 0) % 60).padStart(2, '0')}</p>
          {remaining === 0 && <Notice>Time expired. Generate another exam to try again.</Notice>}
          {exam.questions.map((q, idx) => (
            <div key={q._id} style={{ marginBottom: '1rem' }}>
              <h4>{idx + 1}. {q.snapshot.questionText}</h4>
              <div>
                {q.snapshot.options.map((opt, optIdx) => (
                  <label key={optIdx} style={{ display: 'block' }}>
                    <input
                      disabled={submitting || remaining === 0}
                      type="radio"
                      name={`q_${q._id}`}
                      checked={q.selectedIdx === optIdx}
                      onChange={() => handleOptionSelect(q._id, optIdx)}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button type="button" onClick={submitExam} disabled={submitting || remaining === 0} style={{ backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.5rem 1rem', cursor: 'pointer', marginTop: '1rem' }}>
              {submitting ? 'Submitting…' : 'Submit Exam'}
            </button>
          {remaining === 0 && <button className="btn-ghost ml-3" onClick={() => { setExam(null); setError(''); }}>New exam</button>}
        </Panel>
      )}
      {result && (
        <Panel title="Result">
          <button className="btn mb-4" onClick={() => { setExam(null); setResult(null); setError(''); }}>Take another exam</button>
          <h3>Score: {result.score} / {result.questions.length}</h3>
          <p>Percentage: {result.percentage}%</p>
          {result.questions.map((q, idx) => (
            <div key={q._id} style={{ marginBottom: '1rem' }}>
              <h4>{idx + 1}. {q.snapshot.questionText}</h4>
              <p>Your answer: {q.snapshot.options[q.selectedIdx] || 'N/A'}</p>
              <p>Correct answer: {q.snapshot.options[q.snapshot.correctOptionIdx]}</p>
              <p>Explanation: {q.snapshot.explanation}</p>
            </div>
          ))}
        </Panel>
      )}
    </Page>
  );
}
