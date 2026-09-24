import { useEffect, useRef, useState } from 'react';
import { prepareTeamImage } from '../../utils/teamImages';
import TeamImage from './TeamImage';
import Icon from '../ui/Icon';

export default function ImageUpload({ value, onChange, name, portrait = false, required = false, disabled, onProcessingChange }) {
  const input = useRef(null);
  const active = useRef(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  async function select(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setError(''); setProcessing(true); onProcessingChange(true);
    try {
      const result = await prepareTeamImage(file, { maxDimension: portrait ? 768 : 512, signal: controller.signal });
      if (active.current === controller && !controller.signal.aborted) onChange(result);
    } catch (err) {
      if (active.current === controller && err.name !== 'AbortError') setError(err.message || 'No pudimos preparar la imagen.');
    } finally {
      if (active.current === controller && !controller.signal.aborted) { setProcessing(false); onProcessingChange(false); active.current = null; }
    }
  }
  function remove() {
    active.current?.abort(); active.current = null;
    setProcessing(false); onProcessingChange(false); setError(''); onChange(null);
  }
  return <div className="team-image-upload">
    <TeamImage src={value} name={name} portrait={portrait} />
    <div className="team-image-controls"><strong>{portrait ? 'Foto del jugador' : 'Escudo del equipo'} <span>{required ? '(obligatoria)' : '(opcional)'}</span></strong>
      <div className="team-upload-actions"><button type="button" className="button" onClick={() => input.current.click()} disabled={disabled}><Icon name="plus" size={16} />{value ? 'Cambiar imagen' : 'Importar imagen'}</button>{(value || processing) && <button type="button" className="button quiet" disabled={disabled} onClick={remove}>{processing ? 'Cancelar carga' : 'Quitar'}</button>}</div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={disabled} onChange={select} />
      <small className="field-help">PNG, JPG o WebP, hasta 8 MB.</small>
      {required && !value && <p className="field-help">Importa una foto para poder guardar al jugador.</p>}
      {processing && <p className="field-help" role="status">Preparando imagen…</p>}
      {error && <p className="team-image-error" role="alert">{error}</p>}
    </div>
  </div>;
}