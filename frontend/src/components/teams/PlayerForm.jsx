import { useState } from 'react';
import api from '../../services/api';
import Icon from '../ui/Icon';
import { ageFromBirthDate, boliviaTodayISO } from '../../utils/teamImages';
import ImageUpload from './ImageUpload';
import RosterDialog from './RosterDialog';

export default function PlayerForm({ player, team, onSaved, onClose }) {
  const editing = Boolean(player?.id);
  const [form, setForm] = useState(() => ({ nombre: player?.nombre || '', apellido: player?.apellido || '', ci: player?.ci || '', curso: player?.curso || team.curso || '', fecha_nacimiento: player?.fecha_nacimiento || '', dorsal: player?.dorsal ?? '', foto: player?.foto || null }));
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (field, value) => setForm(previous => ({ ...previous, [field]: value }));
  const age = ageFromBirthDate(form.fecha_nacimiento);
  async function save(event) {
    event.preventDefault();
    if (busy || imageBusy) return;
    if (['nombre', 'apellido', 'ci', 'curso', 'fecha_nacimiento'].some(field => !String(form[field]).trim())) { setError('Completa todos los campos del jugador. No se admiten campos vacíos ni solo espacios.'); return; }
    if (!form.foto) { setError('La foto del jugador es obligatoria. Importa una imagen para continuar.'); return; }
    if (String(form.dorsal).trim() === '' || !Number.isInteger(Number(form.dorsal)) || Number(form.dorsal) < 0 || Number(form.dorsal) > 99) { setError('Asigna un dorsal entero del 0 al 99.'); return; }
    if (age === null) { setError('Ingresa una fecha de nacimiento válida que no sea futura.'); return; }
    setBusy(true); setError('');
    try {
      const payload = { ...form, nombre: form.nombre.trim(), apellido: form.apellido.trim(), ci: form.ci.trim().toUpperCase(), curso: form.curso.trim(), dorsal: Number(form.dorsal) };
      const { data } = editing ? await api.put('/jugadores/' + player.id, payload) : await api.post('/equipos/' + team.id + '/jugadores', payload);
      onSaved(data, editing); onClose();
    } catch (err) { setError(err.response?.data?.error || 'No pudimos guardar al jugador. Vuelve a intentarlo.'); }
    finally { setBusy(false); }
  }
  return <RosterDialog title={editing ? 'Editar jugador' : 'Registrar jugador'} onClose={onClose} busy={busy}>
    <form onSubmit={save}>
      <div className="dialog-body">
        {error && <div className="alert" role="alert">{error}</div>}
        <p className="roster-form-team">Equipo: <strong>{team.nombre}</strong></p>
        <p className="roster-form-required">Todos los campos y la foto son obligatorios.</p>
        <fieldset className="roster-form-fields" disabled={busy}>
          <ImageUpload value={form.foto} onChange={value => update('foto', value)} name={[form.nombre, form.apellido].join(' ')} portrait required disabled={busy} onProcessingChange={setImageBusy} />
          <div className="form-grid">
            <label className="field"><span>Nombres</span><input autoFocus required maxLength={100} autoComplete="off" value={form.nombre} onChange={event => update('nombre', event.target.value)} /></label>
            <label className="field"><span>Apellidos</span><input required maxLength={100} autoComplete="off" value={form.apellido} onChange={event => update('apellido', event.target.value)} /></label>
            <label className="field"><span>Cédula de identidad (CI)</span><input required maxLength={20} autoComplete="off" value={form.ci} onChange={event => update('ci', event.target.value)} /></label>
            <label className="field"><span>Curso</span><input required maxLength={80} value={form.curso} onChange={event => update('curso', event.target.value)} /></label>
            <label className="field"><span>Fecha de nacimiento</span><input type="date" required max={boliviaTodayISO()} value={form.fecha_nacimiento} onChange={event => update('fecha_nacimiento', event.target.value)} /><small className="field-help">{age === null ? 'La edad se calculará con esta fecha.' : 'Edad: ' + age + (age === 1 ? ' año' : ' años')}</small></label>
            <label className="field"><span>Dorsal</span><input type="number" required min={0} max={99} step={1} inputMode="numeric" value={form.dorsal} onChange={event => update('dorsal', event.target.value)} placeholder="0–99" /></label>
          </div>
        </fieldset>
      </div>
      <div className="dialog-footer"><button type="button" className="button" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className="button primary" disabled={busy || imageBusy}><Icon name="check" size={17} />{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar jugador'}</button></div>
    </form>
  </RosterDialog>;
}