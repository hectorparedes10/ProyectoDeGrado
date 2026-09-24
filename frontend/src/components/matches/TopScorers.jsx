import { useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import Icon from '../ui/Icon';
import TeamImage from '../teams/TeamImage';
import PlayerProfile from '../teams/PlayerProfile';
import './Matches.css';
export default function TopScorers({campeonatoId}) {
  const [players,setPlayers]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState(null),[opening,setOpening]=useState(null),[refresh,setRefresh]=useState(0);
  const generation=useRef(0),profileRequest=useRef(0);
  useEffect(()=>{let active=true;setOpening(null);async function load(first=false){const request=++generation.current;if(first)setLoading(true);try{const {data}=await api.get('/campeonatos/'+campeonatoId+'/goleadores');if(active&&request===generation.current){setPlayers(data);setError('');}}catch(err){if(active&&request===generation.current)setError(err.response?.data?.error||'No pudimos cargar los goleadores.');}finally{if(active&&request===generation.current)setLoading(false);}}load(true);const focus=()=>load();window.addEventListener('focus',focus);const timer=setInterval(()=>load(),20000);return()=>{active=false;generation.current++;profileRequest.current++;clearInterval(timer);window.removeEventListener('focus',focus);};},[campeonatoId,refresh]);
  async function profile(player){const request=++profileRequest.current;setOpening(player.id);try{const {data}=await api.get('/jugadores/'+player.id);if(request===profileRequest.current)setSelected(data);}catch(err){if(request===profileRequest.current)setError(err.response?.data?.error||'No pudimos abrir la ficha.');}finally{if(request===profileRequest.current)setOpening(null);}}
  return <section className="top-scorers"><div className="section-heading"><div><h2>Máximos goleadores</h2><p className="field-help">Goles acumulados en los partidos finalizados de este campeonato.</p></div><button className="button" disabled={loading} onClick={()=>setRefresh(value=>value+1)}>Actualizar</button></div>
    {error&&<div className="alert" role="alert">{error}</div>}
    {loading&&players.length===0?<div className="empty-state" role="status">Cargando clasificación…</div>:players.length===0&&!error?<div className="panel module-empty"><Icon name="chart" size={34}/><h3>La clasificación comienza con el primer gol</h3><p>Al finalizar un partido con goles registrados, sus jugadores aparecerán aquí.</p></div>:<div className="panel scorers-panel"><div className="table-wrap"><table><thead><tr><th>POS.</th><th>JUGADOR</th><th>EQUIPO</th><th>PARTIDOS</th><th>GOLES</th></tr></thead><tbody>{players.map(player=><tr key={player.id}><td><span className={'scorer-position'+(player.posicion===1?' first':'')}>{player.posicion}</span></td><td><button className="scorer-player" onClick={()=>profile(player)} disabled={opening!==null}><TeamImage portrait src={player.foto} name={player.nombre_completo}/><span><strong>{player.nombre_completo}</strong><small>#{player.dorsal??'—'} · {player.curso||'Curso sin registrar'}</small></span></button></td><td>{player.equipo_nombre}</td><td>{player.partidos_jugados}</td><td><strong className="scorer-goals">{player.goles}</strong></td></tr>)}</tbody></table></div></div>}
    {opening!==null&&<p className="field-help" role="status">Abriendo ficha…</p>}
    {selected&&<PlayerProfile player={selected} team={{nombre:selected.equipo_nombre}} onClose={()=>setSelected(null)}/>}
  </section>;
}
