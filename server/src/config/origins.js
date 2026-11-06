export function allowedOrigin(origin, cb) {
  const allowed = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  const local = process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
  // Chrome extension uses scoped, revocable tokens on /api/activity only.
  const extension = /^chrome-extension:\/\/[a-p]{32}$/.test(origin || '');
  cb(null, !origin || allowed.includes(origin) || local || extension);
}
