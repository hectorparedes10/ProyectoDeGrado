import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Icon from '../ui/Icon';
import TeamImage from './TeamImage';
import TeamForm from './TeamForm';
import TeamRoster from './TeamRoster';
import './Teams.css';

export default function TeamsManager({ campeonato }) {
  const championshipId = campeonato.id_campeonato ?? campeonato.id;
  const { can } = useAuth();
  const [teams, setTeams] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const active = useRef(null);
  const load = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/campeonatos/' + championshipId + '/equipos', { signal: controller.signal });
      if (!controller.signal.aborted) setTeams(data);
    } catch (err) { if (!controller.signal.aborted) setError(err.response?.data?.error || 'No pudimos cargar los equipos.'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [championshipId]);
  useEffect(() => { load(); return () => active.current?.abort(); }, [load]);
  function updateTeam(team) {
    setTeams(previous => [...previous.filter(item => item.id !== team.id), team].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
  }
  const selected = teams.find(team => team.id === selectedId);
  if (selected) return <TeamRoster key={selected.id} initialTeam={selected} onBack={() => { setSelectedId(null); load(); }} onTeamSaved={updateTeam} onDeleted={() => { setSelectedId(null); setNotice('Equipo eliminado correctamente.'); load(); }} />;
  return <section className="teams-section" aria-label="Equipos del campeonato">
    <div className="teams-toolbar"><div><h2>Equipos del campeonato</h2><p>{teams.length} de {campeonato.limite_equipos} equipos inscritos</p></div><div className="teams-toolbar-actions"><button type="button" className="button" disabled={loading} onClick={load}>Actualizar</button>{can('equipos:gestionar') && <button type="button" className="button primary" onClick={() => setEditing(true)}><Icon name="plus" size={17} />Registrar equipo</button>}</div></div>
    {notice && <div className="alert success" role="status"><Icon name="check" /><span>{notice}</span></div>}
    {error && <div className="alert" role="alert">{error}</div>}
    {loading && teams.length === 0 ? <div className="empty-state" role="status">Cargando equipos…</div> : !teams.length && !error ? <div className="empty-state"><Icon name="users" size={36} /><h2>Aún no hay equipos inscritos</h2><p>{can('equipos:gestionar') ? 'Registra un equipo y después agrega los jugadores de su plantel.' : 'Los equipos aparecerán aquí cuando se inscriban.'}</p></div> : <div className="teams-grid">{teams.map(team => <button type="button" className="team-card" key={team.id} onClick={() => { setNotice(''); setSelectedId(team.id); }} aria-label={'Ver jugadores de ' + team.nombre}>
      <span className="team-card-heading"><TeamImage src={team.escudo} name={team.nombre} /><span className="team-card-title"><strong>{team.nombre}</strong><small>{team.curso || 'Curso sin registrar'}</small></span></span>
      <span className="team-card-footer"><span><Icon name="users" size={15} />{Number(team.cantidad_jugadores || 0)} jugadores</span><span>Ver plantel <Icon name="arrow" size={15} /></span></span>
    </button>)}</div>}
    {editing && <TeamForm championshipId={championshipId} onClose={() => setEditing(false)} onSaved={team => { updateTeam(team); setNotice('Equipo registrado correctamente. Selecciona su tarjeta para agregar jugadores.'); }} />}
  </section>;
}