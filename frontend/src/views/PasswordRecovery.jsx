import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/layout/AuthLayout';
import Icon from '../components/ui/Icon';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const messageFrom = error => error.response?.data?.error || 'No pudimos conectar con el servidor. Inténtalo de nuevo.';
export function ForgotPassword() {
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  useEffect(() => { document.title = 'Recuperar contraseña · ARENA FUTSAL SYSTEM'; }, []);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try { setSent((await api.post('/auth/forgot-password', { usuario: email.trim() })).data.message); }
    catch (err) { setError(messageFrom(err)); }
    finally { setBusy(false); }
  }
  return <AuthLayout title={sent ? 'Solicitud enviada' : '¿Olvidaste tu contraseña?'} description={sent ? 'Espera la aprobación del administrador.' : 'Ingresa tu usuario para solicitar al administrador que restablezca tu acceso.'} icon={sent ? 'check' : 'lock'}>
    {error && <div className="alert" role="alert">{error}</div>}
    {sent ? <><div className="alert info" role="status">{sent}</div><p className="recovery-note">La clave temporal vence 24 horas después de la aprobación. Al entrar, deberás escribir y confirmar una contraseña nueva.</p></> : <form onSubmit={submit} aria-busy={busy}>
      <label className="field"><span>Usuario (correo de acceso)</span><input type="email" autoComplete="username" maxLength={150} value={email} onChange={event => setEmail(event.target.value)} placeholder="tu@correo.com" required disabled={busy} /></label>
      <button className="button primary" type="submit" disabled={busy}>{busy ? 'Enviando solicitud…' : 'Solicitar recuperación'}<Icon name="arrow" size={18} /></button>
    </form>}
    <Link className="auth-back" to="/login" state={{ notice: sent ? 'Después de la aprobación, ingresa con tu usuario y la contraseña temporal 12345678.' : undefined }}><Icon name="back" size={18} />Volver a iniciar sesión</Link>
  </AuthLayout>;
}

function PasswordChangeDialog() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const dialog = useRef(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    document.title = 'Nueva contraseña · ARENA FUTSAL SYSTEM';
    const element = dialog.current;
    if (!element.open) element.showModal();
    return () => element.close();
  }, []);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (password !== confirmation) { setError('Las contraseñas no coinciden.'); return; }
    if (password === '12345678') { setError('Elige una contraseña distinta de la temporal.'); return; }
    const previousToken = localStorage.getItem('token');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/change-password', { password, confirmPassword: confirmation });
      if (previousToken !== localStorage.getItem('token')) return;
      login(data); setPassword(''); setConfirmation('');
      navigate('/campeonatos', { replace: true });
    } catch (err) { setError(messageFrom(err)); }
    finally { setBusy(false); }
  }
  async function leave() {
    setBusy(true);
    await logout().catch(() => {});
    navigate('/login', { replace: true });
  }
  return <AuthLayout title="Crea tu nueva contraseña" description="Completa el cambio para entrar a ARENA FUTSAL SYSTEM.">
    <dialog ref={dialog} className="dialog password-change-dialog" aria-labelledby="password-change-title" aria-describedby="password-change-description" onCancel={event => event.preventDefault()}>
      <div className="dialog-header"><h2 id="password-change-title">Establecer nueva contraseña</h2><Icon name="lock" /></div>
      <form onSubmit={submit} aria-busy={busy}>
        <div className="dialog-body password-change-fields">
          <p id="password-change-description">Tu recuperación fue aprobada. Para continuar, crea una contraseña personal para <strong>{user.email}</strong>.</p>
          {error && <div className="alert" role="alert">{error}</div>}
          <label className="field"><span>Nueva contraseña</span><input type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} required disabled={busy} autoFocus /></label>
          <label className="field"><span>Confirmar nueva contraseña</span><input type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} required disabled={busy} /></label>
          <label className="password-visibility"><input type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)} />Mostrar contraseñas</label>
          <p className="field-help">Usa entre 8 y 128 caracteres. El administrador no podrá ver tu contraseña nueva.</p>
        </div>
        <div className="dialog-footer"><button className="button" type="button" onClick={leave} disabled={busy}>Cerrar sesión</button><button className="button primary" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar y entrar'}</button></div>
      </form>
    </dialog>
  </AuthLayout>;
}

export function ChangePassword() {
  const { user, loading, error, refresh } = useAuth();
  if (loading) return <main className="session-screen" role="status">Verificando sesión…</main>;
  if (error) return <main className="session-screen"><div className="panel"><p role="alert">{error}</p><button className="button primary" onClick={refresh}>Volver a intentar</button></div></main>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.requiresPasswordChange) return <Navigate to="/campeonatos" replace />;
  return <PasswordChangeDialog key={user.id} />;
}
