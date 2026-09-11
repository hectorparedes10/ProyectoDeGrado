import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Icon from '../components/ui/Icon';
import { roleLabel } from '../components/layout/AppLayout';

const labels = { nombre: 'Nombre', modalidad: 'Modalidad', categoria: 'Categoría', cantidad_canchas: 'Canchas', limite_equipos: 'Límite de equipos', hora_inicio: 'Hora de inicio', duracion_partido_min: 'Duración del partido', descanso_entre_partidos_min: 'Descanso entre partidos', activo: 'Estado' };
const format = value => typeof value==='boolean' ? (value ? 'Activo' : 'Inactivo') : value ?? 'Sin definir';
export default function HistorialView() {
  const [params] = useSearchParams();
  const championshipId = params.get('campeonato_id');
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const load = useCallback(async (cursor = null) => {
    const request = ++generation.current;
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/auditoria/campeonatos', { params: { campeonato_id: championshipId || undefined, antes: cursor || undefined } });
      if (request!==generation.current) return;
      setItems(previous => cursor ? [...previous, ...data.items] : data.items); setNextCursor(data.nextCursor);
    } catch (err) { if (request===generation.current) setError(err.response?.data?.error || 'No pudimos cargar el historial.'); }
    finally { if (request===generation.current) setLoading(false); }
  }, [championshipId]);
  useEffect(() => { setItems([]); setNextCursor(null); load(); return () => { generation.current++; }; }, [load]);
  return <>
    <div className="page-header"><div><span className="eyebrow">CONTROL DE CAMBIOS</span><h1>Historial de campeonatos</h1><p>Consulta quién editó cada campeonato, cuándo y qué datos cambió.</p></div><button className="button" disabled={loading} onClick={() => load()}>Actualizar</button></div>
    {championshipId && <Link className="button quiet" to="/historial"><Icon name="back" size={17} />Ver todos los campeonatos</Link>}
    {error && <div className="alert" role="alert">{error}</div>}
    {loading && items.length===0 ? <div className="empty-state" role="status">Cargando historial…</div> : !error && items.length===0 ? <div className="empty-state"><Icon name="clock" size={36} /><h2>Sin ediciones registradas</h2><p>Las próximas modificaciones aparecerán aquí con su autor y fecha.</p></div> :
    <div className="request-list">{items.map(item => <article className="panel" key={item.id}>
      <div className="section-heading"><h2>{item.detalles.campeonato_nombre || 'Campeonato #' + item.detalles.campeonato_id}</h2><time className="field-help" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('es-BO')}</time></div>
      <p className="history-author"><Icon name="edit" size={17} /><strong>{item.usuario_nombre}</strong><span>{roleLabel(item.usuario_rol)}</span></p>
      {Object.keys(item.detalles.cambios || {}).length ? <div className="table-wrap"><table><thead><tr><th>CAMPO</th><th>ANTES</th><th>DESPUÉS</th></tr></thead><tbody>{Object.entries(item.detalles.cambios).map(([key,value]) => <tr key={key}><td>{labels[key] || key}</td><td>{String(format(value.antes))}</td><td>{String(format(value.despues))}</td></tr>)}</tbody></table></div> : <p className="field-help">Se guardó el campeonato sin detalle de diferencias.</p>}
    </article>)}</div>}
    {nextCursor && <div className="request-actions"><button className="button" disabled={loading} onClick={() => load(nextCursor)}>{loading ? 'Cargando…' : 'Cargar anteriores'}</button></div>}
  </>;
}
