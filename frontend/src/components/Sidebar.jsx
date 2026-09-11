import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';

export default function Sidebar({ usuario, setUsuarioLogueado }) {
  const navigate = useNavigate();
  const location = useLocation();

  const logout = () => {
    setUsuarioLogueado(null);
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  return (
    <aside className="glass-card" style={{ width: '260px', height: 'calc(100vh - 30px)', margin: '15px 0 15px 15px', padding: '25px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: '16px' }}>
      <div>
        {/* Brand Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '40px', paddingBottom: '15px', borderBottom: '1px solid rgba(0,240,255,0.2)' }}>
          <div style={{ width: '12px', height: '12px', background: '#00f0ff', borderRadius: '50%', boxShadow: '0 0 10px #00f0ff' }}></div>
          <div>
            <span className="brand-title" style={{ fontSize: '1.2rem', color: '#00f0ff' }}>CYBER</span>
            <span className="brand-title" style={{ fontSize: '1.2rem', color: '#fff' }}>SPORTS</span>
          </div>
        </div>

        {/* Info Usuario Logueado */}
        {usuario && (
          <div style={{ background: 'rgba(112, 0, 255, 0.15)', border: '1px solid var(--neon-purple)', padding: '12px', borderRadius: '8px', marginBottom: '25px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block' }}>USUARIO ACTIVO</span>
            <strong style={{ color: '#fff', fontSize: '0.95rem' }}>{usuario.nombre}</strong>
            <div style={{ marginTop: '5px', fontSize: '0.75rem', color: 'var(--neon-cyan)', fontWeight: 'bold' }}>
              [{usuario.rol.toUpperCase()}]
            </div>
          </div>
        )}

        {/* Menú de Navegación según Rol */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {(!usuario || usuario.rol === 'admin' || usuario.rol === 'espectador') && (
            <Link
              to="/campeonatos"
              style={{
                padding: '12px 15px',
                borderRadius: '8px',
                textDecoration: 'none',
                color: isActive('/campeonatos') ? '#00f0ff' : 'var(--text-dim)',
                background: isActive('/campeonatos') ? 'rgba(0,240,255,0.1)' : 'transparent',
                borderLeft: isActive('/campeonatos') ? '3px solid #00f0ff' : '3px solid transparent',
                fontWeight: '600'
              }}
            >
              🏆 Campeonatos
            </Link>
          )}

          {(!usuario || usuario.rol === 'admin' || usuario.rol === 'delegado') && (
            <Link
              to="/equipos"
              style={{
                padding: '12px 15px',
                borderRadius: '8px',
                textDecoration: 'none',
                color: isActive('/equipos') ? '#00f0ff' : 'var(--text-dim)',
                background: isActive('/equipos') ? 'rgba(0,240,255,0.1)' : 'transparent',
                borderLeft: isActive('/equipos') ? '3px solid #00f0ff' : '3px solid transparent',
                fontWeight: '600'
              }}
            >
              🛡️ Equipos y Jugadores
            </Link>
          )}

          {(!usuario || usuario.rol === 'admin' || usuario.rol === 'planillero') && (
            <Link
              to="/asistencia"
              style={{
                padding: '12px 15px',
                borderRadius: '8px',
                textDecoration: 'none',
                color: isActive('/asistencia') ? '#00f0ff' : 'var(--text-dim)',
                background: isActive('/asistencia') ? 'rgba(0,240,255,0.1)' : 'transparent',
                borderLeft: isActive('/asistencia') ? '3px solid #00f0ff' : '3px solid transparent',
                fontWeight: '600'
              }}
            >
              🔍 Biometría / Planilla
            </Link>
          )}
        </nav>
      </div>

      {/* Botón Logout */}
      {usuario ? (
        <button onClick={logout} className="btn-cyber" style={{ background: 'rgba(255, 0, 127, 0.2)', border: '1px solid #ff007f', color: '#ff007f', fontSize: '0.8rem' }}>
          CERRAR SESIÓN
        </button>
      ) : (
        <Link to="/login" className="btn-cyber" style={{ textDecoration: 'none', textAlign: 'center', fontSize: '0.8rem' }}>
          INICIAR SESIÓN
        </Link>
      )}
    </aside>
  );
}
