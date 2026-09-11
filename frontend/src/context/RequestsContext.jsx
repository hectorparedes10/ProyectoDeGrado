import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import api from '../services/api';

const RequestsContext = createContext(null);
export function RequestsProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({ owner: null, requests: [], recoveryRequests: [], error: '' });
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const enabled = Boolean(user && !user.requiresPasswordChange && ['admin','mesa'].includes(user.role));
  const owner = enabled ? user.id + ':' + user.role + ':' + localStorage.getItem('token') : null;
  const admin = user?.role === 'admin';
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    const token = localStorage.getItem('token');
    if (!enabled) { setState({ owner: null, requests: [], recoveryRequests: [], error: '' }); setLoading(false); return; }
    setLoading(true);
    try {
      const [championships, recoveries] = await Promise.all([api.get('/solicitudes-campeonato'), admin ? api.get('/solicitudes-recuperacion') : Promise.resolve({ data: [] })]);
      if (request===generation.current && token===localStorage.getItem('token')) setState({ owner, requests: championships.data, recoveryRequests: recoveries.data, error: '' });
    } catch (err) {
      if (request===generation.current && token===localStorage.getItem('token')) setState(old => ({ owner, requests: old.owner===owner ? old.requests : [], recoveryRequests: old.owner===owner ? old.recoveryRequests : [], error: err.response?.data?.error || 'No pudimos actualizar las solicitudes.' }));
    } finally { if (request===generation.current) setLoading(false); }
  }, [enabled, owner, admin]);
  useEffect(() => {
    refresh();
    if (!enabled) return;
    const timer = window.setInterval(refresh, 20000);
    window.addEventListener('focus', refresh);
    return () => { generation.current++; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [refresh, enabled]);
  const requests = state.owner===owner ? state.requests : [];
  const recoveryRequests = state.owner===owner ? state.recoveryRequests : [];
  const error = state.owner===owner ? state.error : '';
  const pendingCount = [...requests, ...recoveryRequests].filter(item => item.estado==='pendiente').length;
  return <RequestsContext.Provider value={{ requests, recoveryRequests, loading, error, refresh, pendingCount }}>{children}</RequestsContext.Provider>;
}
export function useRequests() { return useContext(RequestsContext); }
