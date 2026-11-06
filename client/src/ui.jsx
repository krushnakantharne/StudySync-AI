import { useCallback, useEffect, useState } from 'react';

export const COLORS = ['#4266D5', '#4BA79A', '#E8A33D', '#8E6BBF', '#C94F6D', '#2E86AB', '#3E9B6C', '#B08968'];

/** Load data on mount: const {data, loading, error, reload} = useLoad(() => api.get(..)) */
export function useLoad(fn, deps = []) {
  const [state, set] = useState({ data: null, loading: true, error: null });
  const reload = useCallback(() => {
    set((s) => ({ ...s, loading: true, error: null }));
    return fn()
      .then((r) => set({ data: r.data ?? r, loading: false, error: null }))
      .catch((e) => set({ data: null, loading: false, error: e?.response?.data?.message || e.message }));
  }, deps); // eslint-disable-line
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

export const Page = ({ title, sub, action, children }) => (
  <div className="mx-auto max-w-6xl px-5 py-7 lg:px-9 lg:py-9">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[.2em] text-teal">STUDYSYNC AI / WORKSPACE</p>
        <h1 className="text-3xl font-extrabold md:text-[36px]">{title}</h1>
        {sub && <p className="mt-1 max-w-xl text-ink/70">{sub}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

export const Panel = ({ title, aside, action, children, className = '' }) => (
  <section className={`rounded-2xl border border-line bg-white p-5 lg:p-6 ${className}`}>
    {(title || aside || action) && (
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {aside || action}
      </div>
    )}
    {children}
  </section>
);

export const Meter = ({ value, color = 'bg-teal' }) => (
  <div className="h-2.5 w-full overflow-hidden rounded-full bg-mist" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
  </div>
);

export const Empty = ({ children }) => <p className="rounded-xl bg-mist px-4 py-6 text-center text-sm text-ink/60">{children}</p>;
export const Notice = ({ tone = 'berry', children }) =>
  children ? <p className={`rounded-lg px-3 py-2 text-sm ${tone === 'berry' ? 'bg-berry-soft text-berry' : 'bg-teal-soft text-teal'}`}>{children}</p> : null;

export function Modal({ title, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const fmtDay = (iso) => new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
export const fmtWeek = (w) => new Date(w + 'T00:00').toLocaleDateString([], { month: 'short', day: 'numeric' });
export const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
