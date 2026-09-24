import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Icon from '../components/ui/Icon';
import { useAuth } from '../context/AuthContext';
import { useRequests } from '../context/RequestsContext';

const emptyForm = { nombre: '', modalidad: 'Ida y vuelta', categoria: 'Varones', cantidad_canchas: 2, limite_equipos: 12, hora_inicio: '18:00', duracion_partido_min: 40, descanso_entre_partidos_min: 10, activo: true };
const recordId = row => row.id_campeonato ?? row.id;
const listFrom = data => Array.isArray(data) ? data : (data.campeonatos || data.data || []);
const messageFrom = error => error.response?.data?.error || 'No pudimos conectar con el servidor. Vuelve a intentarlo.';

export default function CampeonatosView() {
  const { user, can } = useAuth();
  const { requests, refresh: refreshRequests } = useRequests();
  const isMesa = user.role==='mesa';
  const mayCreate = can('campeonatos:crear') || can('campeonatos:solicitar');
  const pendingRequest = requests.find(item => item.estado==='pendiente');
  const approvedRequests = requests.filter(item => item.estado==='aprobada').length;
  const [motivo, setMotivo] = useState('');
  const [campeonatos, setCampeonatos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useRef(null);
  const deleteDialog = useRef(null);
  const loadRequest = useRef(0);

  async function load() {
    const request = ++loadRequest.current;
    setLoading(true); setError('');
    try {
      const records = listFrom((await api.get('/campeonatos')).data);
      if (request === loadRequest.current) setCampeonatos(records);
    } catch (err) { if (request === loadRequest.current) setError(messageFrom(err)); }
    finally { if (request === loadRequest.current) setLoading(false); }
  }
  useEffect(() => { load(); return () => { loadRequest.current++; }; }, [approvedRequests]);
  function openForm(record = null) {
    setEditing(record); setFormError(''); setMotivo('');
    setForm(record ? { ...emptyForm, ...Object.fromEntries(Object.keys(emptyForm).map(key => [key, record[key] ?? emptyForm[key]])) } : { ...emptyForm });
    dialog.current.showModal();
  }
  function change(event) {
    const { name, value, checked, type } = event.target;
    setForm(current => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  }
  async function save(event) {
    event.preventDefault();
    const payload = { ...form, nombre: form.nombre.trim() };
    if (!payload.nombre) { setFormError('Escribe el nombre del campeonato.'); return; }
    for (const field of ['cantidad_canchas', 'limite_equipos', 'duracion_partido_min', 'descanso_entre_partidos_min']) payload[field] = Number(payload[field]);
    setBusy(true); setFormError('');
    try {
      if (editing) await api.put('/campeonatos/' + recordId(editing), payload);
      else if (isMesa) await api.post('/solicitudes-campeonato', { datos: payload, motivo });
      else await api.post('/campeonatos', payload);
      dialog.current.close();
      setNotice(editing ? 'Los cambios del campeonato se guardaron.' : isMesa ? 'Solicitud enviada al administrador. El campeonato se creará cuando la apruebe.' : 'El campeonato se creó correctamente.');
      if (isMesa && !editing) await refreshRequests();
      await load();
    } catch (err) { setFormError(messageFrom(err)); }
    finally { setBusy(false); }
  }
  function closeDelete() {
    deleteDialog.current.close();
    setDeleting(null); setDeleteError('');
  }
  async function remove() {
    if (!deleting || busy || !can('campeonatos:eliminar')) return;
    const deletedId = recordId(deleting);
    setBusy(true); setDeleteError('');
    try {
      await api.delete('/campeonatos/' + deletedId);
      loadRequest.current++;
      setCampeonatos(current => current.filter(row => recordId(row) !== deletedId));
      closeDelete();
      setNotice('El campeonato y sus datos asociados se eliminaron. El historial de auditoría se conserva.');
      await load();
    } catch (err) { setDeleteError(messageFrom(err)); }
    finally { setBusy(false); }
  }
  const active = campeonatos.filter(c => c.activo === true).length;
  return <>
    <div className="page-header"><div><span className="eyebrow">EL JUEGO EMPIEZA AQUÍ</span><h1>Campeonatos</h1><p>{user.role==='arbitro' ? 'Consulta los torneos y sus detalles.' : 'Organiza tus torneos y gestiona cada encuentro.'}</p></div>{mayCreate && <button className="button primary" disabled={isMesa && Boolean(pendingRequest)} onClick={() => openForm()}><Icon name="plus" size={19} />{isMesa ? 'Solicitar campeonato' : 'Nuevo campeonato'}</button>}</div>
    {isMesa && <div className="alert info"><Icon name="shield" /><div><p>{pendingRequest ? 'Tienes una solicitud pendiente de revisión. Puedes seguir consultando y editando los campeonatos existentes.' : 'Puedes editar campeonatos. Para crear uno, envía una solicitud: cada aprobación registra un solo campeonato.'}</p><Link className="manage-link" to="/solicitudes">Ver mis solicitudes <Icon name="arrow" size={16} /></Link></div></div>}
    {notice && <div className="alert success" role="status"><Icon name="check" /><span>{notice}</span></div>}
    {error && <div className="alert" role="alert"><Icon name="info" /><div><p>{error}</p><button className="button quiet" onClick={load}>Volver a intentar</button></div></div>}
    <div className="summary-strip" aria-label="Resumen de campeonatos">
      {[['trophy', '', 'Total de torneos', campeonatos.length], ['check', 'slate', 'Activos', active], ['clock', 'gold', 'Inactivos', campeonatos.filter(c => c.activo === false).length]].map(([icon, color, label, value]) => <div className="summary-item" key={label}><span className={'stat-icon ' + color}><Icon name={icon} /></span><div><strong>{loading || error ? '—' : String(value).padStart(2, '0')}</strong><small>{label}</small></div></div>)}
    </div>
    <div className="section-heading"><h2>Tus campeonatos</h2><small>{loading ? 'Actualizando…' : error ? 'Consulta no disponible' : campeonatos.length + ' registrados'}</small></div>
    {loading ? <div className="empty-state" role="status"><Icon name="trophy" size={32} /><p>Cargando campeonatos…</p></div> : !error && campeonatos.length === 0 ? <div className="empty-state"><Icon name="trophy" size={38} /><h2>Todavía no hay campeonatos</h2><p>{mayCreate ? 'Registra el próximo torneo para comenzar a organizarlo.' : 'Los torneos registrados aparecerán aquí.'}</p>{mayCreate && <button className="button primary" disabled={isMesa && Boolean(pendingRequest)} onClick={() => openForm()}><Icon name="plus" />{isMesa ? 'Solicitar campeonato' : 'Crear campeonato'}</button>}</div> :
      <div className="championship-grid">{campeonatos.map((c, index) => <article className="champ-card" key={recordId(c)}>
        <div className="card-body"><div className="card-top"><span className={'tournament-icon' + (index % 2 ? ' alternate' : '')}><Icon name="trophy" size={28} /></span><span className={'badge' + (c.activo ? '' : ' inactive')}>{c.activo ? 'Activo' : 'Inactivo'}</span></div>
          <p className="card-kicker">{c.categoria || 'Sin categoría'}</p><h3>{c.nombre}</h3><p className="card-mode">{c.modalidad}</p>
          <dl className="card-details">
            <div><Icon name="users" size={18} /><div><dt>Límite de equipos</dt><dd>{c.limite_equipos} equipos</dd></div></div>
            <div><Icon name="court" size={18} /><div><dt>Canchas habilitadas</dt><dd>{c.cantidad_canchas ?? 'Sin definir'}</dd></div></div>
            <div><Icon name="clock" size={18} /><div><dt>Hora de inicio</dt><dd>{c.hora_inicio?.slice(0, 5) || 'Sin definir'}</dd></div></div>
            <div><Icon name="calendar" size={18} /><div><dt>Duración por partido</dt><dd>{c.duracion_partido_min ?? '—'} min</dd></div></div>
          </dl>
        </div>
        <div className="card-footer"><Link className="manage-link" to={'/campeonatos/' + recordId(c) + '/gestion'}>{can('campeonatos:editar') ? 'Administrar torneo' : 'Ver detalles'} <Icon name="arrow" size={17} /></Link><div className="card-tools">{can('auditoria:ver') && <Link className="icon-button" aria-label={'Historial de ' + c.nombre} title="Ver historial" to={'/historial?campeonato_id=' + recordId(c)}><Icon name="clock" size={18} /></Link>}{can('campeonatos:editar') && <button className="icon-button" title={'Editar ' + c.nombre} aria-label={'Editar ' + c.nombre} onClick={() => openForm(c)}><Icon name="edit" size={18} /></button>}{can('campeonatos:eliminar') && <button className="icon-button delete" title={'Eliminar ' + c.nombre} aria-label={'Eliminar ' + c.nombre} onClick={() => { setDeleting(c); setDeleteError(''); deleteDialog.current.showModal(); }}><Icon name="trash" size={18} /></button>}</div></div>
      </article>)}</div>}
    <dialog className="dialog" ref={dialog} aria-labelledby="championship-dialog-title" onCancel={event => { if (busy) event.preventDefault(); }}>
      <div className="dialog-header"><h2 id="championship-dialog-title">{editing ? 'Editar campeonato' : isMesa ? 'Solicitar campeonato' : 'Nuevo campeonato'}</h2><button className="icon-button" aria-label="Cerrar formulario" disabled={busy} onClick={() => dialog.current.close()}><Icon name="close" /></button></div>
      <form onSubmit={save}><div className="dialog-body">{formError && <div className="alert" role="alert">{formError}</div>}<div className="form-grid">
        <label className="field wide"><span>Nombre del campeonato</span><input name="nombre" value={form.nombre} onChange={change} placeholder="Ej. Copa de Futsal 2026" required maxLength={100} autoFocus /></label>
        <label className="field"><span>Modalidad</span><select name="modalidad" value={form.modalidad} onChange={change}><option>Solamente ida</option><option>Ida y vuelta</option>{!['Solamente ida', 'Ida y vuelta'].includes(form.modalidad) && <option>{form.modalidad}</option>}</select></label>
        <label className="field"><span>Categoría</span><select name="categoria" value={form.categoria} onChange={change}><option>Varones</option><option>Damas</option><option>Mixto</option>{!['Varones', 'Damas', 'Mixto'].includes(form.categoria) && <option>{form.categoria}</option>}</select></label>
        <label className="field"><span>Canchas habilitadas</span><input type="number" name="cantidad_canchas" min="1" step="1" required value={form.cantidad_canchas} onChange={change} /></label>
        <label className="field"><span>Límite de equipos</span><input type="number" name="limite_equipos" min="2" step="1" required value={form.limite_equipos} onChange={change} /></label>
        <label className="field"><span>Hora de inicio</span><input type="time" name="hora_inicio" required value={form.hora_inicio} onChange={change} /></label>
        <label className="field"><span>Duración del partido (min)</span><input type="number" name="duracion_partido_min" min="1" step="1" required value={form.duracion_partido_min} onChange={change} /></label>
        <label className="field"><span>Descanso entre partidos (min)</span><input type="number" name="descanso_entre_partidos_min" min="0" step="1" required value={form.descanso_entre_partidos_min} onChange={change} /></label>
        <label className="checkbox-field"><input type="checkbox" name="activo" checked={form.activo} onChange={change} />Campeonato activo</label>
        {isMesa && !editing && <label className="field wide"><span>Mensaje para el administrador (opcional)</span><textarea maxLength={500} rows={3} value={motivo} onChange={event => setMotivo(event.target.value)} placeholder="Explica para qué necesitas crear este campeonato." /></label>}
      </div></div><div className="dialog-footer"><button className="button" type="button" disabled={busy} onClick={() => dialog.current.close()}>Cancelar</button><button className="button primary" type="submit" disabled={busy}>{busy ? 'Enviando…' : editing ? 'Guardar cambios' : isMesa ? 'Enviar solicitud' : 'Crear campeonato'}</button></div></form>
    </dialog>
    <dialog className="dialog" ref={deleteDialog} aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description" onCancel={event => { if (busy) event.preventDefault(); else { setDeleting(null); setDeleteError(''); } }}>
      <div className="dialog-header"><h2 id="delete-dialog-title">Eliminar campeonato</h2><button className="icon-button" aria-label="Cancelar eliminación" disabled={busy} onClick={closeDelete}><Icon name="close" /></button></div>
      <div className="dialog-body">{deleteError && <div className="alert" role="alert">{deleteError}</div>}<p id="delete-dialog-description">¿Quieres eliminar <strong>{deleting?.nombre}</strong> y todos sus datos asociados?</p><p>Se eliminarán sus equipos, jugadores, partidos, resultados, asistencias, sanciones y programación de fechas. El historial de auditoría se conservará.</p><p>Esta acción no se puede deshacer.</p></div>
      <div className="dialog-footer"><button className="button" autoFocus disabled={busy} onClick={closeDelete}>Cancelar</button><button className="button danger" disabled={busy || !deleting} onClick={remove}>{busy ? 'Eliminando…' : 'Eliminar campeonato y datos'}</button></div>
    </dialog>
  </>;
}
