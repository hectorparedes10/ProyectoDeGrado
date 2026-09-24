import Icon from '../ui/Icon';
import { playerName } from '../../utils/teamImages';
import RosterDialog from './RosterDialog';
import TeamImage from './TeamImage';

export default function PlayerProfile({ player, team, onClose, onEdit, onDelete }) {
  const name = playerName(player);
  return <RosterDialog title="Ficha del jugador" compact onClose={onClose}>
    <div className="dialog-body player-profile-body">
      <TeamImage portrait src={player.foto} name={name} />
      <h3>{name}</h3>
      {player.eliminado && <p className="player-retired-note">Jugador retirado del plantel. Se conserva su historial.</p>}
      <dl className="player-profile-data">
        <div className="wide"><dt>Equipo</dt><dd>{team.nombre}</dd></div>
        <div><dt>Curso</dt><dd>{player.curso || 'Sin registrar'}</dd></div>
        <div><dt>Edad</dt><dd>{player.edad === null || player.edad === undefined ? 'Sin registrar' : player.edad + (player.edad === 1 ? ' año' : ' años')}</dd></div>
        <div className="wide"><dt>Dorsal</dt><dd>{player.dorsal ?? 'Sin asignar'}</dd></div>
      </dl>
      <dl className="player-profile-stats">{[['Partidos', player.partidos_jugados ?? 0], ['Goles', player.goles ?? 0], ['Amarillas', player.amarillas ?? 0], ['Rojas', player.rojas ?? 0]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p>Totales en partidos finalizados.</p>
    </div>
    <div className="dialog-footer">{onDelete && !player.eliminado && <button type="button" className="button danger" onClick={onDelete}><Icon name="trash" size={17} />Eliminar</button>}<button type="button" className="button" onClick={onClose}>Cerrar</button>{onEdit && !player.eliminado && <button type="button" className="button primary" onClick={onEdit}><Icon name="edit" size={17} />Editar jugador</button>}</div>
  </RosterDialog>;
}