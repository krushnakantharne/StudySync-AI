import jwt from 'jsonwebtoken';
import { User } from '../models.js';

export const signTokens = (id) => ({
  accessToken: jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '15m' }),
  refreshToken: jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' }),
});

export async function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Missing token' });
  let id;
  try { ({ id } = jwt.verify(token, process.env.JWT_SECRET)); }
  catch { return res.status(401).json({ message: 'Invalid or expired token' }); }
  try {
    req.user = await User.findById(id);
    if (!req.user) return res.status(401).json({ message: 'User not found' });
    next();
  } catch (e) { next(e); }
}
