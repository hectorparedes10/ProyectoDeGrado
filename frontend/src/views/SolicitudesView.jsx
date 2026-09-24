import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRequests } from '../context/RequestsContext';
import Icon from '../components/ui/Icon';
import api from '../services/api';

const statuses = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' };
const dateLabel = value => new Date(value).toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short' });
export default function SolicitudesView() {
  const { can } = useAuth();
  const admin = can('solicitudes:resolver');
  const { requests, loading, error, refresh } = useRequests();
  const [selected, setSelected] = useState(null);
  const [decision, setDecision] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef(null);
  const displayed = [...requests].sort((a,b) => Number(b.estado==='pendiente')-Number(a.estado==='pendiente') || new Date(b.created_at)-new Date(a.created_at));
  const pendingCount = displayed.filter(item => item.estado==='pendiente').length;
  function review(request, value) {
    setSelected(request); setDecision(value); setRespuesta(''); setFormError(''); dialog.current.showModal();
  }
  async function resolve(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setFormError('');
    try {
      await api.patch('/solicitudes-campeonato/' + selected.id, { decision, respuesta });
      dialog.current.close();
      setNotice(decision==='aprobar' ? 'Solicitud aprobada. El campeonato ya está registrado.' : 'Solicitud rechazada. Mesa ya puede consultar la respuesta.');
      await refresh();
    } catch (err) { setFormError(err.response?.data?.error || 'No pudimos resolver la solicitud.'); await refresh(); }
    finally { setBusy(false); }
  }
  return <>
    <div className="page-header"><div><span className="eyebrow">AUTORIZACIONES</span><h1>{admin ? 'Solicitudes de campeonatos' : 'Mis solicitudes'}</h1><p>{admin ? 'Revisa las solicitudes de mesa para crear campeonatos.' : 'Consulta la respuesta del administrador a tus solicitudes.'}</p></div><button className="button" onClick={refresh} disabled={loading}>Actualizar</button></div>
    {notice && <div className="alert success" role="status"><Icon name="check" /><span>{notice}</span></div>}
    {error && <div className="alert" role="alert">{error}</div>}
    {!admin && <div className="alert info"><Icon name="shield" /><p>La aprobación crea el campeonato automáticamente. Después podrás consultarlo y editarlo desde Campeonatos.</p></div>}
    <div className="section-heading"><h2>{pendingCount} {pendingCount===1 ? 'solicitud pendiente' : 'solicitudes pendientes'}</h2><small>{displayed.length} en el historial</small></div>
    {loading && displayed.length===0 ? <div className="empty-state" role="status">Cargando solicitudes…</div> : displayed.length===0 && !error ? <div className="empty-state"><Icon name="bell" size={36} /><h2>No hay solicitudes de campeonatos</h2><p>{admin ? 'Las solicitudes aparecerán aquí cuando mesa las envíe.' : 'Solicita un nuevo campeonato desde Campeonatos.'}</p></div> :
    <div className="request-list">{displayed.map(request => <article className="panel request-card" key={request.id}>
      <div className="section-heading"><div><span className="card-kicker">CAMPEONATO · #{request.id}</span><h2>{request.datos.nombre}</h2></div><span className={'badge ' + (request.estado==='pendiente' ? 'preview' : request.estado==='rechazada' ? 'rejected' : '')}>{statuses[request.estado]}</span></div>
      <div className="request-person"><Icon name="users" size={18} /><div><strong>{request.solicitante_nombre}</strong>{admin && <small>{request.solicitante_email}</small>}</div><time dateTime={request.created_at}>{dateLabel(request.created_at)}</time></div>
      <dl className="request-data">{[['Categoría',request.datos.categoria],['Modalidad',request.datos.modalidad],['Canchas',request.datos.cantidad_canchas],['Límite de equipos',request.datos.limite_equipos],['Hora de inicio',request.datos.hora_inicio],['Duración / descanso',request.datos.duracion_partido_min + ' / ' + request.datos.descanso_entre_partidos_min + ' min'],['Estado al crear',request.datos.activo ? 'Activo' : 'Inactivo']].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {request.motivo && <p className="request-note"><strong>Mensaje de mesa:</strong> {request.motivo}</p>}
      {request.estado!=='pendiente' && <div className="request-resolution"><p>{statuses[request.estado]} {request.resuelta_por_nombre ? 'por '+request.resuelta_por_nombre : 'por el administrador'} · {dateLabel(request.resuelta_at)}</p>{request.respuesta && <p>{request.respuesta}</p>}{request.campeonato_id && <Link className="manage-link" to={'/campeonatos/' + request.campeonato_id + '/gestion'}>Ver campeonato <Icon name="arrow" size={16} /></Link>}</div>}
      {admin && request.estado==='pendiente' && <div className="request-actions"><button className="button" onClick={() => review(request,'rechazar')}>Rechazar</button><button className="button primary" onClick={() => review(request,'aprobar')}><Icon name="check" size={17} />Aprobar y crear</button></div>}
    </article>)}</div>}
    <dialog ref={dialog} className="dialog" aria-labelledby="request-dialog-title" onCancel={event => { if (busy) event.preventDefault(); }}>
      <div className="dialog-header"><h2 id="request-dialog-title">{decision==='aprobar' ? 'Aprobar campeonato' : 'Rechazar solicitud'}</h2><button className="icon-button" disabled={busy} onClick={() => dialog.current.close()} aria-label="Cerrar revisión"><Icon name="close" /></button></div>
      <form onSubmit={resolve}><div className="dialog-body">
        {formError && <div className="alert" role="alert">{formError}</div>}
        <p>{decision==='aprobar' ? 'Se registrará' : 'Se rechazará la creación de'} <strong>{selected?.datos.nombre}</strong>, solicitado por <strong>{selected?.solicitante_nombre}</strong>.</p>
        <label className="field"><span>Respuesta para mesa (opcional)</span><textarea rows={3} maxLength={500} value={respuesta} onChange={event => setRespuesta(event.target.value)} /></label>
      </div><div className="dialog-footer"><button type="button" className="button" disabled={busy} onClick={() => dialog.current.close()}>Cancelar</button><button className={'button ' + (decision==='aprobar' ? 'primary' : 'danger')} type="submit" disabled={busy}>{busy ? 'Procesando…' : decision==='aprobar' ? 'Aprobar y crear campeonato' : 'Rechazar solicitud'}</button></div></form>
    </dialog>
  </>;
}