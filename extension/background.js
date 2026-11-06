/* MV3 service worker. Domains + coarse time windows only; no page contents, titles, history or keystrokes. */
const BASE = 'http://localhost:5000/api/activity';
chrome.idle.setDetectionInterval(30);
let last = null;
let queue = Promise.resolve();
const request = async (path, init = {}) => {
  const { token } = await chrome.storage.local.get('token');
  if (!token) return null;
  const response = await fetch(BASE + path, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  if (response.status === 401) { await chrome.storage.local.remove('token'); last = null; return null; }
  if (!response.ok) throw new Error(`Activity service returned ${response.status}`);
  return response.json();
};
async function currentActivity() {
  const [idle, win] = await Promise.all([chrome.idle.queryState(30), chrome.windows.getLastFocused()]);
  if (idle !== 'active' || !win.focused) return { idle: true, domain: null };
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  let domain = null;
  try { const url = new URL(tabs[0]?.url || ''); if (['http:', 'https:'].includes(url.protocol)) domain = url.hostname.toLowerCase().replace(/^www\./, ''); } catch { /* Chrome internal pages are Unknown. */ }
  return { idle: false, domain };
}
async function sample() {
  const state = await request('/state');
  const now = Date.now();
  if (!state?.active) { last = null; return; }
  const activity = await currentActivity();
  // Send only the preceding observed state; switching tabs divides the interval.
  if (last?.sessionId === state.sessionId) {
    const from = Math.max(last.at, now - 55_000);
    if (now - from >= 1000) {
      const payload = { sessionId: state.sessionId, eventId: crypto.randomUUID(), from: new Date(from).toISOString(), to: new Date(now).toISOString(), domain: last.domain, idle: last.idle };
      try { await request('/events', { method: 'POST', body: JSON.stringify(payload) }); }
      catch (e) { console.warn('StudySync event was not accepted:', e.message); }
    }
  }
  last = { ...activity, sessionId: state.sessionId, at: now };
}
function schedule() { queue = queue.then(sample).catch((e) => { console.warn('StudySync tracker:', e.message); last = null; }); return queue; }
chrome.runtime.onInstalled.addListener(() => chrome.alarms.create('studysync-check', { periodInMinutes: 0.5 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('studysync-check', { periodInMinutes: 0.5 }));
chrome.alarms.create('studysync-check', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === 'studysync-check') schedule(); });
chrome.tabs.onActivated.addListener(schedule);
chrome.tabs.onUpdated.addListener((_id, change) => { if (change.url) schedule(); });
chrome.windows.onFocusChanged.addListener(schedule);
chrome.idle.onStateChanged.addListener(schedule);
chrome.storage.onChanged.addListener((changes) => { if (changes.token) { last = null; schedule(); } });
chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  if (msg?.type === 'refresh') { schedule().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false })); return true; }
});
