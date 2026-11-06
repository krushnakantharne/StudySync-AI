const BASE = 'http://localhost:5000/api/activity';
const el = (id) => document.getElementById(id);
async function refresh() {
  const { token } = await chrome.storage.local.get('token');
  el('connect').hidden = !!token;
  el('connected').hidden = !token;
  if (!token) { el('status').textContent = 'Not connected'; return; }
  try {
    const response = await fetch(BASE + '/state', { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401) { await chrome.storage.local.remove('token'); return refresh(); }
    if (!response.ok) throw Error('Server unavailable');
    const state = await response.json();
    el('status').textContent = state.active ? '● Tracking active study session' : state.paused ? 'Ⅱ Session monitoring paused' : 'Connected · waiting for a session';
  } catch { el('status').textContent = 'Connected · cannot reach local server'; }
}
el('pair').addEventListener('click', async () => {
  el('error').textContent = '';
  el('pair').disabled = true;
  try {
    const response = await fetch(BASE + '/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: el('code').value.trim() }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || 'Pairing failed');
    await chrome.storage.local.set({ token: body.token });
    el('code').value = '';
    chrome.runtime.sendMessage({ type: 'refresh' });
    refresh();
  } catch (e) { el('error').textContent = e.message; }
  finally { el('pair').disabled = false; }
});
el('disconnect').addEventListener('click', async () => { await chrome.storage.local.remove('token'); refresh(); });
refresh();
