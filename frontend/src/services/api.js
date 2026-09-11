import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env?.VITE_API_URL || '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});
const isPublicAuth = url => ['/auth/login', '/auth/forgot-password', '/auth/reset-password'].includes(url);
API.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token && !config.headers.Authorization && !isPublicAuth(config.url)) config.headers.Authorization = 'Bearer ' + token;
  config._arenaToken = config.headers.Authorization?.replace(/^Bearer /, '') || null;
  return config;
});
API.interceptors.response.use(response => response, error => {
  if (error.response?.status===401 && !isPublicAuth(error.config?.url) && error.config?._arenaToken && error.config._arenaToken===localStorage.getItem('token')) {
    window.dispatchEvent(new Event('arena:session-expired'));
  }
  return Promise.reject(error);
});
export default API;
