const { asyncRoute, requirePermission, httpError, audit } = require('../security/access');
const { id } = require('../security/validation');
const validate = require('../security/rosterValidation');
const { deletePlayers, deleteTeams } = require('./sportsDeletion');

const teamSelect = `SELECT e.id,e.campeonato_id,e.nombre,e.curso,e.delegado_nombre,e.delegado_telefono,e.escudo,
  lower(c.categoria) AS categoria,(SELECT COUNT(*)::int FROM jugadores j WHERE j.equipo_id=e.id AND j.eliminado_at IS NULL) AS cantidad_jugadores
  FROM equipos e JOIN campeonatos c ON c.id_campeonato=e.campeonato_id AND c.eliminado_at IS NULL`;
const playerSelect = `SELECT j.id,j.equipo_id,j.nombre,j.apellido,concat_ws(' ',j.nombre,j.apellido) AS nombre_completo,
  j.ci,j.curso,to_char(j.fecha_nacimiento,'YYYY-MM-DD') AS fecha_nacimiento,j.dorsal,j.foto,e.nombre AS equipo_nombre,
  COALESCE(s.goles,0) AS goles,COALESCE(s.amarillas,0) AS amarillas,COALESCE(s.rojas,0) AS rojas,
  COALESCE(s.partidos_jugados,0) AS partidos_jugados,(j.eliminado_at IS NOT NULL OR e.eliminado_at IS NOT NULL) AS eliminado
  FROM jugadores j JOIN equipos e ON e.id=j.equipo_id
  JOIN campeonatos c ON c.id_campeonato=e.campeonato_id AND c.eliminado_at IS NULL
  LEFT JOIN estadisticas_jugador s ON s.jugador_id=j.id`;

async function championship(client, championshipId, lock = false) {
  const row = (await client.query('SELECT id_campeonato,categoria,limite_equipos FROM campeonatos WHERE id_campeonato=$1 AND eliminado_at IS NULL' + (lock ? ' FOR UPDATE' : ''), [championshipId])).rows[0];
  if (!row) throw httpError(404, 'El campeonato no existe.');
  return row;
}

async function readTeam(client, teamId) {
  const row = (await client.query(teamSelect + ' WHERE e.id=$1 AND e.eliminado_at IS NULL', [teamId])).rows[0];
  if (!row) throw httpError(404, 'El equipo no existe.');
  return row;
}

function playerDto(row) { return { ...row, edad: validate.age(row.fecha_nacimiento) }; }

async function readPlayer(client, playerId) {
  const row = (await client.query(playerSelect + ' WHERE j.id=$1', [playerId])).rows[0];
  if (!row) throw httpError(404, 'El jugador no existe.');
  return playerDto(row);
}

function changedFields(fields, before, after) { return fields.filter(key => (before[key] ?? null) !== (after[key] ?? null)); }

function category(championshipRow) {
  const value = String(championshipRow.categoria || '').toLowerCase();
  if (!['varones','damas','mixto'].includes(value)) throw httpError(400, 'El campeonato debe tener una categoría válida.');
  return value;
}

function registerRosterRoutes(app, pool, write) {
  const read = requirePermission('campeonatos:ver');
  const teamsWrite = requirePermission('equipos:gestionar');
  const playersWrite = requirePermission('jugadores:gestionar');
  const teamsDelete = requirePermission('equipos:eliminar');
  const playersDelete = requirePermission('jugadores:eliminar');

  app.get('/api/campeonatos/:id/equipos', read, asyncRoute(async (req, res) => {
    const championshipId = id(req.params.id);
    await championship(pool, championshipId);
    res.json((await pool.query(teamSelect + ' WHERE e.campeonato_id=$1 AND e.eliminado_at IS NULL ORDER BY lower(e.nombre),e.id', [championshipId])).rows);
  }));

  app.post('/api/campeonatos/:id/equipos', teamsWrite, asyncRoute(async (req, res) => {
    const championshipId = id(req.params.id);
    const data = validate.team(req.body);
    const result = await write(req, 'equipos:gestionar', async client => {
      const parent = await championship(client, championshipId, true);
      if ((await client.query('SELECT campeonato_id FROM fixture_campeonato WHERE campeonato_id=$1', [championshipId])).rows[0]) throw httpError(409, 'El calendario ya comenzó y sus equipos están definidos. No se pueden incorporar equipos nuevos.');
      const count = Number((await client.query('SELECT COUNT(*) AS cantidad FROM equipos WHERE campeonato_id=$1 AND eliminado_at IS NULL', [championshipId])).rows[0].cantidad);
      if (count >= Number(parent.limite_equipos)) throw httpError(409, 'El campeonato ya alcanzó su límite de equipos.');
      const columns = ['campeonato_id','categoria',...validate.teamFields];
      const values = [championshipId,category(parent),...validate.teamFields.map(field => data[field])];
      const row = (await client.query('INSERT INTO equipos (' + columns.join(',') + ') VALUES (' + values.map((_, index) => '$' + (index + 1)).join(',') + ') RETURNING id', values)).rows[0];
      await audit(client, req, 'equipo_creado', { equipo_id: row.id, campeonato_id: championshipId, campos: validate.teamFields });
      return readTeam(client, row.id);
    });
    res.status(201).json(result);
  }));

  app.get('/api/equipos/:id', read, asyncRoute(async (req, res) => res.json(await readTeam(pool, id(req.params.id)))));

  app.put('/api/equipos/:id', teamsWrite, asyncRoute(async (req, res) => {
    const teamId = id(req.params.id);
    const result = await write(req, 'equipos:gestionar', async client => {
      const existing = (await client.query('SELECT * FROM equipos WHERE id=$1 AND eliminado_at IS NULL FOR UPDATE', [teamId])).rows[0];
      if (!existing) throw httpError(404, 'El equipo no existe.');
      const parent = await championship(client, existing.campeonato_id, true);
      const data = validate.team(req.body, existing);
      const values = [...validate.teamFields.map(field => data[field]),category(parent),teamId];
      await client.query('UPDATE equipos SET ' + validate.teamFields.map((field, index) => field + '=$' + (index + 1)).join(',') + ',categoria=$6 WHERE id=$7', values);
      await audit(client, req, 'equipo_actualizado', { equipo_id: teamId, campeonato_id: existing.campeonato_id, campos: changedFields(validate.teamFields, existing, data) });
      return readTeam(client, teamId);
    });
    res.json(result);
  }));

  app.get('/api/equipos/:id/jugadores', read, asyncRoute(async (req, res) => {
    const teamId = id(req.params.id);
    await readTeam(pool, teamId);
    const { rows } = await pool.query(playerSelect + ' WHERE j.equipo_id=$1 AND j.eliminado_at IS NULL AND e.eliminado_at IS NULL ORDER BY j.dorsal ASC NULLS LAST,lower(j.apellido),lower(j.nombre),j.id', [teamId]);
    res.json(rows.map(playerDto));
  }));

  app.post('/api/equipos/:id/jugadores', playersWrite, asyncRoute(async (req, res) => {
    const teamId = id(req.params.id);
    const data = validate.player(req.body);
    const result = await write(req, 'jugadores:gestionar', async client => {
      const parent = (await client.query('SELECT id,campeonato_id FROM equipos WHERE id=$1 AND eliminado_at IS NULL FOR UPDATE', [teamId])).rows[0];
      if (!parent) throw httpError(404, 'El equipo no existe.');
      await championship(client, parent.campeonato_id, true);
      const columns = ['equipo_id',...validate.playerFields];
      const values = [teamId,...validate.playerFields.map(field => data[field])];
      const row = (await client.query('INSERT INTO jugadores (' + columns.join(',') + ') VALUES (' + values.map((_, index) => '$' + (index + 1)).join(',') + ') RETURNING id', values)).rows[0];
      await audit(client, req, 'jugador_creado', { jugador_id: row.id, equipo_id: teamId, campeonato_id: parent.campeonato_id, campos: validate.playerFields });
      return readPlayer(client, row.id);
    });
    res.status(201).json(result);
  }));

  app.get('/api/jugadores/:id', read, asyncRoute(async (req, res) => res.json(await readPlayer(pool, id(req.params.id)))));

  app.put('/api/jugadores/:id', playersWrite, asyncRoute(async (req, res) => {
    const playerId = id(req.params.id);
    const result = await write(req, 'jugadores:gestionar', async client => {
      const existing = (await client.query("SELECT j.*,to_char(j.fecha_nacimiento,'YYYY-MM-DD') AS fecha_nacimiento FROM jugadores j WHERE j.id=$1 AND j.eliminado_at IS NULL FOR UPDATE", [playerId])).rows[0];
      if (!existing) throw httpError(404, 'El jugador no existe.');
      const parent = await readTeam(client, existing.equipo_id);
      const data = validate.player(req.body, existing);
      const values = [...validate.playerFields.map(field => data[field]),playerId];
      await client.query('UPDATE jugadores SET ' + validate.playerFields.map((field, index) => field + '=$' + (index + 1)).join(',') + ' WHERE id=$8', values);
      await audit(client, req, 'jugador_actualizado', { jugador_id: playerId, equipo_id: existing.equipo_id, campeonato_id: parent.campeonato_id, campos: changedFields(validate.playerFields, existing, data) });
      return readPlayer(client, playerId);
    });
    res.json(result);
  }));

  app.delete('/api/equipos/:id', teamsDelete, asyncRoute(async (req, res) => {
    const teamId = id(req.params.id);
    const result = await write(req, 'equipos:eliminar', async client => {
      const existing = (await client.query('SELECT id,campeonato_id FROM equipos WHERE id=$1 AND eliminado_at IS NULL FOR UPDATE', [teamId])).rows[0];
      if (!existing) throw httpError(404, 'El equipo no existe.');
      await championship(client, existing.campeonato_id, true);
      if ((await client.query('SELECT campeonato_id FROM fixture_campeonato WHERE campeonato_id=$1 AND completado=false', [existing.campeonato_id])).rows[0]) throw httpError(409, 'El calendario automático todavía está en curso. Conserva sus equipos hasta concluir todas las jornadas.');
      const pending = (await client.query("SELECT id FROM partidos WHERE (equipo_local_id=$1 OR equipo_visitante_id=$1) AND estado IN ('programado','en_curso') AND eliminado_at IS NULL LIMIT 1", [teamId])).rows[0];
      if (pending) throw httpError(409, 'El equipo tiene partidos programados o en curso. Finalízalos antes de eliminarlo.');
      const counts = await deleteTeams(client, [teamId]);
      await audit(client, req, 'equipo_eliminado', { equipo_id: teamId, campeonato_id: existing.campeonato_id, ...counts });
      return { ok: true };
    });
    res.json(result);
  }));

  app.delete('/api/jugadores/:id', playersDelete, asyncRoute(async (req, res) => {
    const playerId = id(req.params.id);
    const result = await write(req, 'jugadores:eliminar', async client => {
      const existing = (await client.query('SELECT id,equipo_id FROM jugadores WHERE id=$1 AND eliminado_at IS NULL FOR UPDATE', [playerId])).rows[0];
      if (!existing) throw httpError(404, 'El jugador no existe.');
      const parent = await readTeam(client, existing.equipo_id);
      await deletePlayers(client, [playerId]);
      await audit(client, req, 'jugador_eliminado', { jugador_id: playerId, equipo_id: existing.equipo_id, campeonato_id: parent.campeonato_id });
      return { ok: true };
    });
    res.json(result);
  }));

}

module.exports = { registerRosterRoutes };
