import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';
import Icon from '../components/ui/Icon';

const sections = [
  { id: 'equipos', icon: 'users', label: 'Equipos e inscripciones', title: 'Equipos del campeonato', description: 'La inscripción de equipos y jugadores todavía no está habilitada.' },
  { id: 'fixture', icon: 'calendar', label: 'Fixture y partidos', title: 'Calendario de partidos', description: 'La programación y consulta de partidos todavía no están habilitadas.' },
  { id: 'tabla', icon: 'chart', label: 'Tabla de posiciones', title: 'Tabla de posiciones', description: 'La consulta de resultados y posiciones todavía no está habilitada.' },
  { id: 'sanciones', icon: 'shield', label: 'Sanciones', title: 'Sanciones y tarjetas', description: 'El control de tarjetas y suspensiones todavía no está habilitado.' },
];
export default function GestionCampeonato() {
  const { id } = useParams();
  const [campeonato, setCampeonato] = useState(null);
  const [activeTab, setActiveTab] = useState('equipos');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    api.get('/campeonatos').then(({ data }) => {
      const list = Array.isArray(data) ? data : (data.campeonatos || data.data || []);
      if (!cancelled) setCampeonato(list.find(c => String(c.id_campeonato ?? c.id) === id) || null);
    }).catch(() => { if (!cancelled) setError('No pudimos cargar el campeonato. Vuelve a intentarlo.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, attempt]);
  const section = sections.find(item => item.id === activeTab);
  return <>
    <Link className="button quiet" to="/campeonatos"><Icon name="back" size={17} />Volver a campeonatos</Link>
    {loading ? <div className="empty-state" role="status">Cargando campeonato…</div> : error ? <div className="alert" role="alert"><div><p>{error}</p><button className="button" onClick={() => setAttempt(value => value + 1)}>Volver a intentar</button></div></div> : !campeonato ? <div className="empty-state"><Icon name="trophy" size={35} /><h2>Campeonato no encontrado</h2><p>Puede que se haya eliminado o que el enlace sea incorrecto.</p></div> : <>
      <div className="detail-header"><span className="eyebrow">ADMINISTRACIÓN DEL TORNEO</span><div className="detail-heading"><h1>{campeonato.nombre}</h1><span className={'badge' + (campeonato.activo ? '' : ' inactive')}>{campeonato.activo ? 'Activo' : 'Inactivo'}</span></div><div className="detail-meta"><span><Icon name="trophy" size={17} />{campeonato.categoria} · {campeonato.modalidad}</span><span><Icon name="users" size={17} />Hasta {campeonato.limite_equipos} equipos</span><span><Icon name="court" size={17} />{campeonato.cantidad_canchas} canchas</span></div></div>
      <nav className="tabs" aria-label="Secciones del campeonato">{sections.map(item => <button key={item.id} className={'tab' + (activeTab === item.id ? ' active' : '')} aria-pressed={activeTab === item.id} onClick={() => setActiveTab(item.id)}><Icon name={item.icon} size={18} />{item.label}</button>)}</nav>
      <section className="panel"><div className="section-heading"><h2>{section.title}</h2><span className="badge inactive">Pendiente</span></div>{activeTab === 'tabla' ? <div className="table-wrap"><table><thead><tr>{['#', 'Equipo', 'PJ', 'PG', 'PE', 'PP', 'GF', 'GC', 'DIF', 'PTS'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody><tr><td className="table-empty" colSpan="10">{section.description}</td></tr></tbody></table></div> : <div className="module-empty"><Icon name={section.icon} size={36} /><p>{section.description}</p></div>}</section>
    </>}
  </>;
}
