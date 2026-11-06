import { create } from 'zustand';

function readSaved() {
  try {
    const value = JSON.parse(localStorage.getItem('auth') || 'null');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
const saved = readSaved();
const persist = (value) => { try { localStorage.setItem('auth', JSON.stringify(value)); } catch { /* Session remains usable without storage. */ } };
export const useAuth = create((set, get) => ({
  user: saved.user || null,
  accessToken: saved.accessToken || null,
  refreshToken: saved.refreshToken || null,
  setAuth: (patch) => {
    const { user, accessToken, refreshToken } = get();
    persist({ user, accessToken, refreshToken, ...patch });
    set(patch);
  },
  logout: () => {
    try { localStorage.removeItem('auth'); } catch { /* Ignore unavailable storage. */ }
    set({ user: null, accessToken: null, refreshToken: null });
  },
}));
