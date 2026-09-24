import { useState } from 'react';
import { initialsForTeam } from '../../utils/teamImages';

export default function TeamImage({ src, name, portrait = false, className = '' }) {
  const [failedSource, setFailedSource] = useState(null);
  return <span className={(portrait ? 'player-portrait' : 'team-emblem') + ' ' + className}>
    {src && src !== failedSource ? <img src={src} alt={portrait ? 'Foto de ' + name : 'Escudo de ' + name} loading="lazy" onError={() => setFailedSource(src)} /> : <span aria-label={portrait ? 'Iniciales de ' + name : 'Emblema de ' + name}>{initialsForTeam(name)}</span>}
  </span>;
}