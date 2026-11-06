import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { errMsg } from '../api';
import { Page, Panel, Empty, Notice } from '../ui.jsx';

export default function ExamDetails() {
  const { id } = useParams();
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true); setError('');
    async function fetch() {
      try {
        const res = await api.get(`/exams/${id}`);
        setExam(res.data);
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [id]);

  if (loading) return <Page title="Exam Details"><p>Loading…</p></Page>;
  if (error) return <Page title="Exam Details"><Notice>{error}</Notice></Page>;
  if (!exam) return <Page title="Exam Details"><Empty>No data</Empty></Page>;

  return (
    <Page title="Exam Details">
      <Panel title={exam.title || 'Exam'}>
        {!exam.submittedAt && <Notice>This attempt has not been submitted. Answers are hidden.</Notice>}
        <ul>
          {exam.questions.map((q, idx) => (
            <li key={q._id} className="mb-4">
              <h4>{idx + 1}. {q.snapshot.questionText}</h4>
              <p>Your answer: {q.selectedIdx != null ? q.snapshot.options[q.selectedIdx] : 'N/A'}</p>
              {exam.submittedAt && <p>Correct answer: {q.snapshot.options[q.snapshot.correctOptionIdx]}</p>}
              {q.snapshot.explanation && <p>Explanation: {q.snapshot.explanation}</p>}
            </li>
          ))}
        </ul>
        <Link to="/exam-history" className="btn">Back to History</Link>
      </Panel>
    </Page>
  );
}
