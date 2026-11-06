// Client-side focus signals. PRIVACY: keystroke = "was any key pressed" only; app switch = a count only;
// webcam frames are classified in this browser by TensorFlow.js and are never stored or uploaded.
const FRAME_SCORE = { engaged: 100, distracted: 40, absent: 0 };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

let modelPromise = null;
function loadModel() {
  modelPromise ||= Promise.all([import('@tensorflow/tfjs'), import('@tensorflow-models/blazeface')]).then(async ([tf, bf]) => {
    await tf.ready();
    return bf.load();
  }).catch((e) => { modelPromise = null; throw e; });
  return modelPromise;
}

/** engaged / distracted / absent from BlazeFace landmarks [rightEye, leftEye, nose, mouth, rightEar, leftEar] */
export function classifyFace(faces, video) {
  if (!faces.length) return 'absent';
  const f = faces[0];
  const p = Array.isArray(f.probability) ? f.probability[0] : f.probability;
  if (p < 0.7) return 'absent';
  const [re, le, nose] = f.landmarks;
  const eyeDist = Math.hypot(re[0] - le[0], re[1] - le[1]) || 1;
  const yaw = Math.abs(nose[0] - (re[0] + le[0]) / 2) / eyeDist; // nose far from eye midpoint = head turned
  const cx = (f.topLeft[0] + f.bottomRight[0]) / 2;
  const off = Math.abs(cx - video.videoWidth / 2) / video.videoWidth;
  const width = f.bottomRight[0] - f.topLeft[0];
  return yaw > 0.35 || off > 0.3 || width < video.videoWidth * 0.12 ? 'distracted' : 'engaged';
}

export class FocusTracker {
  constructor({ windowMs = 60000, onWindow, onCamStatus = () => {} }) {
    Object.assign(this, { windowMs, onWindow, onCamStatus });
  }

  async start({ camera, videoEl }) {
    this.active = true;
    this.pending = Promise.resolve();
    this.keys = false; this.switches = 0; this.frames = []; this.idx = 0; this.lastSwitch = 0;
    this.windowStart = Date.now();
    this.onKey = () => { this.keys = true; };
    this.onSwitch = () => { const n = Date.now(); if (n - this.lastSwitch > 800) { this.switches++; this.lastSwitch = n; } };
    this.onVis = () => { if (document.hidden) this.onSwitch(); };
    document.addEventListener('keydown', this.onKey);
    window.addEventListener('blur', this.onSwitch);
    document.addEventListener('visibilitychange', this.onVis);
    if (camera && videoEl) void this.startCamera(videoEl);
    this.timer = setInterval(() => { this.flush().catch(() => {}); }, this.windowMs);
  }

  async startCamera(videoEl) {
    try {
      this.onCamStatus('loading');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
      if (!this.active) { stream.getTracks().forEach((t) => t.stop()); return; }
      this.stream = stream;
      this.video = videoEl;
      videoEl.srcObject = stream;
      await videoEl.play();
      if (!this.active) return;
      this.video = videoEl;
      const model = await loadModel();
      if (!this.active) return;
      this.model = model;
      this.onCamStatus('on');
      this.camTimer = setInterval(() => this.sample(), 5000);
      this.sample();
    } catch (e) {
      console.warn('Webcam unavailable:', e.message);
      this.stopCamera();
      if (this.active) this.onCamStatus('error');
    }
  }

  async sample() {
    if (!this.active || this.sampling || !this.model || !this.video || this.video.readyState < 2) return;
    this.sampling = true;
    try {
      const faces = await this.model.estimateFaces(this.video, false);
      if (!this.active || !this.video) return;
      const label = classifyFace(faces, this.video);
      this.frames.push(FRAME_SCORE[label]);
      this.onCamStatus('on', label);
    } catch { /* ignore a bad frame */ } finally { this.sampling = false; }
  }

  flush() {
    const webcam = this.frames.length ? Math.round(mean(this.frames)) : null;
    const payload = { minuteIndex: this.idx++, keystroke: this.keys ? 100 : 0, appSwitch: Math.max(0, 100 - 25 * this.switches), webcam };
    this.keys = false; this.switches = 0; this.frames = []; this.windowStart = Date.now();
    this.pending = this.pending.catch(() => {}).then(() => this.onWindow(payload));
    return this.pending;
  }

  stopCamera() {
    clearInterval(this.camTimer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.model = null;
  }

  async stop() {
    if (!this.active) return this.pending;
    this.active = false;
    clearInterval(this.timer);
    document.removeEventListener('keydown', this.onKey);
    window.removeEventListener('blur', this.onSwitch);
    document.removeEventListener('visibilitychange', this.onVis);
    if (Date.now() - this.windowStart > 5000) this.flush().catch(() => {}); // send the last partial window
    this.stopCamera();
    await this.pending;
  }
}
