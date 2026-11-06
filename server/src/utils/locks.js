// Serialize mutations of one resource within this API process; release on errors too.
const pending = new Map();
export async function exclusive(key, fn) {
  const previous = pending.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  pending.set(key, current);
  await previous;
  try { return await fn(); }
  finally { release(); if (pending.get(key) === current) pending.delete(key); }
}
