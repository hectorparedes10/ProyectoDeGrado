import React from 'react';
import { Link } from 'react-router-dom';

export default function Navbar({ rolActual, setRolActual }) {
  return (
    <nav className="glass-card" style={{ margin: '15px 20px', padding: '15px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: '12px', height: '12px', background: '#00f0ff', borderRadius: '50%', boxShadow: '0 0 10px #00f0ff' }}></div>
        <Link to="/" style={{ textDecoration: 'none', color: '#fff' }}>
          <span className="brand-title" style={{ fontSize: '1.4rem', color: '#00f0ff', textShadow: '0 0 10px rgba(0,240,255,0.5)' }}>CYBER</span>
          <span className="brand-title" style={{ fontSize: '1.4rem', color: '#fff' }}>SPORTS</span>
        </Link>
      </div>

      <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
        <Link to="/" style={{ color: '#f0f6fc', textDecoration: 'none', fontWeight: '600' }}>[ INICIO ]</Link>
        <Link to="/campeonatos" style={{ color: '#f0f6fc', textDecoration: 'none', fontWeight: '600' }}>[ CAMPEONATOS ]</Link>
        <Link to="/equipos" style={{ color: '#f0f6fc', textDecoration: 'none', fontWeight: '600' }}>[ EQUIPOS ]</Link>
        
        {rolActual && (
          <span style={{ padding: '4px 12px', border: '1px solid #7000ff', borderRadius: '20px', fontSize: '0.85rem', color: '#00f0ff', background: 'rgba(112,0,255,0.2)' }}>
            ROL: {rolActual.toUpperCase()}
          </span>
        )}
      </div>
    </nav>
  );
}
