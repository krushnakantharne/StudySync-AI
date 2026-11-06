import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useAuth } from '../store';
import { Modal, Notice, Page, Panel } from '../ui.jsx';
import ActivitySettings from '../components/ActivitySettings.jsx';

export default function Settings() {
  const nav = useNavigate();
  const { user, setAuth, logout } = useAuth();
  const [f, setF] = useState({
    fullName: user.fullName, timezone: user.timezone, dailyGoalMins: user.dailyGoalMins, maxSessionMins: user.maxSessionMins,
    preferredStartHour: user.preferredStartHour, preferredEndHour: user.preferredEndHour, schedulerMode: user.schedulerMode,
  });
  const [msg, setMsg] = useState({ ok: '', err: '' });
  const [post, setPost] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const say = (ok, err = '') => setMsg({ ok, err });

  async function save(e) {
    e.preventDefault();
    try { const { data } = await api.put('/auth/me', f); setAuth({ user: data }); say('Settings saved.'); } catch (x) { say('', errMsg(x)); }
  }
  async function demo() {
    if (!confirm('This replaces your subjects, sessions and analytics with demo data. Continue?')) return;
    say('Loading demo data…');
    try { await api.post('/seed'); say('Demo data loaded. Open the dashboard and analytics.'); } catch (x) { say('', errMsg(x)); }
  }
  async function savePost() { try { await api.post('/surveys', { type: 'post', score: post }); setPost(null); say('Thanks! Check the confidence chart in Analytics.'); } catch (e) { say('', errMsg(e)); } }

  const field = (k, label, props = {}) => (
    <div><label className="label" htmlFor={k}>{label}</label><input id={k} className="input" value={f[k]} onChange={set(k)} {...props} /></div>
  );

  return (
    <Page title="Settings">
      <Notice tone="teal">{msg.ok}</Notice><Notice>{msg.err}</Notice>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <Panel title="Study preferences">
          <form onSubmit={save} className="space-y-3">
            {field('fullName', 'Full name')}
            {field('timezone', 'Timezone (IANA)')}
            <div className="grid grid-cols-2 gap-3">
              {field('dailyGoalMins', 'Daily goal (min)', { type: 'number', min: 15 })}
              {field('maxSessionMins', 'Longest session (min)', { type: 'number', min: 20, max: 90 })}
              {field('preferredStartHour', 'Study from (hour)', { type: 'number', min: 0, max: 22 })}
              {field('preferredEndHour', 'Study until (hour)', { type: 'number', min: 1, max: 24 })}
            </div>
            <div><label className="label" htmlFor="mode">Planner</label>
              <select id="mode" className="input" value={f.schedulerMode} onChange={set('schedulerMode')}>
                <option value="auto">Automatic (priority ranker first, AI agent after 10 sessions)</option>
                <option value="heuristic">Priority ranker only</option>
                <option value="rl">Reinforcement-learning agent</option>
              </select></div>
            <button className="btn">Save settings</button>
          </form>
        </Panel>
        <div className="space-y-6">
          <Panel title="Privacy">
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink/80">
              <li>Camera video is analysed in your browser and is never stored or uploaded.</li>
              <li>We log only whether you typed in each minute, never which keys.</li>
              <li>The original focus tracker counts tab switches. The optional activity extension separately records bare website domains, categories and time only when you consent.</li>
            </ul>
          </Panel>
          <Panel title="Progress and demo">
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={() => setPost(7)}>Rate my confidence now</button>
              <button className="btn-ghost" onClick={demo}>Load demo data</button>
              <button className="btn-danger" onClick={() => { logout(); nav('/login'); }}>Log out</button>
            </div>
          </Panel>
        </div>
      </div>
      <ActivitySettings />
      {post != null && (
        <Modal title="How confident do you feel about your exams now?">
          <input type="range" min={1} max={10} value={post} onChange={(e) => setPost(+e.target.value)} className="w-full accent-teal" aria-label="Confidence" />
          <p className="my-2 text-center font-display text-4xl font-bold">{post}</p>
          <div className="flex gap-2"><button className="btn flex-1" onClick={savePost}>Save</button><button className="btn-ghost" onClick={() => setPost(null)}>Cancel</button></div>
        </Modal>
      )}
    </Page>
  );
}
