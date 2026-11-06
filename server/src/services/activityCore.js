// Pure activity rules and productivity math; no database dependencies.
export const CATEGORIES = Object.freeze(['Study', 'Coding', 'Reference', 'Entertainment', 'Gaming', 'Idle', 'Unknown']);
const defaults = {
  'developer.mozilla.org': 'Reference', 'docs.python.org': 'Reference',
  'stackoverflow.com': 'Coding', 'github.com': 'Coding', 'leetcode.com': 'Coding',
  'khanacademy.org': 'Study', 'coursera.org': 'Study', 'edx.org': 'Study',
  'wikipedia.org': 'Reference', 'docs.google.com': 'Study',
  'netflix.com': 'Entertainment', 'twitch.tv': 'Entertainment',
  'steampowered.com': 'Gaming', 'roblox.com': 'Gaming',
};
export function normalDomain(value) {
  if (typeof value !== 'string') return null;
  const d = value.trim().toLowerCase().replace(/^www\./, '');
  return d.length <= 253 && /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(d) && d.includes('.') && !d.includes('..') ? d : null;
}
export function classify(domain, rules = []) {
  if (!domain) return 'Unknown';
  const match = (pattern) => domain === pattern || domain.endsWith(`.${pattern}`);
  const custom = rules.find((r) => match(r.domain));
  if (custom && CATEGORIES.includes(custom.category)) return custom.category;
  const found = Object.entries(defaults).find(([d]) => match(d));
  // youtube.com is deliberately Unknown; it may contain study or entertainment content.
  return found?.[1] || 'Unknown';
}
export const round = (v) => Math.round(v * 10) / 10;
export function durationTotals(events) {
  const totals = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const e of events) totals[e.category] += Math.max(0, Math.min(60_000, new Date(e.to) - new Date(e.from))) / 60_000;
  const studyMinutes = totals.Study + totals.Coding + totals.Reference;
  return { studyMinutes: round(studyMinutes), distractionMinutes: round(totals.Entertainment + totals.Gaming), idleMinutes: round(totals.Idle), unknownMinutes: round(totals.Unknown), breakdown: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round(v)])), totalMinutes: round(Object.values(totals).reduce((a,b)=>a+b,0)) };
}
export function weightedScore(signals) {
  // Missing learning signals are omitted and remaining weights re-normalised.
  const weights = { activity: 0.50, mastery: 0.25, review: 0.10, quiz: 0.10, topicCompletion: 0.05 };
  let total = 0, weight = 0;
  for (const [key, w] of Object.entries(weights)) {
    if (Number.isFinite(signals[key])) { total += Math.max(0, Math.min(100, signals[key])) * w; weight += w; }
  }
  return weight ? Math.round(total / weight * 10) / 10 : null;
}

/** Restrict to recent, bounded intervals. The server clock is authoritative. */
export function validActivityInterval(from, to, now = Date.now()) {
  const a = new Date(from).getTime(), b = new Date(to).getTime();
  return Number.isFinite(a) && Number.isFinite(b) && b - a >= 1000 && b - a <= 60_000 && b <= now + 5000 && a >= now - 120_000;
}
export const intervalsOverlap = (a, b, c, d) => new Date(a) < new Date(d) && new Date(b) > new Date(c);
