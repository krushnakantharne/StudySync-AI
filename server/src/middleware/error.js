export const httpError = (status, message) => Object.assign(new Error(message), { status });

export function errorHandler(err, req, res, _next) {
  let status = err.status || 500;
  let message = err.message || 'Server error';
  if (err.name === 'ValidationError') { status = 400; message = Object.values(err.errors).map((e) => e.message).join(', '); }
  if (err.name === 'CastError') { status = 400; message = 'Invalid id'; }
  if (err.code === 11000) { status = 409; message = 'That email is already registered'; }
  if (status === 500) console.error(err);
  res.status(status).json({ message });
}

// numeric validator: returns number or throws 400
export function num(v, min, max, label) {
  const n = Number(v);
  if (!['number', 'string'].includes(typeof v) || String(v).trim() === '' || !Number.isFinite(n) || n < min || n > max) throw httpError(400, `${label} must be between ${min} and ${max}`);
  return n;
}

export function integer(v, min, max, label) {
  const n = num(v, min, max, label);
  if (!Number.isInteger(n)) throw httpError(400, `${label} must be a whole number`);
  return n;
}

export function text(v, label) {
  if (typeof v !== 'string' || !v.trim()) throw httpError(400, `${label} is required`);
  return v.trim();
}
