import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RequestsProvider } from './context/RequestsContext';
import AppLayout from './components/layout/AppLayout';
import CampeonatosView from './views/CampeonatosView';
import GestionCampeonato from './views/GestionCampeonato';
import UsuariosView from './views/UsuariosView';
import SolicitudesView from './views/SolicitudesView';
import HistorialView from './views/HistorialView';
import Login from './views/Login';
import { ForgotPassword, ChangePassword } from './views/PasswordRecovery';

function SessionRoute() {
  const { user, loading, error, refresh } = useAuth();
  if (loading) return <main className="session-screen" role="status">Verificando sesión…</main>;
  if (error) return <main className="session-screen"><div className="panel"><p role="alert">{error}</p><button className="button primary" onClick={refresh}>Volver a intentar</button></div></main>;
  if (user?.requiresPasswordChange) return <Navigate to="/cambiar-contrasena" replace />;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
function PermissionRoute({ permission, roles }) {
  const { user, can } = useAuth();
  return (permission ? can(permission) : roles.includes(user?.role)) ? <Outlet /> : <Navigate to="/campeonatos" replace />;
}
export default function App() {
  return <AuthProvider><RequestsProvider><BrowserRouter><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/recuperar-contrasena" element={<ForgotPassword />} />
    <Route path="/restablecer-contrasena" element={<Navigate to="/recuperar-contrasena" replace />} />
    <Route path="/cambiar-contrasena" element={<ChangePassword />} />
    <Route element={<SessionRoute />}>
      <Route element={<AppLayout />}>
        <Route path="/campeonatos" element={<CampeonatosView />} />
        <Route path="/campeonatos/:id/gestion" element={<GestionCampeonato />} />
        <Route element={<PermissionRoute permission="usuarios:gestionar" />}>
          <Route path="/usuarios" element={<UsuariosView />} />
        </Route>
        <Route element={<PermissionRoute permission="auditoria:ver" />}>
          <Route path="/historial" element={<HistorialView />} />
        </Route>
        <Route element={<PermissionRoute roles={['admin','mesa']} />}>
          <Route path="/solicitudes" element={<SolicitudesView />} />
        </Route>
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/campeonatos" replace />} />
  </Routes></BrowserRouter></RequestsProvider></AuthProvider>;
}
