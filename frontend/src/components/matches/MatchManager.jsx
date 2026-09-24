import { useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Icon from '../ui/Icon';
import RosterDialog from '../teams/RosterDialog';
import TeamImage from '../teams/TeamImage';
import './Matches.css';

const states = { programado: 'Programado', en_curso: 'En curso', finalizado: 'Finalizado' };
const errorMessage = error => error.response?.data?.error || 'No pudimos conectar con el servidor. Vuelve a intentarlo.';
const dateLabel = value => value ? value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4)+' · '+value.slice(11,16) : 'Sin horario';

const timeLabel = value => value?.slice(0, 5) || '—';
const modeLabel = value => ['ida_simple', 'solo_ida'].includes(value) ? 'Solamente ida' : value === 'ida_vuelta' ? 'Ida y vuelta' : value;

function FixtureRules({ settings, teamsCount }) {
  return <dl className="fixture-rules">
    <div><dt>Equipos inscritos</dt><dd>{teamsCount}</dd></div>
    <div><dt>Modalidad</dt><dd>{modeLabel(settings.modalidad)}</dd></div>
    <div><dt>Hora de inicio</dt><dd>{timeLabel(settings.hora_inicio)}</dd></div>
    <div><dt>Canchas</dt><dd>{settings.cantidad_canchas}</dd></div>
    <div><dt>Duración por partido</dt><dd>{settings.duracion_partido_min} min</dd></div>
    <div><dt>Descanso entre partidos</dt><dd>{settings.descanso_entre_partidos_min} min</dd></div>
  </dl>;
}

function GenerateFixture({ campeonato, teamsCount, onClose, onSaved }) {
  const [endTime, setEndTime] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    if (!endTime || endTime <= timeLabel(campeonato.hora_inicio)) {
      setError('La hora límite debe ser posterior a la hora de inicio del campeonato.');
      return;
    }
    setBusy(true); setError('');
    try {
      await api.post('/campeonatos/' + campeonato.id_campeonato + '/fixture', { hora_fin: endTime });
      onSaved(); onClose();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <RosterDialog title="Generar fechas automáticamente" onClose={onClose} busy={busy}>
    <form onSubmit={save}>
      <div className="dialog-body">
        {error && <div className="alert" role="alert">{error}</div>}
        <p className="field-help">La programación usa los equipos inscritos y las condiciones del campeonato.</p>
        <FixtureRules settings={campeonato} teamsCount={teamsCount}/>
        <label className="field fixture-end-time"><span>¿Hasta qué hora se puede jugar?</span><input type="time" required value={endTime} disabled={busy} onChange={event => setEndTime(event.target.value)}/><small className="field-help">Todos los partidos deben terminar a más tardar a esta hora, cada día. Horario de Bolivia.</small></label>
        <div className="fixture-explanation">
          <p>Se genera la fecha 1 desde el próximo horario disponible. Al finalizar sus partidos, la siguiente fecha se crea automáticamente.</p>
          <p>Si queda tiempo, continúa el mismo día. Con una cancha, un equipo no juega dos partidos seguidos; con varias, puede continuar en otra cancha al terminar. Si hace falta, la programación continúa al día siguiente.</p>
          <p>Los equipos y estas condiciones quedan fijados al generar las fechas.</p>
        </div>
      </div>
      <div className="dialog-footer"><button type="button" className="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? 'Generando…' : 'Generar fecha 1'}</button></div>
    </form>
  </RosterDialog>;
}

function DeleteMatch({ match, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function remove() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await api.delete('/partidos/' + match.id, { data: { revision: match.revision } });
      onDeleted(); onClose();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <RosterDialog title="Borrar partido" onClose={onClose} busy={busy} compact>
    <div className="dialog-body">
      {error && <div className="alert" role="alert">{error}</div>}
      <p>Vas a borrar el partido entre <strong>{match.local_nombre}</strong> y <strong>{match.visitante_nombre}</strong>.</p>
      <p className="field-help">{dateLabel(match.fecha_hora)} · Cancha {match.cancha_numero}</p>
      <p>Sus goles y tarjetas dejarán de contar en los acumulados de los jugadores y en los máximos goleadores. Esta acción no se puede deshacer.</p>
      {match.jornada_numero != null && <p className="field-help">Si era el último partido pendiente de la fecha, el calendario avanzará automáticamente.</p>}
    </div>
    <div className="dialog-footer"><button type="button" className="button" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className="button danger" disabled={busy} onClick={remove}>{busy ? 'Borrando…' : 'Borrar partido'}</button></div>
  </RosterDialog>;
}

function MatchSheet({matchId,canEdit,onClose,onSaved}) {
  const [match,setMatch]=useState(null),[rows,setRows]=useState([]),[state,setState]=useState('finalizado');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true;setLoading(true);setError('');api.get('/partidos/'+matchId).then(({data})=>{
    if(active){setMatch(data);setRows(data.jugadores);setState(data.estado==='programado'&&canEdit?'finalizado':data.estado);}
  }).catch(err=>{if(active)setError(errorMessage(err));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[matchId,attempt,canEdit]);
  function update(id,key,value){setRows(previous=>previous.map(row=>row.id===id?{...row,[key]:value}:row));}
  const score=teamId=>rows.filter(row=>row.participa&&row.equipo_id===teamId).reduce((total,row)=>total+Number(row.goles||0),0);
  async function save(event){
    event.preventDefault();if(busy||!match)return;
    setBusy(true);setError('');
    try{
      await api.put('/partidos/'+match.id+'/planilla',{revision:match.revision,estado:state,jugadores:rows.filter(row=>row.participa).map(row=>({jugador_id:row.id,goles:Number(row.goles||0),amarillas:Number(row.amarillas||0),rojas:Number(row.rojas||0)}))});
      onSaved();onClose();
    }catch(err){setError(errorMessage(err));}finally{setBusy(false);}
  }
  return <RosterDialog title={canEdit?'Planilla del partido':'Detalle del partido'} busy={busy} onClose={onClose}>
    {loading?<div className="dialog-body" role="status">Cargando planilla…</div>:!match?<div className="dialog-body"><div className="alert" role="alert">{error}</div><button className="button" onClick={()=>setAttempt(value=>value+1)}>Volver a intentar</button></div>:<form onSubmit={save}>
      <div className="dialog-body match-sheet-body">
        {error&&<div className="alert" role="alert">{error}</div>}
        <div className="match-sheet-score"><strong>{match.local_nombre}</strong><span>{score(match.equipo_local_id)} : {score(match.equipo_visitante_id)}</span><strong>{match.visitante_nombre}</strong></div>
        <p className="field-help">Los goles y las tarjetas se acumulan en las fichas al guardar el partido como finalizado. Corregir esta planilla reemplaza sus registros anteriores.</p>
        {canEdit?<label className="field match-state-field"><span>Estado del partido</span><select value={state} disabled={busy} onChange={event=>setState(event.target.value)}>{Object.entries(states).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>:<p className="badge inactive">{states[match.estado]}</p>}
        {[{id:match.equipo_local_id,nombre:match.local_nombre},{id:match.equipo_visitante_id,nombre:match.visitante_nombre}].map(team=><section className="match-team-sheet" key={team.id}>
          <h3>{team.nombre}</h3><p className="field-help">{canEdit?'Marca a quienes participaron e ingresa sus goles y tarjetas.':'Participantes y registros de este partido.'}</p>
          {rows.filter(row=>row.equipo_id===team.id&&(canEdit||row.participa)).length===0?<p className="match-roster-empty">{canEdit?'Este equipo todavía no tiene jugadores registrados.':'Sin participantes registrados.'}</p>:
          <div className="match-player-rows">{rows.filter(row=>row.equipo_id===team.id&&(canEdit||row.participa)).map(row=><div className={'match-player-row'+(row.participa?' participating':'')} key={row.id}>
            <div className="match-player-identity">{canEdit&&<input type="checkbox" checked={row.participa} disabled={busy} onChange={event=>update(row.id,'participa',event.target.checked)} aria-label={'Participó '+row.nombre_completo}/>}<span className="match-shirt">{row.dorsal??'—'}</span><strong>{row.nombre_completo}{row.eliminado&&<small className="field-help"> · Retirado del plantel</small>}</strong></div>
            <div className="match-player-counters">{[['goles','Goles',99],['amarillas','Amarillas',2],['rojas','Rojas',1]].map(([key,label,max])=><label className={'match-counter '+key} key={key}><span>{label}</span>{canEdit?<input type="number" min="0" max={max} step="1" required disabled={busy||!row.participa} value={row[key]} onChange={event=>update(row.id,key,event.target.value)} aria-label={label+' de '+row.nombre_completo}/>:<strong>{row[key]}</strong>}</label>)}</div>
          </div>)}</div>}
        </section>)}
      </div><div className="dialog-footer"><button type="button" className="button" disabled={busy} onClick={onClose}>{canEdit?'Cancelar':'Cerrar'}</button>{canEdit&&<button className="button primary" disabled={busy}>{busy?'Guardando…':'Guardar planilla'}</button>}</div>
    </form>}
  </RosterDialog>;
}
export default function MatchManager({ campeonato }) {
  const { can } = useAuth();
  const canEdit = can('partidos:resultados'), canDelete = can('partidos:eliminar');
  const [matches, setMatches] = useState([]), [teams, setTeams] = useState([]), [fixture, setFixture] = useState(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [generating, setGenerating] = useState(false), [selected, setSelected] = useState(null), [deleting, setDeleting] = useState(null), [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    async function load(first = false) {
      const request = ++generation.current;
      if (first) setLoading(true);
      try {
        const base = '/campeonatos/' + campeonato.id_campeonato;
        const [matchData, teamData, fixtureData] = await Promise.all([api.get(base + '/partidos'), api.get(base + '/equipos'), api.get(base + '/fixture')]);
        if (active && request === generation.current) { setMatches(matchData.data); setTeams(teamData.data); setFixture(fixtureData.data); setError(''); }
      } catch (err) { if (active && request === generation.current) setError(errorMessage(err)); }
      finally { if (active && request === generation.current) setLoading(false); }
    }
    load(true);
    const focus = () => load();
    window.addEventListener('focus', focus);
    const interval = setInterval(() => load(), 20000);
    return () => { active = false; generation.current++; clearInterval(interval); window.removeEventListener('focus', focus); };
  }, [campeonato.id_campeonato, refresh]);
  function saved(message) { setNotice(message); setRefresh(value => value + 1); }
  const config = fixture?.config;
  const rounds = fixture?.jornadas || [];
  const roundNumbers = [...new Set([...rounds.map(round => Number(round.numero)), ...matches.filter(match => match.jornada_numero != null).map(match => Number(match.jornada_numero))])].sort((a, b) => a - b);
  const groups = roundNumbers.map(numero => ({ numero, summary: rounds.find(round => Number(round.numero) === numero), matches: matches.filter(match => Number(match.jornada_numero) === numero) }));
  const legacyMatches = matches.filter(match => match.jornada_numero == null);
  if (legacyMatches.length) groups.push({ numero: null, matches: legacyMatches });
  const currentRound = rounds.find(round => Number(round.numero) === Number(config?.jornada_actual));

  function matchCard(match) {
    return <article className="panel match-card" key={match.id}>
      <div className="match-card-meta"><span>{dateLabel(match.fecha_hora)} (Bolivia)</span><span className={'badge' + (match.estado === 'finalizado' ? '' : ' inactive')}>{states[match.estado]}</span></div>
      <div className="match-versus"><div><TeamImage src={match.local_escudo} name={match.local_nombre}/><strong>{match.local_nombre}</strong><small>{match.local_curso}</small></div><span className="match-score">{match.estado === 'programado' ? 'VS' : match.goles_local + ' : ' + match.goles_visitante}</span><div><TeamImage src={match.visitante_escudo} name={match.visitante_nombre}/><strong>{match.visitante_nombre}</strong><small>{match.visitante_curso}</small></div></div>
      <div className="match-card-footer"><span className="field-help">Cancha {match.cancha_numero}</span><div className="match-card-actions">{canDelete && <button className="icon-button match-delete" onClick={() => setDeleting(match)} aria-label={'Borrar partido: ' + match.local_nombre + ' contra ' + match.visitante_nombre} title="Borrar partido"><Icon name="trash" size={17}/></button>}<button className="button" onClick={() => setSelected(match.id)}>{canEdit ? match.estado === 'finalizado' ? 'Revisar / corregir' : 'Registrar planilla' : 'Ver detalle'}<Icon name="arrow" size={16}/></button></div></div>
    </article>;
  }
  return <section className="match-manager">
    <div className="section-heading"><div><h2>Partidos y planillas</h2><p className="field-help">Las fechas se programan con las condiciones del campeonato.</p></div><div className="match-toolbar"><button className="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Actualizar</button>{canEdit && !config && <button className="button primary" disabled={loading || Boolean(error) || teams.length < 2} onClick={() => setGenerating(true)}><Icon name="calendar" size={17}/>Generar fechas</button>}</div></div>
    {notice && <div className="alert success" role="status">{notice}</div>}{error && <div className="alert" role="alert">{error}</div>}
    {config && <div className="panel fixture-overview">
      <div className="fixture-overview-heading"><div><span className="eyebrow">PROGRAMACIÓN AUTOMÁTICA</span><h3>{config.completado ? 'Todas las fechas concluidas' : 'Fecha ' + config.jornada_actual + ' de ' + config.total_jornadas}</h3></div><span className={'badge' + (config.completado ? '' : ' inactive')}>{config.completado ? 'Completado' : 'En desarrollo'}</span></div>
      <div className="fixture-window"><Icon name="clock" size={18}/><strong>{timeLabel(config.hora_inicio)} a {timeLabel(config.hora_fin)}</strong><span>cada día · Bolivia</span></div>
      <FixtureRules settings={config} teamsCount={config.equipos_count}/>
      <p className="field-help fixture-progress" role="status">{config.completado ? 'La programación llegó a su última fecha y no quedan partidos pendientes.' : Number(config.jornada_actual) < Number(config.total_jornadas) ? 'La siguiente fecha se generará automáticamente cuando concluyan todos los partidos de esta fecha.' : 'Esta es la última fecha del campeonato.'}{currentRound && !config.completado ? ' Partidos finalizados: ' + currentRound.finalizados + ' de ' + currentRound.total_partidos + '.' : ''}</p>
    </div>}
    {loading && matches.length === 0 ? <div className="empty-state" role="status">Cargando partidos…</div> : matches.length === 0 && !error && !config ? <div className="panel module-empty"><Icon name="calendar" size={32}/><h3>Todavía no hay partidos</h3><p>{teams.length < 2 ? 'Registra al menos dos equipos para generar las fechas.' : canEdit ? 'Genera la fecha 1. Las siguientes aparecerán al concluir los partidos de cada fecha.' : 'Los partidos aparecerán cuando el administrador o mesa genere las fechas.'}</p></div> : <div className="match-rounds">{groups.map(group => <section className="match-round" key={group.numero ?? 'anteriores'} aria-label={group.numero == null ? 'Partidos anteriores' : 'Fecha ' + group.numero}>
      <div className="match-round-heading"><div><h3>{group.numero == null ? 'Partidos anteriores' : 'Fecha ' + group.numero}{group.numero != null && <span>{(group.summary?.vuelta ?? group.matches[0]?.vuelta) ? 'Vuelta' : 'Ida'}</span>}</h3>{group.summary?.fecha_inicio && <p className="field-help">{dateLabel(group.summary.fecha_inicio)}{group.summary.fecha_fin && group.summary.fecha_fin.slice(0, 10) !== group.summary.fecha_inicio.slice(0, 10) ? ' — ' + dateLabel(group.summary.fecha_fin) : ''}</p>}</div>{group.summary && <span className="badge inactive">{group.summary.finalizados} / {group.summary.total_partidos} finalizados</span>}</div>
      {group.summary?.eliminados > 0 && <p className="field-help fixture-removed">{group.summary.eliminados} {group.summary.eliminados === 1 ? 'partido borrado por el administrador' : 'partidos borrados por el administrador'}.</p>}
      {group.summary?.descansa?.length > 0 && <p className="fixture-bye"><Icon name="clock" size={15}/><span>Descansa: {group.summary.descansa.map(team => team.nombre).join(', ')}</span></p>}
      {group.matches.length > 0 ? <div className="match-grid">{group.matches.map(matchCard)}</div> : <div className="panel match-round-empty">No quedan partidos en esta fecha.</div>}
    </section>)}</div>}
    {generating && <GenerateFixture campeonato={campeonato} teamsCount={teams.length} onClose={() => setGenerating(false)} onSaved={() => saved('Fecha 1 generada. Las siguientes se crearán automáticamente al finalizar cada fecha.')}/>}
    {selected !== null && <MatchSheet matchId={selected} canEdit={canEdit} onClose={() => setSelected(null)} onSaved={() => saved('Planilla guardada. La programación y los acumulados se actualizaron.')}/>}
    {deleting && <DeleteMatch match={deleting} onClose={() => setDeleting(null)} onDeleted={() => saved('Partido borrado. La programación y los acumulados se actualizaron.')}/>}
  </section>;
}
