import React, { useState, useEffect } from 'react';
import { obtenerEquipos, crearEquipo, obtenerJugadoresPorEquipo, registrarJugador } from '../services/equipo.service';
import { obtenerCampeonatosService } from '../services/campeonato.service';

export default function Equipos() {
  const [equipos, setEquipos] = useState([]);
  const [campeonatos, setCampeonatos] = useState([]);
  const [equipoSeleccionado, setEquipoSeleccionado] = useState(null);
  const [jugadores, setJugadores] = useState([]);

  // Formularios
  const [nuevoEquipo, setNuevoEquipo] = useState({ nombre: '', categoria: 'Libre', campeonato_id: '' });
  const [nuevoJugador, setNuevoJugador] = useState({ nombre: '', apellido: '', dni: '', dorsal: '', foto_url: '' });

  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const resEq = await obtenerEquipos();
      if (resEq.ok) setEquipos(resEq.data);

      const resCamp = await obtenerCampeonatosService();
      if (resCamp.ok) setCampeonatos(resCamp.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCrearEquipo = async (e) => {
    e.preventDefault();
    try {
      const res = await crearEquipo(nuevoEquipo);
      if (res.ok) {
        setMensaje({ tipo: 'exito', texto: 'Equipo registrado con éxito' });
        setNuevoEquipo({ nombre: '', categoria: 'Libre', campeonato_id: '' });
        cargarDatos();
      }
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al registrar equipo' });
    }
  };

  const handleSeleccionarEquipo = async (eq) => {
    setEquipoSeleccionado(eq);
    try {
      const res = await obtenerJugadoresPorEquipo(eq.id);
      if (res.ok) setJugadores(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRegistrarJugador = async (e) => {
    e.preventDefault();
    if (!equipoSeleccionado) return;

    try {
      const datos = { ...nuevoJugador, equipo_id: equipoSeleccionado.id };
      const res = await registrarJugador(datos);
      if (res.ok) {
        setJugadores([...jugadores, res.data]);
        setNuevoJugador({ nombre: '', apellido: '', dni: '', dorsal: '', foto_url: '' });
        setMensaje({ tipo: 'exito', texto: 'Jugador añadido al equipo' });
      }
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al añadir jugador' });
    }
  };

  return (
    <div style={{ padding: '20px', color: '#fff' }}>
      <h2 style={{ color: 'var(--neon-cyan)', marginBottom: '20px' }}>⚡ GESTIÓN DE EQUIPOS Y JUGADORES</h2>

      {mensaje && (
        <div style={{
          padding: '10px',
          borderRadius: '5px',
          marginBottom: '20px',
          background: mensaje.tipo === 'exito' ? 'rgba(0, 255, 170, 0.2)' : 'rgba(255, 0, 127, 0.2)',
          border: `1px solid ${mensaje.tipo === 'exito' ? '#00ffaa' : '#ff007f'}`,
          color: mensaje.tipo === 'exito' ? '#00ffaa' : '#ff007f'
        }}>
          {mensaje.texto}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
        
        {/* FORMULARIO DE REGISTRO DE EQUIPO */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <h3 style={{ color: 'var(--neon-magenta)', marginTop: 0 }}>Registrar Nuevo Equipo</h3>
          <form onSubmit={handleCrearEquipo}>
            <div style={{ marginBottom: '15px' }}>
              <label>Campeonato:</label>
              <select
                className="cyber-input"
                style={{ width: '100%', marginTop: '5px' }}
                value={nuevoEquipo.campeonato_id}
                onChange={(e) => setNuevoEquipo({ ...nuevoEquipo, campeonato_id: e.target.value })}
                required
              >
                <option value="">-- Seleccionar Torneo --</option>
                {campeonatos.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label>Nombre del Equipo:</label>
              <input
                type="text"
                className="cyber-input"
                style={{ width: '100%', marginTop: '5px' }}
                value={nuevoEquipo.nombre}
                onChange={(e) => setNuevoEquipo({ ...nuevoEquipo, nombre: e.target.value })}
                required
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label>Categoría:</label>
              <input
                type="text"
                className="cyber-input"
                style={{ width: '100%', marginTop: '5px' }}
                value={nuevoEquipo.categoria}
                onChange={(e) => setNuevoEquipo({ ...nuevoEquipo, categoria: e.target.value })}
              />
            </div>

            <button type="submit" className="btn-cyber" style={{ width: '100%' }}>+ CREAR EQUIPO</button>
          </form>

          <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '25px 0' }} />

          <h3>Lista de Equipos</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {equipos.map((eq) => (
              <li
                key={eq.id}
                onClick={() => handleSeleccionarEquipo(eq)}
                style={{
                  padding: '12px',
                  borderRadius: '6px',
                  background: equipoSeleccionado?.id === eq.id ? 'rgba(0, 243, 255, 0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${equipoSeleccionado?.id === eq.id ? 'var(--neon-cyan)' : 'transparent'}`,
                  marginBottom: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}
              >
                <span><strong>{eq.nombre}</strong> ({eq.categoria})</span>
                <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{eq.campeonato_nombre || 'Sin torneo'}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* DETALLE Y PLANTILLA DEL EQUIPO SELECCIONADO */}
        <div className="glass-card" style={{ padding: '20px' }}>
          {equipoSeleccionado ? (
            <>
              <h3 style={{ color: 'var(--neon-cyan)', marginTop: 0 }}>
                Plantilla: <span style={{ color: '#fff' }}>{equipoSeleccionado.nombre}</span>
              </h3>

              {/* AGREGAR JUGADOR */}
              <form onSubmit={handleRegistrarJugador} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 80px', gap: '10px', marginBottom: '20px' }}>
                <input
                  type="text"
                  placeholder="Nombre"
                  className="cyber-input"
                  value={nuevoJugador.nombre}
                  onChange={(e) => setNuevoJugador({ ...nuevoJugador, nombre: e.target.value })}
                  required
                />
                <input
                  type="text"
                  placeholder="Apellido"
                  className="cyber-input"
                  value={nuevoJugador.apellido}
                  onChange={(e) => setNuevoJugador({ ...nuevoJugador, apellido: e.target.value })}
                  required
                />
                <input
                  type="text"
                  placeholder="DNI / C.I."
                  className="cyber-input"
                  value={nuevoJugador.dni}
                  onChange={(e) => setNuevoJugador({ ...nuevoJugador, dni: e.target.value })}
                  required
                />
                <input
                  type="number"
                  placeholder="N°"
                  className="cyber-input"
                  value={nuevoJugador.dorsal}
                  onChange={(e) => setNuevoJugador({ ...nuevoJugador, dorsal: e.target.value })}
                />
                <button type="submit" className="btn-cyber" style={{ gridColumn: 'span 4' }}>+ AGREGAR JUGADOR</button>
              </form>

              {/* LISTA DE JUGADORES DE ESTE EQUIPO */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '15px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--neon-cyan)', textAlign: 'left', color: 'var(--neon-cyan)' }}>
                    <th style={{ padding: '8px' }}>Dorsal</th>
                    <th style={{ padding: '8px' }}>Nombre Completo</th>
                    <th style={{ padding: '8px' }}>DNI</th>
                  </tr>
                </thead>
                <tbody>
                  {jugadores.map((j) => (
                    <tr key={j.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '8px', color: 'var(--neon-magenta)', fontWeight: 'bold' }}>#{j.dorsal || '-'}</td>
                      <td style={{ padding: '8px' }}>{j.nombre} {j.apellido}</td>
                      <td style={{ padding: '8px', opacity: 0.8 }}>{j.dni}</td>
                    </tr>
                  ))}
                  {jugadores.length === 0 && (
                    <tr>
                      <td colSpan="3" style={{ textAlign: 'center', padding: '20px', opacity: 0.5 }}>
                        No hay jugadores inscritos en este equipo aún.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px', opacity: 0.5 }}>
              ← Selecciona o crea un equipo para gestionar su plantilla de jugadores.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
