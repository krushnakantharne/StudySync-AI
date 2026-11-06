import { Router } from 'express';
import crypto from 'node:crypto';
import { auth } from '../middleware/auth.js';
import { ActivityCredential, ActivityEvent, StudySession } from '../models.js';
import { activitySummary } from '../services/activity.js';
import { CATEGORIES, classify, normalDomain, validActivityInterval } from '../services/activityCore.js';
import { exclusive } from '../utils/locks.js';
import { httpError } from '../middleware/error.js';

const r = Router();
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const newSecret = () => crypto.randomBytes(24).toString('base64url');
const fail = (msg, status = 400) => { throw httpError(status, msg); };

// Extension-only endpoints accept a scoped token, NOT a web access/refresh token.
async function extensionAuth(req, res, next) {
  const t = /^Bearer (.+)$/.exec(req.get('Authorization') || '')?.[1];
  if (!t || !/^[A-Za-z0-9_-]{32,100}$/.test(t)) return res.status(401).json({ message: 'Extension not paired' });
  try {
    const credential = await ActivityCredential.findOne({ secretHash: hash(t), type: 'extension', expiresAt: { $gt: new Date() } }).populate('userId');
    if (!credential?.userId) return res.status(401).json({ message: 'Extension token expired or revoked' });
    req.user = credential.userId;
    next();
  } catch (e) { next(e); }
}

r.post('/pair', async (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!/^[A-Za-z0-9_-]{32,100}$/.test(code)) fail('Invalid pairing code');
  const cred = await ActivityCredential.findOneAndDelete({ type: 'pair', secretHash: hash(code), expiresAt: { $gt: new Date() } });
  if (!cred) fail('Code expired or already used', 401);
  const token = newSecret();
  await ActivityCredential.create({ userId: cred.userId, type: 'extension', secretHash: hash(token), expiresAt: new Date(Date.now() + 30 * 864e5) });
  res.json({ token, expiresInDays: 30 });
});

r.get('/state', extensionAuth, async (req, res) => {
  if (!req.user.activityConsent) return res.json({ active: false, reason: 'Consent is off' });
  const session = await StudySession.findOne({ userId: req.user._id, endTime: null, activityTracking: true }).sort({ startTime: -1 });
  return res.json(session ? { active: !session.activityPaused, sessionId: String(session._id), paused: !!session.activityPaused } : { active: false });
});

r.post('/events', extensionAuth, async (req, res) => {
  const { sessionId, eventId, from, to, domain, idle } = req.body || {};
  if (typeof eventId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(eventId)) fail('Invalid event ID');
  if (typeof sessionId !== 'string' || !/^[a-f0-9]{24}$/i.test(sessionId)) fail('Invalid session');
  if (typeof idle !== 'boolean') fail('Idle flag required');
  const normalized = idle ? null : normalDomain(domain);
  if (!idle && domain != null && !normalized) fail('Invalid domain');
  const a = new Date(from), b = new Date(to);
  if (!validActivityInterval(from, to)) fail('Invalid activity interval');
  const event = await exclusive(`activity:${sessionId}`, async () => {
    const previous = await ActivityEvent.findOne({ userId: req.user._id, eventId });
    if (previous) return { duplicate: true };
    const s = await StudySession.findOne({ _id: sessionId, userId: req.user._id, activityTracking: true });
    if (!req.user.activityConsent || !s || s.endTime || s.activityPaused || a < s.startTime || (s.activityPauseAt && a < s.activityPauseAt)) fail('No active, consented session', 409);
    const overlap = await ActivityEvent.exists({ sessionId: s._id, from: { $lt: b }, to: { $gt: a } });
    if (overlap) fail('Activity interval overlaps an existing event', 409);
    try {
      await ActivityEvent.create({ userId: req.user._id, sessionId: s._id, eventId, from: a, to: b, domain: normalized, category: idle ? 'Idle' : classify(normalized, req.user.activityRules || []) });
    } catch (e) { if (e.code === 11000) return { duplicate: true }; throw e; }
    return { accepted: true };
  });
  res.status(event.duplicate ? 200 : 201).json(event);
});

// All remaining routes use the unchanged standard application auth.
r.use(auth);
r.get('/config', async (req, res) => res.json({ consent: !!req.user.activityConsent, rules: req.user.activityRules || [], categories: CATEGORIES }));
r.put('/consent', async (req, res) => {
  if (typeof req.body?.enabled !== 'boolean') fail('enabled must be boolean');
  req.user.activityConsent = req.body.enabled;
  await req.user.save();
  if (!req.body.enabled) await StudySession.updateMany({ userId: req.user._id, endTime: null, activityTracking: true }, { activityPaused: true, activityPauseAt: new Date() });
  res.json({ consent: req.user.activityConsent });
});
r.post('/pair-code', async (req, res) => {
  if (!req.user.activityConsent) fail('Enable monitoring consent before pairing', 403);
  await ActivityCredential.deleteMany({ userId: req.user._id, type: 'pair' });
  const code = newSecret();
  await ActivityCredential.create({ userId: req.user._id, secretHash: hash(code), type: 'pair', expiresAt: new Date(Date.now() + 10 * 60_000) });
  res.json({ code, expiresInMinutes: 10 });
});
r.delete('/history', async (req, res) => {
  await ActivityEvent.deleteMany({ userId: req.user._id });
  res.json({ ok: true });
});
r.post('/revoke', async (req, res) => {
  await ActivityCredential.deleteMany({ userId: req.user._id, type: 'extension' });
  res.json({ ok: true });
});
r.put('/rules', async (req, res) => {
  const { domain, category } = req.body || {};
  const d = normalDomain(domain);
  if (!d || !CATEGORIES.includes(category)) fail('Invalid domain or category');
  const rules = (req.user.activityRules || []).filter((r) => r.domain !== d);
  if (rules.length >= 50) fail('Maximum 50 custom rules');
  rules.push({ domain: d, category });
  req.user.activityRules = rules;
  await req.user.save();
  res.json({ rules });
});
r.delete('/rules/:domain', async (req, res) => {
  const d = normalDomain(req.params.domain);
  if (!d) fail('Invalid domain');
  req.user.activityRules = (req.user.activityRules || []).filter((r) => r.domain !== d);
  await req.user.save();
  res.json({ rules: req.user.activityRules });
});
r.get('/summary', async (req, res) => {
  if (req.query.sessionId && !/^[a-f0-9]{24}$/i.test(req.query.sessionId)) fail('Invalid session');
  if (req.query.sessionId && !await StudySession.exists({ _id: req.query.sessionId, userId: req.user._id })) fail('Session not found', 404);
  res.json(await activitySummary(req.user, req.query.sessionId || null));
});
r.put('/sessions/:id/pause', async (req, res) => exclusive(`activity:${req.params.id}`, async () => {
  if (typeof req.body?.paused !== 'boolean') fail('paused must be boolean');
  const s = await StudySession.findOne({ _id: req.params.id, userId: req.user._id, endTime: null, activityTracking: true });
  if (!s) fail('Monitored session not found', 404);
  if (!req.user.activityConsent && req.body.paused === false) fail('Monitoring consent is off', 403);
  s.activityPaused = req.body.paused;
  s.activityPauseAt = new Date();
  await s.save();
  res.json({ paused: s.activityPaused });
}));
export default r;
