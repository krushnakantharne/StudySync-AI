import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { DateTime } from 'luxon';
import { User } from '../models.js';
import { auth, signTokens } from '../middleware/auth.js';
import { httpError, integer, num, text } from '../middleware/error.js';

const r = Router();
const safe = (u) => { const o = u.toObject(); delete o.passwordHash; return o; };
const validZone = (tz) => typeof tz === 'string' && tz.trim() !== '' && DateTime.local().setZone(tz).isValid;

r.post('/register', async (req, res) => {
  const { fullName, email, password, timezone = 'Asia/Kolkata', dailyGoalMins = 180 } = req.body;
  const name = text(fullName, 'Name');
  const normalizedEmail = text(email, 'Email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw httpError(400, 'Invalid email');
  if (typeof password !== 'string' || Buffer.byteLength(password) > 72) throw httpError(400, 'Password must be a string of at most 72 bytes');
  if (password.length < 6) throw httpError(400, 'Password must be at least 6 characters');
  if (!validZone(timezone)) throw httpError(400, 'Invalid timezone');
  const user = await User.create({
    fullName: name, email: normalizedEmail, timezone,
    dailyGoalMins: num(dailyGoalMins, 15, 960, 'Daily goal'),
    passwordHash: await bcrypt.hash(password, 12),
  });
  res.status(201).json({ user: safe(user), ...signTokens(user._id) });
});

r.post('/login', async (req, res) => {
  const email = text(req.body.email, 'Email').toLowerCase();
  if (typeof req.body.password !== 'string') throw httpError(400, 'Password is required');
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) throw httpError(401, 'Wrong email or password');
  res.json({ user: safe(user), ...signTokens(user._id) });
});

r.post('/refresh', async (req, res) => {
  try {
    const { id } = jwt.verify(req.body.refreshToken, process.env.JWT_REFRESH_SECRET);
    if (!(await User.exists({ _id: id }))) throw new Error('User not found');
    res.json({ accessToken: signTokens(id).accessToken });
  } catch { throw httpError(401, 'Session expired, please log in again'); }
});

r.get('/me', auth, (req, res) => res.json(safe(req.user)));

r.put('/me', auth, async (req, res) => {
  const b = req.body, u = req.user;
  if (b.fullName !== undefined) u.fullName = text(b.fullName, 'Name');
  if (b.timezone !== undefined) { if (!validZone(b.timezone)) throw httpError(400, 'Invalid timezone'); u.timezone = b.timezone; }
  if (b.dailyGoalMins != null) u.dailyGoalMins = integer(b.dailyGoalMins, 15, 960, 'Daily goal');
  if (b.maxSessionMins != null) u.maxSessionMins = integer(b.maxSessionMins, 20, 90, 'Max session length');
  if (b.preferredStartHour != null) u.preferredStartHour = integer(b.preferredStartHour, 0, 22, 'Start hour');
  if (b.preferredEndHour != null) u.preferredEndHour = integer(b.preferredEndHour, 1, 24, 'End hour');
  if (u.preferredEndHour <= u.preferredStartHour) throw httpError(400, 'End hour must be after start hour');
  if (b.schedulerMode) { if (!['auto', 'heuristic', 'rl'].includes(b.schedulerMode)) throw httpError(400, 'Invalid mode'); u.schedulerMode = b.schedulerMode; }
  await u.save();
  res.json(safe(u));
});

export default r;
