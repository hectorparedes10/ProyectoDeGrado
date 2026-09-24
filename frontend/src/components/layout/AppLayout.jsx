import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../ui/Icon';
import { useAuth } from '../../context/AuthContext';
import { useRequests } from '../../context/RequestsContext';

export function roleLabel(role) {
  return ({ admin: 'Administrador', ADMINISTRADOR: 'Administrador', mesa: 'Mesa de control', MESA_CONTROL: 'Mesa de control', arbitro: 'Árbitro', ARBITRO: 'Árbitro' })[role] || 'Usuario';
}
export function initials(name) {
  return (name || 'ARENA FUTSAL SYSTEM').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}
export function Brand() {
  return <div className="brand"><span className="brand-mark">A<span>.</span></span><div><strong>ARENA<span>FUTSAL</span></strong><small>SYSTEM</small></div></div>;
}
export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const drawer = useRef(null);
  const { user, can, logout: endSession } = useAuth();
  const { pendingCount, championshipPendingCount, recoveryPendingCount, error: notificationError } = useRequests();
  const notificationPath = recoveryPendingCount > 0 ? '/recuperaciones' : '/solicitudes';
  const notificationLabel = recoveryPendingCount + ' recuperaciones de acceso y ' + championshipPendingCount + ' solicitudes de campeonatos pendientes';
  const section = location.pathname.startsWith('/usuarios') ? 'Usuarios' : location.pathname.startsWith('/recuperaciones') ? 'Recuperación de acceso' : location.pathname.startsWith('/solicitudes') ? 'Solicitudes' : location.pathname.startsWith('/historial') ? 'Historial' : 'Campeonatos';
  useEffect(() => {
    drawer.current?.close();
    document.title = section + ' · ARENA FUTSAL SYSTEM';
  }, [location.pathname, section]);
  async function logout() {
    await endSession().catch(() => {});
    navigate('/login', { replace: true });
  }
  function sidebar(mobile = false) {
    return <>
      <div className="sidebar-top"><Brand />{mobile && <button className="icon-button sidebar-close" onClick={() => drawer.current.close()} aria-label="Cerrar menú"><Icon name="close" /></button>}</div>
      <p className="nav-label">ADMINISTRACIÓN</p>
      <nav className="sidebar-nav" aria-label="Navegación principal">
        <NavLink to="/campeonatos" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}><Icon name="trophy" /><span>Campeonatos</span><Icon name="arrow" size={16} /></NavLink>
        {can('usuarios:gestionar') && <NavLink to="/usuarios" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}><Icon name="users" /><span>Usuarios</span><Icon name="arrow" size={16} /></NavLink>}
        {['admin','mesa'].includes(user.role) && <NavLink to="/solicitudes" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}><Icon name="bell" /><span>{user.role==='admin' ? 'Solicitudes' : 'Mis solicitudes'}</span>{championshipPendingCount>0 && <b className="nav-count">{championshipPendingCount}</b>}</NavLink>}
        {can('solicitudes:resolver') && <NavLink to="/recuperaciones" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}><Icon name="lock" /><span>Recuperación de acceso</span>{recoveryPendingCount>0 && <b className="nav-count">{recoveryPendingCount}</b>}</NavLink>}
        {can('auditoria:ver') && <NavLink to="/historial" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}><Icon name="clock" /><span>Historial de cambios</span><Icon name="arrow" size={16} /></NavLink>}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-account"><span className="avatar">{initials(user?.nombre)}</span><div><strong>{user?.nombre || 'ARENA FUTSAL SYSTEM'}</strong><small>{user ? roleLabel(user.role || user.rol) : 'Panel de administración'}</small></div></div>
        <button className="logout-button" onClick={logout}><Icon name="logout" /><span>Cerrar sesión</span></button>
        <small className="sidebar-caption">ARENA FUTSAL SYSTEM · Gestión de campeonatos</small>
      </div>
    </>;
  }
  return <div className="app-shell">
    <a className="skip-link" href="#contenido">Ir al contenido</a>
    <aside className="desktop-sidebar">{sidebar()}</aside>
    <dialog ref={drawer} className="mobile-drawer" aria-label="Menú principal" onClick={event => { if (event.target === event.currentTarget) drawer.current.close(); }}><div className="drawer-content">{sidebar(true)}</div></dialog>
    <div className="main-shell">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Abrir menú" onClick={() => drawer.current.showModal()}><Icon name="menu" /></button><span className="breadcrumb">Administración <span>/</span> <strong>{section}</strong></span></div><div className="topbar-account">{can('solicitudes:resolver') && <Link className="icon-button notification-button" to={notificationPath} aria-label={notificationError ? 'No se pudieron actualizar las notificaciones' : notificationLabel} title={notificationError || notificationLabel}><Icon name="bell" />{pendingCount>0 && <span className="notification-count">{pendingCount}</span>}{notificationError && <span className="notification-count">!</span>}</Link>}<span className="account-name">{user?.nombre || 'ARENA FUTSAL SYSTEM'}</span><span className="avatar small">{initials(user?.nombre)}</span></div></header>
      <main id="contenido" className="page-content"><Outlet /></main>
      <footer className="page-footer"><span>ARENA FUTSAL SYSTEM</span><span>Gestión deportiva</span></footer>
    </div>
  </div>;
}
