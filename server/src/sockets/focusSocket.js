// Focus writes are serialized per session and acknowledged after buffering/persistence.
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { FocusLog, StudySession } from '../models.js';
import { fuse } from '../services/focus.js';
import { integer, num } from '../middleware/error.js';
import { allowedOrigin } from '../config/origins.js';
import { exclusive } from '../utils/locks.js';

const buffers = new Map();

async function flush(id) {
  const buf = buffers.get(String(id));
  if (!buf?.length) return;
  // Upserts make retries safe if a database error occurs after a partial write.
  await FocusLog.bulkWrite(buf.map((doc) => ({ replaceOne: {
    filter: { sessionId: doc.sessionId, minuteIndex: doc.minuteIndex }, replacement: doc, upsert: true,
  } })));
  buffers.delete(String(id));
}

export function flushSession(id) {
  return exclusive(`focus:${id}`, () => flush(id));
}

export function initSockets(httpServer) {
  const io = new Server(httpServer, { cors: { origin: allowedOrigin } });
  io.use((socket, next) => {
    try { socket.userId = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET).id; next(); }
    catch { next(new Error('unauthorized')); }
  });
  io.on('connection', (socket) => {
    const owned = new Set();
    socket.on('focus:update', async (m = {}, ack = () => {}) => {
      try {
        if (!m || typeof m !== 'object') throw new Error('Invalid focus payload');
        const sid = String(m.sessionId);
        await exclusive(`focus:${sid}`, async () => {
          if (!(await StudySession.exists({ _id: sid, userId: socket.userId, endTime: null }))) throw new Error('Active session not found');
          const minuteIndex = integer(m.minuteIndex, 0, 100000, 'Minute index');
          const keystroke = num(m.keystroke, 0, 100, 'Keystroke score');
          const appSwitch = num(m.appSwitch, 0, 100, 'Tab switch score');
          const webcam = m.webcam == null ? null : num(m.webcam, 0, 100, 'Webcam score');
          const { composite, dominantSignal } = fuse({ keystroke, appSwitch, webcam });
          const buf = buffers.get(sid) || [];
          const doc = { sessionId: sid, minuteIndex, keystrokeScore: keystroke, appSwitchScore: appSwitch, webcamScore: webcam, compositeScore: composite, dominantSignal };
          const index = buf.findIndex((d) => d.minuteIndex === minuteIndex);
          if (index < 0) buf.push(doc); else buf[index] = doc;
          buffers.set(sid, buf);
          owned.add(sid);
          if (buf.length >= 10) await flush(sid);
          socket.emit('focus:score', { minuteIndex, composite, dominantSignal });
          if (typeof ack === 'function') ack({ ok: true });
        });
      } catch (e) { if (typeof ack === 'function') ack({ ok: false, message: e.message }); }
    });
    socket.on('session:end', async (id, ack = () => {}) => {
      try {
        if (!(await StudySession.exists({ _id: id, userId: socket.userId }))) throw new Error('Session not found');
        await flushSession(id);
        owned.delete(String(id));
        if (typeof ack === 'function') ack({ ok: true });
      } catch (e) { if (typeof ack === 'function') ack({ ok: false, message: e.message }); }
    });
    socket.on('disconnect', () => {
      for (const id of owned) flushSession(id).catch((e) => console.error('focus flush failed', e.message));
    });
  });
  return io;
}
