import test from 'node:test';
import assert from 'node:assert/strict';
process.env.JWT_SECRET = 'x'; process.env.JWT_REFRESH_SECRET = 'y';
const { default: app } = await import('../src/app.js');

test('health endpoint and auth guard work', async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  assert.equal((await (await fetch(base + '/health')).json()).ok, true);
  assert.equal((await fetch(base + '/subjects')).status, 401);
  assert.equal((await fetch(base + '/analytics/summary')).status, 401);
  assert.equal((await fetch(base + '/nope')).status, 401); // guarded before 404
  server.close();
});
