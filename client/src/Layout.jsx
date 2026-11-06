import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from './store';

const path = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  schedule: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 18h3"/></>,
  focus: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  subjects: <><path d="M3 5.5a3 3 0 0 1 3-3H21v17H6a3 3 0 0 0 0 3H21"/><path d="M6 2.5v17M9 7h9M9 11h6"/></>,
  charts: <><path d="M4 20V10M10 20V4M16 20v-7M22 20V7M2 20h22"/></>,
  quiz: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/></>,
  history: <><path d="M4 9a9 9 0 1 1 1 8M4 4v5h5M12 7v5l4 2"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M10 2h4l.7 2.3 2.3 1 2.2-1.1 2.1 3.5-1.8 1.7v2.8l1.8 1.7-2.1 3.5-2.2-1.1-2.3 1L14 22h-4l-.7-2.3-2.3-1-2.2 1.1-2.1-3.5 1.8-1.7V10l-1.8-1.7 2.1-3.5L7 5.9l2.3-1z"/></>,
  moon: <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M2 12h2M20 12h2M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5"/></>,
  logout: <><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5M16 7l5 5-5 5M21 12H9"/></>,
};
function Icon({ name, size = 19 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path[name]}</svg>; }
const groups = [
  { title: 'WORKSPACE', links: [['/', 'Overview', 'dashboard'], ['/subjects', 'Subjects & topics', 'subjects'], ['/schedule', 'Weekly planner', 'schedule'], ['/study', 'Focus session', 'focus']] },
  { title: 'LEARNING INSIGHTS', links: [['/analytics', 'Analytics', 'charts'], ['/exam-mode', 'Exam readiness', 'quiz'], ['/weekly-exam', 'MCQ practice', 'subjects'], ['/exam-history', 'Exam history', 'history']] },
  { title: 'ACCOUNT', links: [['/settings', 'Settings & privacy', 'settings']] },
];
export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('studysync-theme') === 'dark'; } catch { return false; } });
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); try { localStorage.setItem('studysync-theme', dark ? 'dark' : 'light'); } catch { /* storage optional */ } }, [dark]);
  const signout = () => { logout(); nav('/login'); };
  return <div className="app-shell min-h-screen lg:flex">
    <aside className={`app-sidebar flex shrink-0 flex-col text-white lg:sticky lg:top-0 lg:h-screen lg:w-[252px] ${menuOpen ? 'menu-open' : ''}`}>
      <div className="flex items-center justify-between px-5 py-6">
        <NavLink to="/" className="flex items-center gap-3" onClick={() => setMenuOpen(false)} aria-label="StudySync AI home"><span className="brand-mark">S<span className="brand-spark">✦</span></span><span className="leading-tight"><span className="block text-xl font-extrabold tracking-tight">StudySync <span className="text-sky-300">AI</span></span><span className="text-[10px] font-semibold uppercase tracking-[.18em] text-white/50">your learning space</span></span></NavLink>
        <button className="rounded-xl p-2 text-white lg:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}>{menuOpen ? '✕' : '☰'}</button>
      </div>
      <div className="sidebar-links flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((group) => <div key={group.title} className="mb-6"><p className="px-4 py-2 text-[10px] font-bold tracking-[.19em] text-white/40">{group.title}</p><nav className="mt-1 space-y-1" aria-label={group.title}>{group.links.map(([to, label, icon]) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setMenuOpen(false)} className={({ isActive }) => `nav-item flex items-center gap-3 rounded-xl px-4 py-3 text-[13px] font-semibold transition ${isActive ? 'nav-active' : ''}`}><Icon name={icon}/><span>{label}</span></NavLink>)}</nav></div>)}
      </div>
      <div className="sidebar-profile m-3 rounded-2xl p-3"><div className="mb-3 flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 font-bold">{user?.fullName?.slice(0, 1)?.toUpperCase() || 'S'}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{user?.fullName}</p><p className="text-[11px] text-white/50">Student account</p></div></div><button className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 py-2 text-xs font-semibold text-white/75 hover:bg-white/10 hover:text-white" onClick={signout}><Icon name="logout" size={15}/> Sign out</button></div>
    </aside>
    <div className="min-w-0 flex-1">
      <header className="app-header sticky top-0 z-20 flex items-center justify-between gap-3 px-5 py-3 lg:px-9"><div><p className="text-[11px] font-bold uppercase tracking-[.15em] text-ink/50">YOUR STUDY WORKSPACE</p><p className="text-sm font-semibold text-ink/75">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p></div><div className="flex items-center gap-3"><span className="hidden rounded-full bg-teal-soft px-3 py-1 text-[11px] font-bold text-teal sm:block">● Learning mode</span><button className="theme-toggle grid h-10 w-10 place-items-center rounded-xl border border-line bg-white text-ink" onClick={() => setDark(!dark)} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title={dark ? 'Light theme' : 'Dark theme'}><Icon name={dark ? 'sun' : 'moon'} size={19}/></button></div></header>
      <main className="min-w-0 pb-8"><Outlet /></main>
    </div>
  </div>;
}
