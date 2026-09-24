// All operations use the caller's transaction (including its audit and authorization).
// Legacy installations have extra tables, sometimes without foreign keys.
async function deleteLegacyRows(client, table, column, ids) {
  if (!ids.length) return;
  const exists = (await client.query(
    'SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 AND column_name=$2',
    [table, column])).rowCount;
  // Identifiers are exclusively literals from the calls below, never request input.
  if (exists) await client.query('DELETE FROM "' + table + '" WHERE "' + column + '"=ANY($1::int[])', [ids]);
}

async function deleteMatches(client, ids) {
  if (!ids.length) return 0;
  await deleteLegacyRows(client, 'asistencia_partido', 'partido_id', ids);
  await deleteLegacyRows(client, 'sanciones', 'partido_origen_id', ids);
  await deleteLegacyRows(client, 'transacciones_financieras', 'partido_id', ids);
  await client.query('DELETE FROM estadisticas_partido_jugador WHERE partido_id=ANY($1::int[])', [ids]);
  await client.query('DELETE FROM historial_participantes_partido WHERE partido_id=ANY($1::int[])', [ids]);
  return (await client.query('DELETE FROM partidos WHERE id=ANY($1::int[])', [ids])).rowCount;
}

async function deletePlayers(client, ids) {
  if (!ids.length) return 0;
  const affected = (await client.query(
    'SELECT partido_id FROM estadisticas_partido_jugador WHERE jugador_id=ANY($1::int[]) UNION SELECT partido_id FROM historial_participantes_partido WHERE jugador_id=ANY($1::int[])',
    [ids])).rows.map(row => row.partido_id);
  await deleteLegacyRows(client, 'asistencia_partido', 'jugador_id', ids);
  await deleteLegacyRows(client, 'sanciones', 'jugador_id', ids);
  await client.query('DELETE FROM estadisticas_partido_jugador WHERE jugador_id=ANY($1::int[])', [ids]);
  await client.query('DELETE FROM historial_participantes_partido WHERE jugador_id=ANY($1::int[])', [ids]);
  const count = (await client.query('DELETE FROM jugadores WHERE id=ANY($1::int[])', [ids])).rowCount;
  // Scores and the editable sheet must agree after removing a player's goals.
  // Bump revisions so a sheet open on another device cannot restore stale data.
  if (affected.length) await client.query(`
    UPDATE partidos p SET
      goles_local=(SELECT COALESCE(SUM(s.goles),0) FROM estadisticas_partido_jugador s WHERE s.partido_id=p.id AND s.equipo_id=p.equipo_local_id),
      goles_visitante=(SELECT COALESCE(SUM(s.goles),0) FROM estadisticas_partido_jugador s WHERE s.partido_id=p.id AND s.equipo_id=p.equipo_visitante_id),
      revision=revision+1
    WHERE p.id=ANY($1::int[])`, [affected]);
  return count;
}

async function deleteTeams(client, ids) {
  if (!ids.length) return { equipos_eliminados: 0, jugadores_eliminados: 0, partidos_eliminados: 0 };
  const players = (await client.query('SELECT id FROM jugadores WHERE equipo_id=ANY($1::int[])', [ids])).rows.map(row => row.id);
  const matches = (await client.query('SELECT id FROM partidos WHERE equipo_local_id=ANY($1::int[]) OR equipo_visitante_id=ANY($1::int[])', [ids])).rows.map(row => row.id);
  const matchCount = await deleteMatches(client, matches);
  const playerCount = await deletePlayers(client, players);
  await deleteLegacyRows(client, 'tabla_posiciones', 'equipo_id', ids);
  await deleteLegacyRows(client, 'transacciones_financieras', 'equipo_id', ids);
  await client.query('DELETE FROM estadisticas_partido_jugador WHERE equipo_id=ANY($1::int[])', [ids]);
  const teamCount = (await client.query('DELETE FROM equipos WHERE id=ANY($1::int[])', [ids])).rowCount;
  return { equipos_eliminados: teamCount, jugadores_eliminados: playerCount, partidos_eliminados: matchCount };
}

async function deleteChampionship(client, id) {
  const teams = (await client.query('SELECT id FROM equipos WHERE campeonato_id=$1', [id])).rows.map(row => row.id);
  const matches = (await client.query('SELECT id FROM partidos WHERE campeonato_id=$1', [id])).rows.map(row => row.id);
  const matchCount = await deleteMatches(client, matches);
  const counts = await deleteTeams(client, teams);
  for (const table of ['transacciones_financieras', 'tabla_posiciones', 'tarifas_campeonato', 'turnos_campeonato']) {
    await deleteLegacyRows(client, table, 'campeonato_id', [id]);
  }
  await client.query('DELETE FROM jornadas_campeonato WHERE campeonato_id=$1', [id]);
  await client.query('DELETE FROM fixture_campeonato WHERE campeonato_id=$1', [id]);
  // Approved requests and the audit keep their history; the request FK becomes null.
  await client.query('DELETE FROM campeonatos WHERE id_campeonato=$1', [id]);
  return { ...counts, partidos_eliminados: counts.partidos_eliminados + matchCount };
}

async function purgePreviouslyDeletedSports(client) {
  // Only records already deleted by an administrator in the previous version.
  // Inactive championships and disabled users are deliberately not selected.
  const championships = (await client.query('SELECT id_campeonato FROM campeonatos WHERE eliminado_at IS NOT NULL ORDER BY id_campeonato')).rows;
  const counts = { campeonatos_eliminados: championships.length, equipos_eliminados: 0, jugadores_eliminados: 0, partidos_eliminados: 0 };
  for (const row of championships) {
    const deleted = await deleteChampionship(client, row.id_campeonato);
    for (const key of Object.keys(deleted)) counts[key] += deleted[key];
  }
  const teams = (await client.query('SELECT id FROM equipos WHERE eliminado_at IS NOT NULL')).rows.map(row => row.id);
  const deletedTeams = await deleteTeams(client, teams);
  for (const key of Object.keys(deletedTeams)) counts[key] += deletedTeams[key];
  const matches = (await client.query('SELECT id FROM partidos WHERE eliminado_at IS NOT NULL')).rows.map(row => row.id);
  counts.partidos_eliminados += await deleteMatches(client, matches);
  const players = (await client.query('SELECT id FROM jugadores WHERE eliminado_at IS NOT NULL')).rows.map(row => row.id);
  counts.jugadores_eliminados += await deletePlayers(client, players);
  if (Object.values(counts).some(Boolean)) await client.query(
    "INSERT INTO auditoria_logs(accion,detalles) VALUES('eliminacion_fisica_migrada',$1)", [JSON.stringify(counts)]);
  return counts;
}

module.exports = { deleteMatches, deletePlayers, deleteTeams, deleteChampionship, purgePreviouslyDeletedSports };
