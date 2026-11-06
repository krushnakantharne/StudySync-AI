import { Navigate, Route, Routes } from 'react-router-dom';
import WeeklyExam from './pages/WeeklyExam.jsx';
import { useAuth } from './store';
import Layout from './Layout.jsx';
import Auth from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Subjects from './pages/Subjects.jsx';
import Schedule from './pages/Schedule.jsx';
import Study from './pages/Study.jsx';
import ExamMode from './pages/ExamMode.jsx';
import ExamHistory from './pages/ExamHistory.jsx';
import ExamDetails from './pages/ExamDetails.jsx';
import Analytics from './pages/Analytics.jsx';
import Settings from './pages/Settings.jsx';

function Protected() {
  const token = useAuth((s) => s.accessToken);
  const user = useAuth((s) => s.user);
  return token && user ? <Layout /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Auth mode="login" />} />
      <Route path="/register" element={<Auth mode="register" />} />
      <Route element={<Protected />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/subjects" element={<Subjects />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/study" element={<Study />} />
        <Route path="/exam-mode" element={<ExamMode />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/weekly-exam" element={<WeeklyExam />} />
          <Route path="/exam-history" element={<ExamHistory />} />
          <Route path="/exam/:id" element={<ExamDetails />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
