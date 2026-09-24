import { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRequests } from '../context/RequestsContext';
import { roleLabel } from '../components/layout/AppLayout';
import Icon from '../components/ui/Icon';
import api from '../services/api';
import { requestDateLabel, requestTimeLabel } from '../utils/requestTime';
import './RecuperacionesView.css';

const statuses = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada', cancelada: 'Cancelada' };
export default function RecuperacionesView() {
  const { user } = useAuth();
  const { recoveryRequests, loading, error, refresh, recoveryPendingCount } = useRequests();
  const [selected, setSelected] = useState(null);
  const [decision, setDecision] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef(null);
  const displayed = [...recoveryRequests].sort((a,b) => Number(b.estado==='pendiente')-Number(a.estado==='pendiente') || new Date(b.created_at)-new Date(a.created_at));
  function review(request, value) {
    setSelected(request); setDecision(value); setRespuesta(''); setFormError(''); dialog.current.showModal();
  }
  async function resolve(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setFormError('');
    try {
      const { data } = await api.patch('/solicitudes-recuperacion/' + selected.id, { decision, respuesta });
      dialog.current.close();
      setNotice(data.message);
      await refresh();
    } catch (err) { setFormError(err.response?.data?.error || 'No pudimos resolver la solicitud.'); await refresh(); }
    finally { setBusy(false); }
  }
  return <>
    <div className="page-header"><div><span className="eyebrow">SEGURIDAD DE LAS CUENTAS</span><h1>Recuperación de acceso</h1><p>Revisa quién solicita cambiar su contraseña y el momento en que envió la solicitud.</p></div><button className="button" onClick={refresh} disabled={loading}>Actualizar</button></div>
    {notice && <div className="alert success" role="status"><Icon name="check" /><span>{notice}</span></div>}
    {error && <div className="alert" role="alert">{error}</div>}
    <p className="recovery-timezone"><Icon name="clock" size={18} />Fechas y horas de Bolivia (UTC−4). Horario de 24 horas.</p>
    <div className="section-heading"><h2>{recoveryPendingCount} {recoveryPendingCount===1 ? 'solicitud pendiente' : 'solicitudes pendientes'}</h2><small>{displayed.length} en el historial</small></div>
    {loading && displayed.length===0 ? <div className="empty-state" role="status">Cargando recuperaciones…</div> : displayed.length===0 && !error ? <div className="empty-state"><Icon name="lock" size={36} /><h2>No hay solicitudes de recuperación</h2><p>Las solicitudes enviadas desde «¿Olvidaste tu contraseña?» aparecerán aquí con su fecha, hora e IP de origen.</p></div> :
    <div className="request-list">{displayed.map(request => <article className="panel request-card recovery-request-card" key={request.id}>
      <div className="section-heading"><div><span className="card-kicker">CAMBIO DE CONTRASEÑA · #{request.id}</span><h2>{request.solicitante_nombre}</h2></div><span className={'badge ' + (request.estado==='pendiente' ? 'preview' : ['rechazada','cancelada'].includes(request.estado) ? 'rejected' : '')}>{statuses[request.estado]}</span></div>
      <div className="request-person"><Icon name="users" size={18} /><div><small>Usuario / correo de acceso</small><strong>{request.email_usuario}</strong></div></div>
      <dl className="request-data recovery-request-data">
        <div className="recovery-request-timestamp"><dt>Fecha de solicitud</dt><dd><time dateTime={request.created_at}>{requestDateLabel(request.created_at)}</time></dd></div>
        <div className="recovery-request-timestamp"><dt>Hora de solicitud (Bolivia)</dt><dd><time dateTime={request.created_at}>{requestTimeLabel(request.created_at)}</time></dd></div>
        <div className="recovery-request-ip"><dt>Dirección IP de origen</dt><dd>{request.ip_origen || 'No registrada'}</dd></div>
        <div><dt>Rol</dt><dd>{roleLabel(request.solicitante_rol)}</dd></div>
        <div><dt>Estado de la cuenta</dt><dd>{request.solicitante_eliminado ? 'Eliminada' : request.solicitante_activo ? 'Activa' : 'Inactiva'}</dd></div>
      </dl>
      {request.estado!=='pendiente' && <div className="request-resolution"><p>{statuses[request.estado]} {request.resuelta_por_nombre ? 'por '+request.resuelta_por_nombre : request.estado==='cancelada' ? 'por actualización de la cuenta' : 'por el administrador'}.</p><p>Resuelta el <time dateTime={request.resuelta_at}>{requestDateLabel(request.resuelta_at)} a las {requestTimeLabel(request.resuelta_at)}</time> (Bolivia).</p>{request.respuesta && <p>{request.respuesta}</p>}</div>}
      {request.estado==='pendiente' && <div className="request-actions"><button className="button" onClick={() => review(request,'rechazar')}>Rechazar</button><button className="button primary" onClick={() => review(request,'aprobar')} disabled={!request.solicitante_activo || request.solicitante_eliminado || request.usuario_id===user.id} title={request.usuario_id===user.id ? 'Otro administrador debe aprobar tu recuperación' : undefined}><Icon name="check" size={17} />Aprobar recuperación</button></div>}
    </article>)}</div>}
    <dialog ref={dialog} className="dialog" aria-labelledby="recovery-dialog-title" onCancel={event => { if (busy) event.preventDefault(); }}>
      <div className="dialog-header"><h2 id="recovery-dialog-title">{decision==='aprobar' ? 'Aprobar recuperación' : 'Rechazar solicitud'}</h2><button className="icon-button" disabled={busy} onClick={() => dialog.current.close()} aria-label="Cerrar revisión"><Icon name="close" /></button></div>
      <form onSubmit={resolve}><div className="dialog-body">
        {formError && <div className="alert" role="alert">{formError}</div>}
        <p>{decision==='aprobar' ? 'Se restablecerá el acceso de' : 'Se rechazará la recuperación de'} <strong>{selected?.solicitante_nombre}</strong> ({selected?.email_usuario}).</p>
        {selected && <p className="field-help">Solicitada el {requestDateLabel(selected.created_at)} a las {requestTimeLabel(selected.created_at)} (Bolivia).</p>}
        {selected && <p className="field-help recovery-ip-detail">Dirección IP de origen: <strong>{selected.ip_origen || 'No registrada'}</strong></p>}
        {decision==='aprobar' && <><p>Confirma con esta persona que solicitó recuperar su cuenta. La solicitud se envió desde el login, sin iniciar sesión.</p><div className="alert info"><Icon name="lock" /><p>Se asignará la clave temporal <b>12345678</b> por 24 horas y se cerrarán sus sesiones. Al entrar, deberá crear y confirmar una contraseña nueva antes de acceder al sistema.</p></div></>}
        <label className="field"><span>Observación (opcional)</span><textarea rows={3} maxLength={500} value={respuesta} onChange={event => setRespuesta(event.target.value)} /></label>
      </div><div className="dialog-footer"><button type="button" className="button" disabled={busy} onClick={() => dialog.current.close()}>Cancelar</button><button className={'button ' + (decision==='aprobar' ? 'primary' : 'danger')} type="submit" disabled={busy}>{busy ? 'Procesando…' : decision==='aprobar' ? 'Aprobar y restablecer acceso' : 'Rechazar solicitud'}</button></div></form>
    </dialog>
  </>;
}