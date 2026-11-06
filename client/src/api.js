import axios from 'axios';
import { useAuth } from './store';

export const API = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/+$/, '');
export const SOCKET_URL = API.replace(/\/api\/?$/, '');
const api = axios.create({ baseURL: API });

api.interceptors.request.use((c) => {
  const t = useAuth.getState().accessToken;
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

let refreshing = null;
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const { config, response } = err;
    const rt = useAuth.getState().refreshToken;
    if (response?.status === 401 && config && !config._retry && rt && !['/auth/login', '/auth/register', '/auth/refresh'].some((path) => config.url.includes(path))) {
      config._retry = true;
      try {
        refreshing = refreshing || axios.post(`${API}/auth/refresh`, { refreshToken: rt }).finally(() => (refreshing = null));
        const { data } = await refreshing;
        if (useAuth.getState().refreshToken !== rt) return Promise.reject(err);
        useAuth.getState().setAuth({ accessToken: data.accessToken });
        config.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(config);
      } catch {
        if (useAuth.getState().refreshToken === rt) useAuth.getState().logout();
      }
    }
    return Promise.reject(err);
  }
);

export const errMsg = (e) => {
  if (e?.response?.data?.message) return e.response.data.message;
  if (e?.code === 'ERR_NETWORK' || e?.message === 'Network Error')
    return `Cannot reach the server at ${API}. Make sure the API is running (cd server && npm run dev) and MongoDB is connected.`;
  return e?.message || 'Something went wrong';
};
export default api;
