import { useState } from 'react';
import api from '../../services/api';
import Icon from '../ui/Icon';
import ImageUpload from './ImageUpload';
import RosterDialog from './RosterDialog';

export default function TeamForm({ team, championshipId, onSaved, onClose }) {
  const editing = Boolean(team?.id);
  const [form, setForm] = useState(() => ({ nombre: team?.nombre || '', curso: team?.curso || '', delegado_nombre: team?.delegado_nombre || '', delegado_telefono: team?.delegado_telefono || '', escudo: team?.escudo || null }));
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (field, value) => setForm(previous => ({ ...previous, [field]: value }));
  async function save(event) {
    event.preventDefault();
    if (busy || imageBusy) return;
    if (['nombre', 'curso', 'delegado_nombre', 'delegado_telefono'].some(field => !form[field].trim())) { setError('Completa los datos del equipo y del delegado. No se admiten campos vacíos ni solo espacios.'); return; }
    setBusy(true); setError('');
    try {
      const payload = { ...form, nombre: form.nombre.trim(), curso: form.curso.trim(), delegado_nombre: form.delegado_nombre.trim(), delegado_telefono: form.delegado_telefono.trim() };
      const { data } = editing ? await api.put('/equipos/' + team.id, payload) : await api.post('/campeonatos/' + championshipId + '/equipos', payload);
      onSaved(data); onClose();
    } catch (err) { setError(err.response?.data?.error || 'No pudimos guardar el equipo. Vuelve a intentarlo.'); }
    finally { setBusy(false); }
  }
  return <RosterDialog title={editing ? 'Editar equipo' : 'Registrar equipo'} onClose={onClose} busy={busy}>
    <form onSubmit={save}>
      <div className="dialog-body">
        {error && <div className="alert" role="alert">{error}</div>}
        <fieldset className="roster-form-fields" disabled={busy}>
          <ImageUpload value={form.escudo} onChange={value => update('escudo', value)} name={form.nombre} disabled={busy} onProcessingChange={setImageBusy} />
          <div className="form-grid">
            <label className="field wide"><span>Nombre del equipo</span><input autoFocus required maxLength={100} value={form.nombre} onChange={event => update('nombre', event.target.value)} placeholder="Nombre del equipo" /></label>
            <label className="field wide"><span>Curso</span><input required maxLength={80} value={form.curso} onChange={event => update('curso', event.target.value)} placeholder="Ej.: 6.º A" /></label>
            <label className="field"><span>Nombre del delegado</span><input required maxLength={100} autoComplete="off" value={form.delegado_nombre} onChange={event => update('delegado_nombre', event.target.value)} /></label>
            <label className="field"><span>Teléfono del delegado</span><input type="tel" required maxLength={30} autoComplete="off" value={form.delegado_telefono} onChange={event => update('delegado_telefono', event.target.value)} placeholder="Número de contacto" /></label>
          </div>
        </fieldset>
      </div>
      <div className="dialog-footer"><button type="button" className="button" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className="button primary" disabled={busy || imageBusy}><Icon name="check" size={17} />{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar equipo'}</button></div>
    </form>
  </RosterDialog>;
}