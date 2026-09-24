import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { playerName, sortPlayers } from '../../utils/teamImages';
import Icon from '../ui/Icon';
import TeamImage from './TeamImage';
import TeamForm from './TeamForm';
import PlayerForm from './PlayerForm';
import PlayerProfile from './PlayerProfile';
import DeleteRosterDialog from './DeleteRosterDialog';

export default function TeamRoster({ initialTeam, onBack, onTeamSaved, onDeleted }) {
  const { can } = useAuth();
  const [team, setTeam] = useState(initialTeam);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingTeam, setEditingTeam] = useState(false);
  const [playerEditor, setPlayerEditor] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const active = useRef(null);
  const loaded = useRef(false);
  const editing = editingTeam || Boolean(playerEditor) || Boolean(deleting);
  const load = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    if (!loaded.current) setLoading(true);
    setError('');
    try {
      const [teamResult, playerResult] = await Promise.all([api.get('/equipos/' + initialTeam.id, { signal: controller.signal }), api.get('/equipos/' + initialTeam.id + '/jugadores', { signal: controller.signal })]);
      if (!controller.signal.aborted) { setTeam(teamResult.data); setPlayers(sortPlayers(playerResult.data)); loaded.current = true; }
    } catch (err) { if (!controller.signal.aborted) setError(err.response?.data?.error || 'No pudimos cargar el plantel.'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [initialTeam.id]);
  useEffect(() => {
    if (editing) { active.current?.abort(); return; }
    load();
    const timer = window.setInterval(load, 20000);
    window.addEventListener('focus', load);
    return () => { active.current?.abort(); window.clearInterval(timer); window.removeEventListener('focus', load); };
  }, [load, editing]);
  const profile = players.find(player => player.id === profileId);
  function savedPlayer(player, wasEditing) {
    const next = sortPlayers([...players.filter(item => item.id !== player.id), player]);
    setPlayers(next);
    const updatedTeam = { ...team, cantidad_jugadores: next.length };
    setTeam(updatedTeam); onTeamSaved(updatedTeam);
    setNotice(wasEditing ? 'Datos del jugador actualizados.' : 'Jugador registrado correctamente.');
  }
  function deleted(entity) {
    setDeleting(null); setProfileId(null);
    if (entity.type === 'equipo') { onDeleted(); return; }
    const next = players.filter(player => player.id !== entity.id);
    setPlayers(next);
    const updatedTeam = { ...team, cantidad_jugadores: next.length };
    setTeam(updatedTeam); onTeamSaved(updatedTeam);
    setNotice('Jugador eliminado correctamente.');
  }
  function requestPlayerDelete(player) {
    setProfileId(null);
    setDeleting({ type: 'jugador', id: player.id, name: playerName(player) });
  }
  return <section className="team-roster" aria-label={'Plantel de ' + team.nombre}>
    <button type="button" className="button quiet" onClick={onBack}><Icon name="back" size={17} />Volver a equipos</button>
    <div className="panel roster-team-header"><TeamImage src={team.escudo} name={team.nombre} /><div className="roster-team-summary"><span className="card-kicker">PLANTEL DEL EQUIPO</span><h2>{team.nombre}</h2><p>{team.curso || 'Curso sin registrar'}</p></div><div className="roster-team-actions">{can('equipos:gestionar') && <button type="button" className="button" onClick={() => setEditingTeam(true)}><Icon name="edit" size={16} />Editar equipo</button>}{can('equipos:eliminar') && <button type="button" className="button danger" onClick={() => setDeleting({ type: 'equipo', id: team.id, name: team.nombre })}><Icon name="trash" size={16} />Eliminar equipo</button>}</div><dl className="roster-team-contact"><div><dt>Delegado</dt><dd>{team.delegado_nombre || 'Sin registrar'}</dd></div><div><dt>Teléfono</dt><dd>{team.delegado_telefono || 'Sin registrar'}</dd></div></dl></div>
    <div className="teams-toolbar"><div><h2>Jugadores <span className="badge">{players.length}</span></h2><p>Ordenados por dorsal. Selecciona un nombre para ver su ficha.</p></div><div className="teams-toolbar-actions"><button type="button" className="button" disabled={loading} onClick={load}>Actualizar</button>{can('jugadores:gestionar') && <button type="button" className="button primary" disabled={loading} onClick={() => setPlayerEditor({})}><Icon name="plus" size={17} />Registrar jugador</button>}</div></div>
    {notice && <div className="alert success" role="status"><Icon name="check" /><span>{notice}</span></div>}
    {error && <div className="alert" role="alert">{error}</div>}
    {loading && !players.length ? <div className="empty-state" role="status">Cargando jugadores…</div> : !players.length && !error ? <div className="empty-state"><Icon name="users" size={36} /><h2>Este equipo aún no tiene jugadores</h2><p>{can('jugadores:gestionar') ? 'Registra a los integrantes para completar el plantel.' : 'El plantel aparecerá aquí cuando se registren sus jugadores.'}</p></div> : <div className="panel roster-list-panel"><div className="table-wrap"><table className="roster-table"><thead><tr><th scope="col">DORSAL</th><th scope="col">JUGADOR</th><th scope="col">CURSO</th><th scope="col">EDAD</th><th scope="col">GOLES</th><th scope="col">TARJETAS</th>{(can('jugadores:gestionar') || can('jugadores:eliminar')) && <th scope="col">ACCIONES</th>}</tr></thead><tbody>{players.map(player => <tr key={player.id}>
      <td><span className="player-dorsal">{player.dorsal ?? '—'}</span></td>
      <td><button type="button" className="player-name-button" onClick={() => setProfileId(player.id)}><TeamImage src={player.foto} name={playerName(player)} portrait /><strong>{playerName(player)}</strong></button></td>
      <td>{player.curso || 'Sin registrar'}</td><td>{player.edad === null || player.edad === undefined ? '—' : player.edad}</td><td className="player-stat-number">{player.goles ?? 0}</td>
      <td><span className="player-cards"><span aria-label={(player.amarillas ?? 0) + ' tarjetas amarillas'} title="Amarillas"><i className="player-yellow-card" aria-hidden="true" />{player.amarillas ?? 0}</span><span aria-label={(player.rojas ?? 0) + ' tarjetas rojas'} title="Rojas"><i className="player-red-card" aria-hidden="true" />{player.rojas ?? 0}</span></span></td>
      {(can('jugadores:gestionar') || can('jugadores:eliminar')) && <td><div className="roster-player-actions">{can('jugadores:gestionar') && <button type="button" className="icon-button" aria-label={'Editar a ' + playerName(player)} title="Editar jugador" onClick={() => setPlayerEditor(player)}><Icon name="edit" size={17} /></button>}{can('jugadores:eliminar') && <button type="button" className="icon-button danger" aria-label={'Eliminar a ' + playerName(player)} title="Eliminar jugador" onClick={() => requestPlayerDelete(player)}><Icon name="trash" size={17} /></button>}</div></td>}
    </tr>)}</tbody></table></div><p className="roster-stats-caption">Goles y tarjetas acumulados en partidos finalizados.</p></div>}
    {editingTeam && <TeamForm team={team} championshipId={team.campeonato_id} onClose={() => setEditingTeam(false)} onSaved={updated => { setTeam(updated); onTeamSaved(updated); setNotice('Datos del equipo actualizados.'); }} />}
    {playerEditor && <PlayerForm player={playerEditor} team={team} onSaved={savedPlayer} onClose={() => setPlayerEditor(null)} />}
    {profile && !playerEditor && !deleting && <PlayerProfile player={profile} team={team} onClose={() => setProfileId(null)} onEdit={can('jugadores:gestionar') ? () => { setProfileId(null); setPlayerEditor(profile); } : undefined} onDelete={can('jugadores:eliminar') ? () => requestPlayerDelete(profile) : undefined} />}
    {deleting && <DeleteRosterDialog entity={deleting} onClose={() => setDeleting(null)} onDeleted={deleted} />}
  </section>;
}