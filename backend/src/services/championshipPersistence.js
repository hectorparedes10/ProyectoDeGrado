const columns = ['nombre','modalidad','categoria','cantidad_canchas','limite_equipos','hora_inicio','duracion_partido_min','descanso_entre_partidos_min','activo'];
async function createChampionship(client, data) {
  const { rows } = await client.query('INSERT INTO campeonatos (' + columns.join(',') + ') VALUES (' + columns.map((_, i) => '$' + (i + 1)).join(',') + ') RETURNING *', columns.map(key => data[key]));
  return rows[0];
}
async function updateChampionship(client, id, data) {
  const { rows } = await client.query('UPDATE campeonatos SET ' + columns.map((key, i) => key + '=$' + (i + 1)).join(',') + ' WHERE id_campeonato=$10 RETURNING *', [...columns.map(key => data[key]), id]);
  return rows[0];
}
module.exports = { createChampionship, updateChampionship };
