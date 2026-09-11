import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function CampeonatoGestionView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campeonato, setCampeonato] = useState(null);
  const [activeTab, setActiveTab] = useState('equipos');

  useEffect(() => {
    fetchCampeonato();
  }, [id]);

  const fetchCampeonato = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/campeonatos');
      if (response.ok) {
        const data = await response.json();
        const lista = Array.isArray(data) ? data : (data.campeonatos || []);
        const encontrado = lista.find(c => String(c.id_campeonato || c.id) === String(id));
        setCampeonato(encontrado || null);
      }
    } catch (error) {
      console.error('Error al obtener el campeonato:', error);
    }
  };

  return (
    <div style={{ color: '#fff', padding: '20px', minHeight: '90vh', background: '#0b0f19' }}>
      
      {/* Botón Volver */}
      <button
        onClick={() => navigate('/campeonatos')}
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.2)',
          color: '#ccd6f6',
          padding: '6px 14px',
          borderRadius: '6px',
          cursor: 'pointer',
          marginBottom: '20px',
          fontSize: '0.85rem'
        }}
      >
        ← Volver
      </button>

      {/* TÍTULO DINÁMICO SIN TUERCA */}
      <div style={{ marginBottom: '25px' }}>
        <h2 style={{ color: '#00f3ff', margin: 0, fontSize: '1.8rem', letterSpacing: '1px', textTransform: 'uppercase' }}>
          ADMINISTRACIÓN DE {campeonato?.nombre || 'CAMPEONATO'}
        </h2>
      </div>

      {/* Pestañas de navegación */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '25px', flexWrap: 'wrap' }}>
        <button 
          onClick={() => setActiveTab('equipos')}
          style={{
            background: activeTab === 'equipos' ? '#00f3ff' : 'rgba(255,255,255,0.05)',
            color: activeTab === 'equipos' ? '#000' : '#fff',
            border: '1px solid rgba(0, 243, 255, 0.3)',
            padding: '10px 20px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          🛡️ Equipos e Inscripciones
        </button>

        <button 
          onClick={() => setActiveTab('fixture')}
          style={{
            background: activeTab === 'fixture' ? '#00f3ff' : 'rgba(255,255,255,0.05)',
            color: activeTab === 'fixture' ? '#000' : '#fff',
            border: '1px solid rgba(0, 243, 255, 0.3)',
            padding: '10px 20px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          📅 Fixture y Partidos
        </button>

        <button 
          onClick={() => setActiveTab('tabla')}
          style={{
            background: activeTab === 'tabla' ? '#00f3ff' : 'rgba(255,255,255,0.05)',
            color: activeTab === 'tabla' ? '#000' : '#fff',
            border: '1px solid rgba(0, 243, 255, 0.3)',
            padding: '10px 20px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          📊 Tabla de Posiciones
        </button>

        <button 
          onClick={() => setActiveTab('sanciones')}
          style={{
            background: activeTab === 'sanciones' ? '#00f3ff' : 'rgba(255,255,255,0.05)',
            color: activeTab === 'sanciones' ? '#000' : '#fff',
            border: '1px solid rgba(0, 243, 255, 0.3)',
            padding: '10px 20px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          🚨 Sanciones y Tarjetas
        </button>
      </div>

      {/* Contenido según la pestaña activa */}
      <div style={{ background: 'rgba(15, 17, 26, 0.8)', padding: '25px', borderRadius: '12px', border: '1px solid rgba(0, 243, 255, 0.2)' }}>
        {activeTab === 'equipos' && (
          <div>
            <h3 style={{ color: '#00f3ff', marginTop: 0 }}>GESTIÓN DE EQUIPOS E INSCRIPCIONES</h3>
            <p style={{ color: '#8892b0' }}>
              Administra los equipos inscritos y sus jugadores para {campeonato?.nombre || 'el campeonato'}.
            </p>
          </div>
        )}
        {activeTab === 'fixture' && (
          <div>
            <h3 style={{ color: '#00f3ff', marginTop: 0 }}>GESTIÓN DE FIXTURE Y PARTIDOS</h3>
            <p style={{ color: '#8892b0' }}>Organiza los encuentros y horarios del torneo.</p>
          </div>
        )}
        {activeTab === 'tabla' && (
          <div>
            <h3 style={{ color: '#00f3ff', marginTop: 0 }}>TABLA DE POSICIONES</h3>
            <p style={{ color: '#8892b0' }}>Visualiza las estadísticas actualizadas de los equipos.</p>
          </div>
        )}
        {activeTab === 'sanciones' && (
          <div>
            <h3 style={{ color: '#00f3ff', marginTop: 0 }}>SANCIONES Y TARJETAS</h3>
            <p style={{ color: '#8892b0' }}>Control de tarjetas amarillas, rojas y suspensiones.</p>
          </div>
        )}
      </div>

    </div>
  );
}
