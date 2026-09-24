import { useState } from 'react';
import api from '../../services/api';
import Icon from '../ui/Icon';
import RosterDialog from './RosterDialog';

export default function DeleteRosterDialog({ entity, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isTeam = entity.type === 'equipo';
  const label = isTeam ? 'equipo' : 'jugador';
  async function remove() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await api.delete((isTeam ? '/equipos/' : '/jugadores/') + entity.id);
      onDeleted(entity);
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos eliminar el ' + label + '. Vuelve a intentarlo.');
    } finally { setBusy(false); }
  }
  return <RosterDialog title={'Eliminar ' + label} compact busy={busy} onClose={onClose}>
    <div className="dialog-body roster-delete-body">
      {error && <div className="alert" role="alert">{error}</div>}
      <p>Vas a eliminar {isTeam ? 'el equipo' : 'al jugador'} <strong>{entity.name}</strong>.</p>
      <p>{isTeam ? 'Se borrarán definitivamente de la base de datos el equipo, sus jugadores, sus partidos y las estadísticas de esos encuentros.' : 'Se borrarán definitivamente de la base de datos el jugador, su foto, sus participaciones, goles y tarjetas. Los marcadores se recalcularán con los goles de los jugadores restantes.'}</p>
      <p>Esta acción no se puede deshacer. Se conservará el registro de quién realizó la eliminación.</p>
    </div>
    <div className="dialog-footer"><button type="button" className="button" disabled={busy} onClick={onClose} autoFocus>Cancelar</button><button type="button" className="button danger" disabled={busy} onClick={remove}><Icon name="trash" size={17} />{busy ? 'Eliminando…' : 'Eliminar ' + label}</button></div>
  </RosterDialog>;
}
