import React, { useState, useEffect } from 'react';
import { obtenerCampeonatosService } from '../services/campeonato.service';
import { generarFixtureService, obtenerPartidosPorCampeonato } from '../services/partido.service';

export default function Fixture() {
  const [campeonatos, setCampeonatos] = useState([]);
  const [campeonatoSel, setCampeonatoSel] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [partidos, setPartidos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    cargarCampeonatos();
  }, []);

  const cargarCampeonatos = async () => {
    try {
      const res = await obtenerCampeonatosService();
      if (res.ok) setCampeonatos(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const cargarPartidos = async (id) => {
    try {
      const res = await obtenerPartidosPorCampeonato(id);
      if (res.ok) setPartidos(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSeleccionarCampeonato = (id) => {
    setCampeonatoSel(id);
    if (id) cargarPartidos(id);
  };

  const handleGenerarFixture = async (e) => {
    e.preventDefault();
    if (!campeonatoSel || !fechaInicio) return;

    setCargando(true);
    setMensaje(null);
    try {
      const res = await generarFixtureService({ campeonato_id: campeonatoSel, fecha_inicio: fechaInicio });
      if (res.ok) {
        setMensaje({ tipo: 'exito', texto: res.mensaje });
        cargarPartidos(campeonatoSel);
      }
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al generar fixture' });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={{ padding: '20px', color: '#fff' }}>
      <h2 style={{ color: 'var(--neon-cyan)', marginBottom: '20px' }}>📅 GENERACIÓN Y CONSULTA DE FIXTURE</h2>

      {mensaje && (
        <div style={{
          padding: '12px',
          borderRadius: '6px',
          marginBottom: '20px',
          background: mensaje.tipo === 'exito' ? 'rgba(0, 255, 170, 0.2)' : 'rgba(255, 0, 127, 0.2)',
          border: `1px solid ${mensaje.tipo === 'exito' ? '#00ffaa' : '#ff007f'}`,
          color: mensaje.tipo === 'exito' ? '#00ffaa' : '#ff007f'
        }}>
          {mensaje.texto}
        </div>
      )}

      <div className="glass-card" style={{ padding: '20px', marginBottom: '30px' }}>
        <form onSubmit={handleGenerarFixture} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '15px', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>Campeonato:</label>
            <select
              className="cyber-input"
              style={{ width: '100%' }}
              value={campeonatoSel}
              onChange={(e) => handleSeleccionarCampeonato(e.target.value)}
              required
            >
              <option value="">-- Selecciona un Campeonato --</option>
              {campeonatos.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>Fecha de Inicio:</label>
            <input
              type="date"
              className="cyber-input"
              style={{ width: '100%' }}
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              required={partidos.length === 0}
            />
          </div>

          <button type="submit" className="btn-cyber" disabled={cargando}>
            {cargando ? 'GENERANDO...' : '⚡ GENERAR FIXTURE'}
          </button>
        </form>
      </div>

      {/* TABLA ROL DE PARTIDOS */}
      <div className="glass-card" style={{ padding: '20px' }}>
        <h3 style={{ color: 'var(--neon-magenta)', marginTop: 0 }}>Rol de Partidos Registrados</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '15px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--neon-cyan)', color: 'var(--neon-cyan)', textAlign: 'left' }}>
              <th style={{ padding: '10px' }}>Fase / Jornada</th>
              <th style={{ padding: '10px' }}>Fecha y Hora</th>
              <th style={{ padding: '10px' }}>Cancha</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>Equipo Local</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>VS</th>
              <th style={{ padding: '10px' }}>Equipo Visitante</th>
              <th style={{ padding: '10px' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {partidos.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '10px', fontWeight: 'bold', color: 'var(--neon-cyan)' }}>{p.fase}</td>
                <td style={{ padding: '10px' }}>{new Date(p.fecha_hora).toLocaleString()}</td>
                <td style={{ padding: '10px' }}>Cancha #{p.cancha_numero}</td>
                <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>{p.equipo_local}</td>
                <td style={{ padding: '10px', textAlign: 'center', color: 'var(--neon-magenta)' }}>VS</td>
                <td style={{ padding: '10px', fontWeight: 'bold' }}>{p.equipo_visitante}</td>
                <td style={{ padding: '10px' }}>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    background: p.estado === 'programado' ? 'rgba(0, 243, 255, 0.1)' : 'rgba(0, 255, 170, 0.2)',
                    border: `1px solid ${p.estado === 'programado' ? 'var(--neon-cyan)' : '#00ffaa'}`
                  }}>
                    {p.estado.toUpperCase()}
                  </span>
                </td>
              </tr>
            ))}
            {partidos.length === 0 && (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '30px', opacity: 0.5 }}>
                  Selecciona un campeonato o genera un fixture para ver los partidos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
