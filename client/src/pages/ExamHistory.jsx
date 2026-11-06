import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api';
import { Page, Panel, Empty, Notice } from '../ui.jsx';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function ExamHistory() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetch() {
      try {
        const res = await api.get('/exams');
        setExams(res.data || []);
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);
  // derived analytics
  const submitted = exams.filter(e => e.submittedAt && typeof e.score === 'number');
  const totalSubmitted = submitted.length;
  const avgScore = totalSubmitted ? (submitted.reduce((s, e) => s + e.percentage, 0) / totalSubmitted).toFixed(1) : 0;
  const highestScore = totalSubmitted ? Math.max(...submitted.map(e => e.percentage)) : 0;
  const latestScore = totalSubmitted ? [...submitted].sort((a,b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0].percentage : 0;

  const chartData = [...submitted]
    .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt))
    .map(e => ({ date: new Date(e.submittedAt).toLocaleDateString(), score: e.percentage }));

  const subjectMap = {};
  submitted.forEach(e => {
    const sid = e.subjectId ? e.subjectId.toString() : 'unknown';
    if (!subjectMap[sid]) subjectMap[sid] = { total: 0, count: 0 };
    subjectMap[sid].total += e.percentage;
    subjectMap[sid].count += 1;
  });
  const subjectAverages = Object.entries(subjectMap).map(([id, d]) => ({
    id: id.slice(0, 6),
    avg: (d.total / d.count).toFixed(1),
  }));

  // Weak topic detection
  const topicStats = {};
  exams.forEach(attempt => {
    if (!attempt.submittedAt) return;
    (attempt.questions || []).forEach(q => {
      const topic = q.snapshot?.topic;
      if (!topic) return;
      if (!topicStats[topic]) topicStats[topic] = { correct: 0, total: 0 };
      const hasAnswer = typeof q.selectedIdx === 'number' && typeof q.snapshot?.correctOptionIdx === 'number';
      topicStats[topic].total += 1;
      if (hasAnswer) {
        if (q.selectedIdx === q.snapshot.correctOptionIdx) {
          topicStats[topic].correct += 1;
        }
      }
    });
  });
  const weakTopics = Object.entries(topicStats)
    .map(([t, d]) => ({
      topic: t,
      accuracy: d.total ? ((d.correct / d.total) * 100).toFixed(1) : 0,
    }))
    .filter(t => t.accuracy < 80);

  return (
    <Page title="Exam History">
      <Notice>{error}</Notice>
      {loading && <p>Loading…</p>}
      {!loading && exams.length === 0 && <Empty>No exams yet.</Empty>}
      {/* analytics when submitted attempts exist */}
      {!loading && totalSubmitted > 0 && (
        <>
          <Panel title="Summary">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-white rounded shadow">
                <div className="text-sm text-gray-500">Total Submitted</div>
                <div className="text-xl font-bold">{totalSubmitted}</div>
              </div>
              <div className="p-4 bg-white rounded shadow">
                <div className="text-sm text-gray-500">Average Score</div>
                <div className="text-xl font-bold">{avgScore}%</div>
              </div>
              <div className="p-4 bg-white rounded shadow">
                <div className="text-sm text-gray-500">Highest Score</div>
                <div className="text-xl font-bold">{highestScore}%</div>
              </div>
              <div className="p-4 bg-white rounded shadow">
                <div className="text-sm text-gray-500">Latest Score</div>
                <div className="text-xl font-bold">{latestScore}%</div>
              </div>
            </div>
          </Panel>

          <Panel title="Score Trend">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#8884d8" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          {subjectAverages.length > 0 && (
            <Panel title="Subject‑wise Avg Score">
              <ul className="list-disc pl-5">
                {subjectAverages.map(s => (
                  <li key={s.id}>Subject {s.id}: {s.avg}%</li>
                ))}
              </ul>
            </Panel>
          )}
                  {/* weak topics panel */}
          {weakTopics.length > 0 && (
            <Panel title="Weak Topics">
              <ul className="list-disc pl-5">
                {weakTopics.map(t => (
                  <li key={t.topic}>Topic {t.topic}: {t.accuracy}% accuracy</li>
                ))}
              </ul>
              <p className="text-sm text-gray-600">Consider revising these topics.</p>
            </Panel>
          )}
          </>
      )}
      {!loading && exams.length > 0 && (
        <Panel title="Your attempts">
          <ul>
            {exams.map((e) => (
              <li key={e._id} className="mb-2 flex items-center justify-between">
              <div>
                {e.title || 'Exam'} – {new Date(e.createdAt || e.startedAt).toLocaleDateString()} – Score: {e.score}/{e.questions?.length || ''} ({e.percentage || 0}%) {e.submittedAt ? '' : '(pending)'}
              </div>
              <Link to={`/exam/${e._id}`} className="btn bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700">View Details</Link>
            </li>
            ))}
          </ul>
        </Panel>
      )}
    </Page>
  );
}
