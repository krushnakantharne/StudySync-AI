import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useAuth } from '../store';
import { Notice } from '../ui.jsx';

export default function Auth({ mode }) {
  const reg = mode === 'register';
  const nav = useNavigate();
  const setAuth = useAuth((s) => s.setAuth);
  const [f, setF] = useState({ fullName: '', email: '', password: '', dailyGoalMins: 180, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const { data } = await api.post(reg ? '/auth/register' : '/auth/login', f);
      setAuth({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken });
      nav('/');
    } catch (e2) { setErr(errMsg(e2)); }
    setBusy(false);
  }

  return (
    <div className="auth-screen grid min-h-screen lg:grid-cols-[1.02fr_1fr]">
      <div className="hero-banner hidden min-h-screen flex-col justify-between px-12 py-10 lg:flex xl:px-20 xl:py-14">
        <div className="relative z-10 flex items-center gap-3"><span className="brand-mark">S<span className="brand-spark">✦</span></span><span className="font-display text-2xl font-extrabold">StudySync <span className="text-sky-300">AI</span></span></div>
        <div className="relative z-10 max-w-lg">
          <span className="mb-6 inline-block rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[.18em] text-blue-100">SMARTER STUDY. REAL PROGRESS.</span>
          <h1 className="text-5xl font-extrabold leading-[1.12] xl:text-6xl">Make every study session count.</h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-blue-100/85">One intelligent space for your weekly plan, focused learning, MCQ practice and real progress — powered by adaptive study insights.</p>
          <div className="mt-9 grid max-w-md grid-cols-3 gap-3">{[['01', 'Plan'], ['02', 'Focus'], ['03', 'Improve']].map(([n, label]) => <div className="rounded-2xl border border-white/15 bg-white/10 p-4" key={n}><p className="text-2xl font-bold">{n}</p><p className="mt-1 text-xs text-blue-100/80">{label}</p></div>)}</div>
        </div>
        <p className="relative z-10 text-sm text-white/60">Private by design · Camera and browser monitoring are optional</p>
      </div>
      <div className="flex min-h-screen items-center justify-center px-5 py-12 md:px-12">
        <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-line bg-white p-8 shadow-xl shadow-blue-900/5 sm:p-11">
          <div className="mb-8"><span className="inline-block rounded-full bg-teal-soft px-3 py-1 text-[11px] font-bold uppercase tracking-[.15em] text-teal">WELCOME TO STUDYSYNC</span><h2 className="mt-5 text-3xl font-extrabold">{reg ? 'Create your account' : 'Welcome back'}</h2><p className="mt-2 text-sm text-ink/60">{reg ? 'Create a workspace and start studying smarter.' : 'Sign in to continue your learning journey.'}</p></div>
          <div className="space-y-4">
            {reg && <div><label className="label" htmlFor="n">Full name</label><input id="n" className="input" autoComplete="name" required value={f.fullName} onChange={set('fullName')} /></div>}
            <div><label className="label" htmlFor="e">Email address</label><input id="e" type="email" autoComplete="email" className="input" required value={f.email} onChange={set('email')} /></div>
            <div><label className="label" htmlFor="p">Password</label><input id="p" type="password" autoComplete={reg ? 'new-password' : 'current-password'} minLength={6} className="input" required value={f.password} onChange={set('password')} /></div>
            {reg && <div className="grid grid-cols-2 gap-3"><div><label className="label" htmlFor="g">Daily goal (min)</label><input id="g" type="number" min={15} className="input" value={f.dailyGoalMins} onChange={set('dailyGoalMins')} /></div><div><label className="label" htmlFor="t">Timezone</label><input id="t" className="input" value={f.timezone} onChange={set('timezone')} /></div></div>}
            <Notice>{err}</Notice>
            <button className="btn mt-1 w-full !py-3.5" disabled={busy}>{busy ? 'Please wait…' : reg ? 'Create account' : 'Sign in to StudySync'}</button>
          </div>
          <p className="mt-6 text-center text-sm text-ink/60">{reg ? 'Already have an account?' : 'New to StudySync?'}{' '}<Link className="font-bold text-teal hover:underline" to={reg ? '/login' : '/register'}>{reg ? 'Sign in' : 'Create an account'}</Link></p>
        </form>
      </div>
    </div>
  );
}
