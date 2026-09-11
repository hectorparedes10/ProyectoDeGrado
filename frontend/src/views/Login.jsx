import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { loginService } from '../services/auth.service';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/layout/AuthLayout';
import Icon from '../components/ui/Icon';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => { document.title = 'Iniciar sesión · ARENA FUTSAL SYSTEM'; }, []);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const data = await loginService(email.trim(), password);
      login(data);
      navigate(data.user.requiresPasswordChange ? '/cambiar-contrasena' : '/campeonatos', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || (err.code === 'ERR_NETWORK' ? 'No pudimos conectar con el servidor. Inténtalo de nuevo.' : err.message) || 'No pudimos iniciar sesión.');
    } finally { setBusy(false); }
  }
  if (user) return <Navigate to={user.requiresPasswordChange ? '/cambiar-contrasena' : '/campeonatos'} replace />;
  return <AuthLayout title="Inicia sesión" description="Ingresa tus datos para acceder al panel.">
      {error && <div className="alert" role="alert">{error}</div>}
      {location.state?.notice && <div className="alert info" role="status">{location.state.notice}</div>}
      <form onSubmit={submit}>
        <label className="field"><span>Correo electrónico</span><input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" required /></label>
        <label className="field"><span>Contraseña</span><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Ingresa tu contraseña" required /></label>
        <Link className="auth-forgot" to="/recuperar-contrasena" state={{ email }}>¿Olvidaste tu contraseña?</Link>
        <button className="button primary" type="submit" disabled={busy}>{busy ? 'Ingresando…' : 'Iniciar sesión'}<Icon name="arrow" size={18} /></button>
      </form><p className="login-help">Si necesitas acceso, contacta al administrador del campeonato.</p>
  </AuthLayout>;
}
