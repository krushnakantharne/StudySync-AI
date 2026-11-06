// Focus fusion: Focus(t) = 0.40*Keystroke + 0.35*AppSwitch + 0.25*Webcam
import { FOCUS_W } from '../config/constants.js';

const clamp = (n) => Math.min(100, Math.max(0, n));

export function fuse({ keystroke, appSwitch, webcam }) {
  const hasCam = webcam !== null && webcam !== undefined;
  // If the webcam is off, renormalise the remaining weights (0.40/0.75, 0.35/0.75).
  const scale = hasCam ? 1 : 1 / (FOCUS_W.keystroke + FOCUS_W.appSwitch);
  const parts = {
    keystroke: FOCUS_W.keystroke * scale * clamp(Number(keystroke) || 0),
    appSwitch: FOCUS_W.appSwitch * scale * clamp(Number(appSwitch) || 0),
    webcam: hasCam ? FOCUS_W.webcam * clamp(Number(webcam) || 0) : 0,
  };
  const composite = Math.round(clamp(parts.keystroke + parts.appSwitch + parts.webcam) * 100) / 100;
  const dominantSignal = Object.entries(parts).sort((a, b) => b[1] - a[1])[0][0];
  return { composite, dominantSignal };
}
