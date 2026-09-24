const { asyncRoute, requirePermission, httpError, audit } = require('../security/access');
const validate = require('../security/validation');
const { maybeAdvanceFixture } = require('./fixtureRoutes');
const { deleteMatches } = require('./sportsDeletion');

function whole(value, label, max) {
  if (!['number', 'string'].includes(typeof value) || !/^\d+$/.test(String(value)) || !Number.isInteger(Number(value)) || Number(value) > max) throw httpError(400, label + ' no es válido.');
  return Number(value);
}
function matchDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw httpError(400, 'Indica la fecha y hora del partido.');
  const date = new Date(value + ':00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 16) !== value || Number(value.slice(0, 4)) < 1900) throw httpError(400, 'La fecha y hora no son válidas.');
  return value;
}
const matchSelect = `SELECT p.id,p.campeonato_id,p.fase,p.categoria,p.equipo_local_id,p.equipo_visitante_id,
  p.goles_local,p.goles_visitante,to_char(p.fecha_hora,'YYYY-MM-DD"T"HH24:MI') AS fecha_hora,
  p.cancha_numero,p.estado,p.revision,p.jornada_numero,p.vuelta,l.nombre AS local_nombre,l.curso AS local_curso,l.escudo AS local_escudo,
  v.nombre AS visitante_nombre,v.curso AS visitante_curso,v.escudo AS visitante_escudo
  FROM partidos p JOIN campeonatos c ON c.id_campeonato=p.campeonato_id AND c.eliminado_at IS NULL
  JOIN equipos l ON l.id=p.equipo_local_id JOIN equipos v ON v.id=p.equipo_visitante_id`;
async function championship(client, championshipId) {
  const row = (await client.query('SELECT * FROM campeonatos WHERE id_campeonato=$1 AND eliminado_at IS NULL', [championshipId])).rows[0];
  if (!row) throw httpError(404, 'El campeonato no existe.');
  return row;
}
async function readMatch(client, matchId) {
  const match = (await client.query(matchSelect + ' WHERE p.id=$1 AND p.eliminado_at IS NULL', [matchId])).rows[0];
  if (!match) throw httpError(404, 'El partido no existe.');
  const { rows } = await client.query(`SELECT j.id,j.equipo_id,j.nombre,j.apellido,
    concat_ws(' ',j.nombre,j.apellido) AS nombre_completo,j.dorsal,j.curso,j.foto,e.nombre AS equipo_nombre,
    (j.eliminado_at IS NOT NULL OR e.eliminado_at IS NOT NULL) AS eliminado,
    (s.jugador_id IS NOT NULL) AS participa,COALESCE(s.goles,0) AS goles,
    COALESCE(s.amarillas,0) AS amarillas,COALESCE(s.rojas,0) AS rojas
    FROM jugadores j JOIN equipos e ON e.id=j.equipo_id
    LEFT JOIN estadisticas_partido_jugador s ON s.jugador_id=j.id AND s.partido_id=$1
    WHERE j.equipo_id IN ($2,$3) AND ((j.eliminado_at IS NULL AND e.eliminado_at IS NULL) OR EXISTS(SELECT 1 FROM historial_participantes_partido h WHERE h.partido_id=$1 AND h.jugador_id=j.id))
    ORDER BY (j.equipo_id=$2) DESC,j.dorsal ASC NULLS LAST,lower(j.apellido),lower(j.nombre),j.id`,
  [matchId, match.equipo_local_id, match.equipo_visitante_id]);
  return { ...match, jugadores: rows };
}

function registerMatchRoutes(app, pool, write) {
  const read = requirePermission('campeonatos:ver');
  const edit = requirePermission('partidos:resultados');
  app.get('/api/campeonatos/:id/partidos', read, asyncRoute(async (req, res) => {
    const championshipId = validate.id(req.params.id);
    await championship(pool, championshipId);
    res.json((await pool.query(matchSelect + ' WHERE p.campeonato_id=$1 AND p.eliminado_at IS NULL ORDER BY p.fecha_hora,p.id', [championshipId])).rows);
  }));
  app.post('/api/campeonatos/:id/partidos', edit, asyncRoute(async (req, res) => {
    const championshipId = validate.id(req.params.id);
    const local = validate.id(req.body?.equipo_local_id);
    const visitor = validate.id(req.body?.equipo_visitante_id);
    const date = matchDate(req.body?.fecha_hora);
    const court = whole(req.body?.cancha_numero, 'La cancha', 100);
    if (local === visitor) throw httpError(400, 'Selecciona dos equipos diferentes.');
    const result = await write(req, 'partidos:resultados', async client => {
      const parent = await championship(client, championshipId);
      if ((await client.query('SELECT campeonato_id FROM fixture_campeonato WHERE campeonato_id=$1', [championshipId])).rows[0]) throw httpError(409, 'Este campeonato genera sus partidos automáticamente.');
      if (court < 1 || court > parent.cantidad_canchas) throw httpError(400, 'La cancha no pertenece a este campeonato.');
      const teams = (await client.query('SELECT id FROM equipos WHERE id IN ($1,$2) AND campeonato_id=$3 AND eliminado_at IS NULL', [local, visitor, championshipId])).rows;
      if (teams.length !== 2) throw httpError(400, 'Ambos equipos deben estar registrados en este campeonato.');
      const duplicate = (await client.query('SELECT id FROM partidos WHERE campeonato_id=$1 AND equipo_local_id=$2 AND equipo_visitante_id=$3 AND fecha_hora=$4 AND eliminado_at IS NULL', [championshipId, local, visitor, date])).rows[0];
      if (duplicate) throw httpError(409, 'Este encuentro ya está registrado para esa fecha y hora.');
      const row = (await client.query(`INSERT INTO partidos (campeonato_id,categoria,equipo_local_id,equipo_visitante_id,fecha_hora,cancha_numero,estado) VALUES ($1,$2,$3,$4,$5,$6,'programado') RETURNING id`, [championshipId, String(parent.categoria).toLowerCase(), local, visitor, date, court])).rows[0];
      await audit(client, req, 'partido_creado', { partido_id: row.id, campeonato_id: championshipId, equipo_local_id: local, equipo_visitante_id: visitor });
      return readMatch(client, row.id);
    });
    res.status(201).json(result);
  }));
  app.get('/api/partidos/:id', read, asyncRoute(async (req, res) => res.json(await readMatch(pool, validate.id(req.params.id)))));
  app.put('/api/partidos/:id/planilla', edit, asyncRoute(async (req, res) => {
    const matchId = validate.id(req.params.id);
    const revision = whole(req.body?.revision, 'La revisión de la planilla', 2147483647);
    const state = req.body?.estado;
    if (!['programado', 'en_curso', 'finalizado'].includes(state)) throw httpError(400, 'El estado del partido no es válido.');
    if (!Array.isArray(req.body?.jugadores) || req.body.jugadores.length > 1000) throw httpError(400, 'La lista de participantes no es válida.');
    const entries = req.body.jugadores.map(row => ({ jugador_id: validate.id(row?.jugador_id), goles: whole(row?.goles, 'Los goles', 99), amarillas: whole(row?.amarillas, 'Las amarillas', 2), rojas: whole(row?.rojas, 'Las rojas', 1) }));
    if (new Set(entries.map(row => row.jugador_id)).size !== entries.length) throw httpError(400, 'Un jugador no puede aparecer dos veces en la misma planilla.');
    const result = await write(req, 'partidos:resultados', async client => {
      const match = (await client.query('SELECT * FROM partidos WHERE id=$1 AND eliminado_at IS NULL FOR UPDATE', [matchId])).rows[0];
      if (!match) throw httpError(404, 'El partido no existe.');
      await championship(client, match.campeonato_id);
      if (match.revision !== revision) throw httpError(409, 'Otra persona actualizó esta planilla. Ciérrala y vuelve a abrirla para ver los datos actuales.');
      if (state !== 'finalizado') {
        if (match.jornada_numero !== null) {
          const fixture = (await client.query('SELECT jornada_actual,completado FROM fixture_campeonato WHERE campeonato_id=$1', [match.campeonato_id])).rows[0];
          if (fixture && (fixture.jornada_actual > match.jornada_numero || fixture.completado)) throw httpError(409, 'Esta jornada ya concluyó y el calendario avanzó. Puedes corregir los resultados manteniendo el partido finalizado.');
        }
        const archivedTeam = (await client.query('SELECT id FROM equipos WHERE id IN ($1,$2) AND eliminado_at IS NOT NULL', [match.equipo_local_id, match.equipo_visitante_id])).rows[0];
        if (archivedTeam) throw httpError(409, 'Este partido pertenece al historial de un equipo eliminado. Puedes corregir su planilla manteniéndolo finalizado.');
      }
      const eligible = (await client.query(`SELECT j.id,j.equipo_id FROM jugadores j JOIN equipos e ON e.id=j.equipo_id
        WHERE j.id=ANY($1::int[]) AND j.equipo_id IN ($2,$3)
        AND ((j.eliminado_at IS NULL AND e.eliminado_at IS NULL) OR EXISTS(SELECT 1 FROM historial_participantes_partido h WHERE h.partido_id=$4 AND h.jugador_id=j.id))`,
      [entries.map(row => row.jugador_id), match.equipo_local_id, match.equipo_visitante_id, matchId])).rows;
      if (eligible.length !== entries.length) throw httpError(400, 'La planilla contiene jugadores que no están disponibles en estos equipos.');
      const teams = new Map(eligible.map(row => [row.id, row.equipo_id]));
      let localGoals = 0, visitorGoals = 0;
      for (const entry of entries) {
        if (teams.get(entry.jugador_id) === match.equipo_local_id) localGoals += entry.goles;
        else visitorGoals += entry.goles;
      }
      for (const entry of entries) await client.query('INSERT INTO historial_participantes_partido(partido_id,jugador_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [matchId, entry.jugador_id]);
      await client.query('DELETE FROM estadisticas_partido_jugador WHERE partido_id=$1', [matchId]);
      for (const entry of entries) await client.query('INSERT INTO estadisticas_partido_jugador (partido_id,jugador_id,equipo_id,goles,amarillas,rojas) VALUES ($1,$2,$3,$4,$5,$6)', [matchId, entry.jugador_id, teams.get(entry.jugador_id), entry.goles, entry.amarillas, entry.rojas]);
      await client.query('UPDATE partidos SET estado=$1,goles_local=$2,goles_visitante=$3,revision=revision+1 WHERE id=$4', [state, localGoals, visitorGoals, matchId]);
      await audit(client, req, 'planilla_actualizada', { partido_id: matchId, campeonato_id: match.campeonato_id, estado: state, goles_local: localGoals, goles_visitante: visitorGoals, revision: revision + 1, jugadores: entries });
      await maybeAdvanceFixture(client, match.campeonato_id, req);
      return readMatch(client, matchId);
    });
    res.json(result);
  }));
  app.delete('/api/partidos/:id', requirePermission('partidos:eliminar'), asyncRoute(async (req, res) => {
    const matchId = validate.id(req.params.id);
    const revision = whole(req.body?.revision, 'La revisión del partido', 2147483647);
    await write(req, 'partidos:eliminar', async client => {
      const match = (await client.query('SELECT * FROM partidos WHERE id=$1 AND eliminado_at IS NULL FOR UPDATE', [matchId])).rows[0];
      if (!match) throw httpError(404, 'El partido no existe.');
      await championship(client, match.campeonato_id);
      if (match.revision !== revision) throw httpError(409, 'El partido cambió. Actualiza la lista antes de eliminarlo.');
      await deleteMatches(client, [matchId]);
      await audit(client, req, 'partido_eliminado', { partido_id: matchId, campeonato_id: match.campeonato_id, jornada: match.jornada_numero, goles_local: match.goles_local, goles_visitante: match.goles_visitante });
      await maybeAdvanceFixture(client, match.campeonato_id, req);
    });
    res.json({ ok: true });
  }));
  app.get('/api/campeonatos/:id/goleadores', read, asyncRoute(async (req, res) => {
    const championshipId = validate.id(req.params.id);
    await championship(pool, championshipId);
    const { rows } = await pool.query(`SELECT j.id,j.nombre,j.apellido,concat_ws(' ',j.nombre,j.apellido) AS nombre_completo,
      j.equipo_id,j.dorsal,j.curso,j.foto,e.nombre AS equipo_nombre,
      (j.eliminado_at IS NOT NULL OR e.eliminado_at IS NOT NULL) AS eliminado,
      SUM(s.goles)::int AS goles,SUM(s.amarillas)::int AS amarillas,SUM(s.rojas)::int AS rojas,
      COUNT(*)::int AS partidos_jugados,(DENSE_RANK() OVER (ORDER BY SUM(s.goles) DESC))::int AS posicion
      FROM estadisticas_partido_jugador s JOIN partidos p ON p.id=s.partido_id
      JOIN jugadores j ON j.id=s.jugador_id JOIN equipos e ON e.id=s.equipo_id
      WHERE p.campeonato_id=$1 AND p.estado='finalizado' AND p.eliminado_at IS NULL
      GROUP BY j.id,e.id HAVING SUM(s.goles)>0
      ORDER BY goles DESC,lower(j.apellido),lower(j.nombre),j.id`, [championshipId]);
    res.json(rows);
  }));
}
module.exports = { registerMatchRoutes };
