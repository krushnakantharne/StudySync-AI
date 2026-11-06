import { useState } from 'react';
import api, { errMsg } from '../api';
import { Empty, Notice, Panel, useLoad } from '../ui.jsx';

const categories = ['Study', 'Coding', 'Reference', 'Entertainment', 'Gaming', 'Idle', 'Unknown'];
export default function ActivitySettings() {
  const { data, loading, error, reload } = useLoad(() => api.get('/activity/config'));
  const [domain, setDomain] = useState('');
  const [category, setCategory] = useState('Study');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [issue, setIssue] = useState('');
  const perform = async (fn) => { setBusy(true); setIssue(''); setNotice(''); try { await fn(); await reload(); } catch (e) { setIssue(errMsg(e)); } finally { setBusy(false); } };
  return <Panel title="Browser activity tracking" className="mt-6">
    <Notice>{error || issue}</Notice><Notice tone="teal">{notice}</Notice>
    {loading ? <p className="text-sm text-ink/60">Loading tracking preferences…</p> : <div className="space-y-5">
      <div className="rounded-xl bg-mist p-4 text-sm leading-6">
        <p className="font-semibold">Your activity stays under your control.</p>
        <p className="mt-1 text-ink/70">The optional Chrome companion observes active browser domains, tab changes and idle time only during sessions you explicitly choose to monitor. It never reads passwords, keystrokes, page contents, page titles or full browsing URLs. Camera processing stays in your browser and is never required for an activity score.</p>
        <label className="mt-3 flex items-center gap-3 font-semibold"><input type="checkbox" className="h-4 w-4 accent-teal" checked={!!data?.consent} disabled={busy} onChange={(e) => perform(async () => { await api.put('/activity/consent', { enabled: e.target.checked }); setCode(''); setNotice(e.target.checked ? 'Permission saved. Install the extension and pair it below.' : 'Monitoring permission turned off. Active tracking has been paused.'); })} /> Allow optional domain-only activity tracking</label>
      </div>
      {data?.consent && <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3"><button className="btn" disabled={busy} onClick={() => perform(async () => { const r = await api.post('/activity/pair-code'); setCode(r.data.code); setNotice('Use the code in the extension popup. Valid for 10 minutes and one use.'); })}>Generate pairing code</button><button className="btn-danger" disabled={busy} onClick={() => perform(async () => { await api.post('/activity/revoke'); setCode(''); setNotice('All extension credentials have been revoked.'); })}>Revoke all paired extensions</button><button className="btn-danger" disabled={busy} onClick={() => { if (window.confirm('Permanently delete your recorded browser activity?')) perform(async () => { await api.delete('/activity/history'); setNotice('Browser activity history deleted.'); }); }}>Delete activity history</button></div>
        {code && <div className="rounded-lg border border-line bg-white p-3"><p className="mb-2 text-xs text-ink/60">One-time code · expires in 10 minutes</p><code className="break-all font-mono text-sm font-bold select-all">{code}</code><button className="btn-ghost mt-3 block" onClick={() => navigator.clipboard.writeText(code).then(() => setNotice('Code copied.')).catch(() => setIssue('Copy unavailable; select the code manually.'))}>Copy code</button></div>}
        <p className="text-sm text-ink/70">Install from <b>chrome://extensions</b> → Developer mode → Load unpacked → choose the <code>extension</code> folder inside the project. Click its icon and paste the code. Requires the local API on port 5000.</p>
      </div>}
      <div className="border-t border-line pt-4">
        <h3 className="font-semibold">Website classification rules</h3>
        <p className="mt-1 mb-3 text-sm text-ink/60">YouTube and unknown sites are Unknown by default. Assign a domain to suit your study habits; subdomains inherit the rule.</p>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); perform(async () => { await api.put('/activity/rules', { domain, category }); setDomain(''); setNotice('Rule saved.'); }); }}>
          <input required className="input min-w-40 flex-1" placeholder="e.g. youtube.com" aria-label="Website domain" value={domain} onChange={(e) => setDomain(e.target.value)} />
          <select className="input !w-auto" aria-label="Activity category" value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
          <button className="btn" disabled={busy}>Save rule</button>
        </form>
        {!data?.rules?.length ? <div className="mt-3"><Empty>No custom website rules yet.</Empty></div> : <ul className="mt-3 divide-y divide-line">{data.rules.map((rule) => <li key={rule.domain} className="flex items-center justify-between gap-2 py-2 text-sm"><span className="break-all"><b>{rule.domain}</b> <span className="ml-2 text-ink/60">{rule.category}</span></span><button className="btn-danger" disabled={busy} onClick={() => perform(async () => { await api.delete(`/activity/rules/${encodeURIComponent(rule.domain)}`); setNotice('Rule deleted.'); })}>Remove</button></li>)}</ul>}
      </div>
    </div>}
  </Panel>;
}
