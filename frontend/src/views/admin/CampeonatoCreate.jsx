import React, { useState } from 'react';
import { crearCampeonato } from '../../services/campeonatos.service';

export default function CampeonatoCreate() {
  const [formData, setFormData] = useState({
    nombre: '',
    modalidad: 'ida_simple',
    cantidad_canchas: 1,
    hora_inicio: '13:00',
    duracion_partido_min: 40,
    descanso_entre_partidos_min: 0,
  });

  const [mensaje, setMensaje] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensaje(null);
    setError(null);
    setCargando(true);

    try {
      const payload = {
        ...formData,
        hora_inicio: formData.hora_inicio.length === 5 ? `${formData.hora_inicio}:00` : formData.hora_inicio,
        cantidad_canchas: parseInt(formData.cantidad_canchas, 10),
        duracion_partido_min: parseInt(formData.duracion_partido_min, 10),
        descanso_entre_partidos_min: parseInt(formData.descanso_entre_partidos_min, 10),
      };

      const respuesta = await crearCampeonato(payload);
      
      if (respuesta.ok) {
        setMensaje(`Campeonato "${respuesta.data.nombre}" creado exitosamente.`);
        setFormData({
          nombre: '',
          modalidad: 'ida_simple',
          cantidad_canchas: 1,
          hora_inicio: '13:00',
          duracion_partido_min: 40,
          descanso_entre_partidos_min: 0,
        });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al conectar con el servidor backend.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '30px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'Arial' }}>
      <h2> Configurar Nuevo Campeonato</h2>

      {mensaje && <div style={{ background: '#d4edda', color: '#155724', padding: '10px', marginBottom: '15px', borderRadius: '4px' }}>{mensaje}</div>}
      {error && <div style={{ background: '#f8d7da', color: '#721c24', padding: '10px', marginBottom: '15px', borderRadius: '4px' }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontWeight: 'bold' }}>Nombre del Campeonato:</label>
          <input
            type="text"
            name="nombre"
            value={formData.nombre}
            onChange={handleChange}
            placeholder="Ej. Torneo Apertura 2026"
            required
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontWeight: 'bold' }}>Modalidad:</label>
          <select
            name="modalidad"
            value={formData.modalidad}
            onChange={handleChange}
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          >
            <option value="ida_simple">Ida Simple</option>
            <option value="ida_vuelta">Ida y Vuelta</option>
          </select>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontWeight: 'bold' }}>Canchas Disponibles:</label>
          <input
            type="number"
            name="cantidad_canchas"
            min="1"
            value={formData.cantidad_canchas}
            onChange={handleChange}
            required
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>

        <hr style={{ margin: '20px 0' }} />
        <h3> Configuración de Tiempos y Horarios</h3>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontWeight: 'bold' }}>Hora de Inicio de la Jornada:</label>
          <input
            type="time"
            name="hora_inicio"
            value={formData.hora_inicio}
            onChange={handleChange}
            required
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontWeight: 'bold' }}>Duración por Partido (minutos):</label>
          <input
            type="number"
            name="duracion_partido_min"
            min="10"
            max="120"
            value={formData.duracion_partido_min}
            onChange={handleChange}
            required
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontWeight: 'bold' }}>Descanso entre Partidos (minutos):</label>
          <input
            type="number"
            name="descanso_entre_partidos_min"
            min="0"
            max="60"
            value={formData.descanso_entre_partidos_min}
            onChange={handleChange}
            required
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>

        <button
          type="submit"
          disabled={cargando}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: cargando ? '#ccc' : '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          {cargando ? 'Guardando...' : 'Guardar Campeonato'}
        </button>
      </form>
    </div>
  );
}
