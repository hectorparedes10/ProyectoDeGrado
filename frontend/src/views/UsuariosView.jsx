import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { initials, roleLabel } from '../components/layout/AppLayout';
import Icon from '../components/ui/Icon';
import api from '../services/api';

const emptyForm = { nombre: '', email: '', telefono: '', email_recuperacion: '', password: '', rol: 'mesa', activo: true };
const roleDescriptions = {
  admin: 'Gestiona usuarios, campeonatos, solicitudes y el historial de cambios.',
  mesa: 'Ve y edita campeonatos. Solicita aprobación para crear uno. No elimina ni accede a Usuarios.',
  arbitro: 'Solo consulta campeonatos y detalles. Sin creación, edición, eliminación ni resultados.',
};
const errorMessage = err => err.response?.data?.error || 'No pudimos completar la operación. Inténtalo de nuevo.';
export default function UsuariosView() {
  const { user, logout, refresh: refreshSession } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [changingId, setChangingId] = useState(null);
  const dialog = useRef(null);
  const deleteDialog = useRef(null);
  async function load() {
    setLoading(true); setError('');
    try { setUsers((await api.get('/usuarios')).data); }
    catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  function open(record = null) {
    setEditing(record); setFormError('');
    setForm(record ? { nombre: record.nombre, email: record.email, telefono: record.telefono || '', email_recuperacion: record.email_recuperacion || '', rol: record.role, activo: record.activo, password: '' } : { ...emptyForm });
    dialog.current.showModal();
  }
  function change(event) {
    setForm(current => ({ ...current, [event.target.name]: event.target.type==='checkbox' ? event.target.checked : event.target.value }));
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setFormError('');
    try {
      if (editing) {
        const changes = Object.fromEntries(Object.entries(form).filter(([key,value]) => value !== (editing[key] ?? '') && (key!=='password' || value)));
        await api.put('/usuarios/' + editing.id, changes);
      }
      else await api.post('/usuarios', form);
      dialog.current.close();
      setNotice(editing ? 'Usuario actualizado.' : 'Usuario creado. Ya puede iniciar sesión con sus datos.');
      if (editing?.id===user.id && form.password) {
        await logout().catch(() => {});
        navigate('/login', { replace: true, state: { notice: 'Contraseña actualizada. Inicia sesión nuevamente.' } });
        return;
      }
      await load();
      if (editing?.id===user.id) await refreshSession();
    } catch (err) { setFormError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function toggleState(record) {
    setChangingId(record.id); setError(''); setNotice('');
    try {
      const { data } = await api.patch('/usuarios/' + record.id + '/estado', { activo: !record.activo });
      setUsers(items => items.map(item => item.id===record.id ? data : item));
      setNotice(data.nombre + (data.activo ? ' está activo.' : ' está inactivo y sus sesiones se cerraron.'));
    } catch (err) { setError(errorMessage(err)); }
    finally { setChangingId(null); }
  }
  async function remove() {
    setBusy(true); setFormError('');
    try {
      await api.delete('/usuarios/' + deleting.id);
      setUsers(items => items.filter(item => item.id!==deleting.id));
      deleteDialog.current.close(); setDeleting(null);
      setNotice('Usuario eliminado. Su historial de acciones se conserva.');
    } catch (err) { setFormError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <>
    <div className="page-header"><div><span className="eyebrow">ADMINISTRACIÓN</span><h1>Usuarios y roles</h1><p>Define quién puede acceder y qué acciones puede realizar.</p></div><button className="button primary" onClick={() => open()}><Icon name="plus" size={19} />Nuevo usuario</button></div>
    {notice && <div className="alert success" role="status"><Icon name="check" /><span>{notice}</span></div>}
    {error && <div className="alert" role="alert"><div><p>{error}</p><button className="button quiet" onClick={load}>Volver a intentar</button></div></div>}
    <div className="role-summary">{Object.entries(roleDescriptions).map(([role, description]) => <article className="panel" key={role}><span className="stat-icon"><Icon name={role==='admin' ? 'shield' : role==='mesa' ? 'users' : 'trophy'} /></span><h2>{roleLabel(role)}</h2><p>{description}</p></article>)}</div>
    <div className="section-heading"><h2>Usuarios del sistema</h2><small>{loading ? 'Cargando…' : users.length + ' registrados'}</small></div>
    <p className="field-help">Pulsa el estado de una cuenta para activar o desactivar su acceso.</p>
    <div className="panel users-panel"><div className="table-wrap"><table><thead><tr><th>USUARIO</th><th>CONTACTO</th><th>ROL</th><th>ESTADO</th><th>ACCIONES</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="5" className="table-empty" role="status">Cargando usuarios…</td></tr> : users.map(item => <tr key={item.id}>
        <td><div className="table-name"><span className="avatar">{initials(item.nombre)}</span><div><strong>{item.nombre}</strong>{item.id===user.id && <small className="muted-text">Tu cuenta</small>}{item.requiresPasswordChange && <small className="muted-text">Debe cambiar su contraseña</small>}</div></div></td>
        <td className="contact-cell"><span>{item.email}</span><small>Tel.: {item.telefono || 'Sin registrar'}</small><small>Recuperación: {item.email_recuperacion || 'Sin registrar'}</small></td>
        <td>{roleLabel(item.role)}</td>
        <td><button type="button" className={'badge state-button' + (item.activo ? '' : ' inactive')} role="switch" aria-checked={item.activo} aria-label={'Acceso de ' + item.nombre} disabled={item.id===user.id || changingId!==null} onClick={() => toggleState(item)} title={item.id===user.id ? 'No puedes desactivar tu propia cuenta' : 'Cambiar estado'}>{changingId===item.id ? 'Guardando…' : item.activo ? 'Activo' : 'Inactivo'}<span aria-hidden="true">⇄</span></button></td>
        <td><div className="card-tools"><button className="icon-button" onClick={() => open(item)} aria-label={'Editar usuario ' + item.nombre} title="Editar usuario"><Icon name="edit" size={18} /></button><button className="icon-button delete" disabled={item.id===user.id} onClick={() => { setDeleting(item); setFormError(''); deleteDialog.current.showModal(); }} aria-label={'Eliminar usuario ' + item.nombre} title={item.id===user.id ? 'No puedes eliminar tu propia cuenta' : 'Eliminar usuario'}><Icon name="trash" size={18} /></button></div></td>
      </tr>)}
      {!loading && !error && users.length===0 && <tr><td colSpan="5" className="table-empty">No hay usuarios para mostrar.</td></tr>}
    </tbody></table></div></div>
    <dialog className="dialog" ref={dialog} aria-labelledby="user-dialog-title" onCancel={event => { if (busy) event.preventDefault(); }}>
      <div className="dialog-header"><h2 id="user-dialog-title">{editing ? 'Editar usuario' : 'Nuevo usuario'}</h2><button className="icon-button" aria-label="Cerrar formulario" disabled={busy} onClick={() => dialog.current.close()}><Icon name="close" /></button></div>
      <form onSubmit={submit}><div className="dialog-body">{formError && <div className="alert" role="alert">{formError}</div>}<div className="form-grid">
        <label className="field wide"><span>Nombre completo</span><input name="nombre" required autoFocus maxLength={100} autoComplete="off" value={form.nombre} onChange={change} placeholder="Nombre y apellido" /></label>
        <label className="field wide"><span>Correo de acceso</span><input name="email" required type="email" maxLength={150} autoComplete="off" value={form.email} onChange={change} placeholder="usuario@correo.com" /></label>
        <label className="field"><span>Teléfono (opcional)</span><input name="telefono" type="tel" maxLength={30} autoComplete="off" value={form.telefono} onChange={change} placeholder="+591 70000000" /></label>
        <label className="field"><span>Correo de recuperación (opcional)</span><input name="email_recuperacion" type="email" maxLength={150} autoComplete="off" value={form.email_recuperacion} onChange={change} placeholder="correo.alternativo@ejemplo.com" /></label>
        <label className="field wide"><span>{editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}</span><input name="password" type="password" required={!editing} minLength={8} maxLength={128} autoComplete="new-password" value={form.password} onChange={change} placeholder={editing ? 'Deja vacío para mantener la actual' : 'Al menos 8 caracteres'} /></label>
        <label className="field wide"><span>Rol de acceso</span><select name="rol" value={form.rol} onChange={change} disabled={editing?.id===user.id}><option value="admin">Administrador</option><option value="mesa">Mesa de control</option><option value="arbitro">Árbitro</option></select><small className="field-help">{roleDescriptions[form.rol]}</small></label>
        <label className="checkbox-field"><input name="activo" type="checkbox" checked={form.activo} onChange={change} disabled={editing?.id===user.id} />Usuario activo</label>
      </div></div><div className="dialog-footer"><button type="button" className="button" disabled={busy} onClick={() => dialog.current.close()}>Cancelar</button><button type="submit" className="button primary" disabled={busy}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear usuario'}</button></div></form>
    </dialog>
    <dialog ref={deleteDialog} className="dialog" aria-labelledby="delete-user-title" onCancel={event => { if (busy) event.preventDefault(); }}>
      <div className="dialog-header"><h2 id="delete-user-title">Eliminar usuario</h2><button className="icon-button" aria-label="Cancelar eliminación" disabled={busy} onClick={() => deleteDialog.current.close()}><Icon name="close" /></button></div>
      <div className="dialog-body">{formError && <div className="alert" role="alert">{formError}</div>}<p>¿Eliminar a <strong>{deleting?.nombre}</strong>? La cuenta dejará de aparecer en Usuarios y perderá el acceso. Su autoría en el historial se conservará.</p></div>
      <div className="dialog-footer"><button className="button" autoFocus disabled={busy} onClick={() => deleteDialog.current.close()}>Cancelar</button><button className="button danger" disabled={busy} onClick={remove}>{busy ? 'Eliminando…' : 'Eliminar usuario'}</button></div>
    </dialog>
  </>;
}
