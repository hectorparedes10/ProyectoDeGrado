import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const clearSession = useCallback(() => {
    generation.current++;
    localStorage.removeItem('token'); localStorage.removeItem('user');
    setUser(null); setError(''); setLoading(false);
  }, []);
  const refresh = useCallback(async () => {
    const token = localStorage.getItem('token');
    const request = ++generation.current;
    const current = () => generation.current===request && localStorage.getItem('token')===token;
    if (!token) { setUser(null); setError(''); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/auth/me');
      if (!current()) return;
      setUser(data.user); localStorage.setItem('user', JSON.stringify(data.user));
    } catch (err) {
      if (!current()) return;
      if (err.response?.status===401) clearSession();
      else setError('No pudimos verificar tu sesión. Comprueba que el servidor esté disponible.');
    } finally { if (current()) setLoading(false); }
  }, [clearSession]);
  useEffect(() => {
    refresh();
    const sync = event => { if (!event.key || ['token','user'].includes(event.key)) refresh(); };
    window.addEventListener('storage', sync);
    window.addEventListener('arena:session-expired', clearSession);
    return () => { generation.current++; window.removeEventListener('storage', sync); window.removeEventListener('arena:session-expired', clearSession); };
  }, [refresh, clearSession]);
  function login(data) {
    if (!data?.success || !data?.user?.id || !data?.token) throw new Error('El servidor no devolvió una sesión válida.');
    generation.current++;
    localStorage.setItem('token', data.token); localStorage.setItem('user', JSON.stringify(data.user));
    setError(''); setLoading(false); setUser(data.user);
  }
  async function logout() {
    const token = localStorage.getItem('token');
    try { await api.post('/auth/logout'); }
    finally { if (localStorage.getItem('token')===token) clearSession(); }
  }
  const can = permission => Boolean(user && !user.requiresPasswordChange && user.permissions?.includes(permission));
  return <AuthContext.Provider value={{ user, login, logout, loading, error, refresh, can }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
