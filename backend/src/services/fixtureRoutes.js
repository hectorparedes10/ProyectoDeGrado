const { asyncRoute, requirePermission, httpError, audit } = require('../security/access');
const { id } = require('../security/validation');
const { roundRobin, scheduleRound } = require('./fixtureEngine');

function nowBolivia() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const part = type => parts.find(item => item.type === type).value;
  return part('year') + '-' + part('month') + '-' + part('day') + 'T' + part('hour') + ':' + part('minute');
}
async function getFixture(client, championshipId) {
  if (!(await client.query('SELECT id_campeonato FROM campeonatos WHERE id_campeonato=$1 AND eliminado_at IS NULL', [championshipId])).rows[0]) throw httpError(404, 'El campeonato no existe.');
  const fixture = (await client.query('SELECT * FROM fixture_campeonato WHERE campeonato_id=$1', [championshipId])).rows[0];
  if (!fixture) return { config: null, jornadas: [] };
  const { datos } = fixture;
  const { rows } = await client.query(`SELECT j.numero,j.vuelta,j.descansa,
    to_char(j.fecha_inicio,'YYYY-MM-DD"T"HH24:MI') AS fecha_inicio,
    to_char(j.fecha_fin,'YYYY-MM-DD"T"HH24:MI') AS fecha_fin,
    COUNT(p.id) FILTER(WHERE p.eliminado_at IS NULL)::int AS total_partidos,
    COUNT(p.id) FILTER(WHERE p.eliminado_at IS NULL AND p.estado<>'finalizado')::int AS pendientes,
    COUNT(p.id) FILTER(WHERE p.eliminado_at IS NULL AND p.estado='finalizado')::int AS finalizados,
    COUNT(p.id) FILTER(WHERE p.eliminado_at IS NOT NULL)::int AS eliminados
    FROM jornadas_campeonato j LEFT JOIN partidos p ON p.campeonato_id=j.campeonato_id AND p.jornada_numero=j.numero
    WHERE j.campeonato_id=$1 GROUP BY j.campeonato_id,j.numero ORDER BY j.numero`, [championshipId]);
  const names = new Map(datos.equipos.map(team => [team.id, team.nombre]));
  return {
    config: { ...datos.condiciones, total_jornadas: datos.plan.length, jornada_actual: fixture.jornada_actual, completado: fixture.completado, equipos_count: datos.equipos.length },
    jornadas: rows.map(row => ({ ...row, descansa: row.descansa.map(teamId => ({ id: teamId, nombre: names.get(teamId) })) })),
  };
}
// Called only inside the authenticated write transaction, which serializes generation and results.
async function maybeAdvanceFixture(client, championshipId, req) {
  if (!(await client.query('SELECT id_campeonato FROM campeonatos WHERE id_campeonato=$1 AND eliminado_at IS NULL', [championshipId])).rows[0]) return null;
  const fixture = (await client.query('SELECT * FROM fixture_campeonato WHERE campeonato_id=$1 FOR UPDATE', [championshipId])).rows[0];
  if (!fixture || fixture.completado) return null;
  const pending = (await client.query("SELECT id FROM partidos WHERE campeonato_id=$1 AND jornada_numero IS NOT NULL AND eliminado_at IS NULL AND estado<>'finalizado' LIMIT 1", [championshipId])).rows[0];
  if (pending) return null;
  const { datos } = fixture;
  if (fixture.jornada_actual >= datos.plan.length) {
    await client.query('UPDATE fixture_campeonato SET completado=true WHERE campeonato_id=$1', [championshipId]);
    await audit(client, req, 'fixture_completado', { campeonato_id: championshipId, total_jornadas: datos.plan.length });
    return null;
  }
  const round = datos.plan[fixture.jornada_actual];
  const previousMatches = (await client.query(`SELECT equipo_local_id AS local,equipo_visitante_id AS visitante,
    to_char(fecha_hora,'YYYY-MM-DD"T"HH24:MI') AS fecha_hora,cancha_numero FROM partidos
    WHERE campeonato_id=$1 AND jornada_numero IS NOT NULL AND eliminado_at IS NULL ORDER BY fecha_hora,cancha_numero,id`, [championshipId])).rows;
  const now = nowBolivia();
  const scheduled = scheduleRound(round, { ...datos.condiciones, fecha_inicio: now.slice(0, 10), minStart: now, previousMatches, oneRoundPerDay: false, avoidConsecutive: true });
  await client.query('INSERT INTO jornadas_campeonato(campeonato_id,numero,vuelta,descansa,fecha_inicio,fecha_fin) VALUES($1,$2,$3,$4,$5,$6)', [championshipId, round.numero, round.vuelta, JSON.stringify(round.descansa), scheduled.fecha_inicio, scheduled.fecha_fin]);
  for (const match of scheduled.partidos) await client.query(`INSERT INTO partidos(campeonato_id,fase,categoria,equipo_local_id,equipo_visitante_id,fecha_hora,cancha_numero,estado,jornada_numero,vuelta)
    VALUES($1,'regular',$2,$3,$4,$5,$6,'programado',$7,$8)`, [championshipId, datos.categoria, match.local, match.visitante, match.fecha_hora, match.cancha_numero, round.numero, round.vuelta]);
  await client.query('UPDATE fixture_campeonato SET jornada_actual=$1 WHERE campeonato_id=$2', [round.numero, championshipId]);
  await audit(client, req, 'jornada_generada', { campeonato_id: championshipId, jornada: round.numero, vuelta: round.vuelta, partidos: scheduled.partidos.length, descansa: round.descansa });
  return round.numero;
}
function registerFixtureRoutes(app, pool, write) {
  app.get('/api/campeonatos/:id/fixture', requirePermission('campeonatos:ver'), asyncRoute(async (req, res) => {
    const championshipId = id(req.params.id);
    res.json(await getFixture(pool, championshipId));
  }));
  app.post('/api/campeonatos/:id/fixture', requirePermission('partidos:resultados'), asyncRoute(async (req, res) => {
    const championshipId = id(req.params.id);
    const until = req.body?.hora_fin;
    if (typeof until !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(until)) throw httpError(400, 'Indica una hora límite válida.');
    const result = await write(req, 'partidos:resultados', async client => {
      const parent = (await client.query('SELECT * FROM campeonatos WHERE id_campeonato=$1 AND eliminado_at IS NULL FOR UPDATE', [championshipId])).rows[0];
      if (!parent) throw httpError(404, 'El campeonato no existe.');
      if ((await client.query('SELECT campeonato_id FROM fixture_campeonato WHERE campeonato_id=$1', [championshipId])).rows[0]) throw httpError(409, 'Las jornadas de este campeonato ya se están generando automáticamente.');
      if ((await client.query('SELECT id FROM partidos WHERE campeonato_id=$1 AND eliminado_at IS NULL LIMIT 1', [championshipId])).rows[0]) throw httpError(409, 'Este campeonato ya tiene partidos manuales. El administrador debe eliminarlos antes de iniciar la generación automática.');
      const teams = (await client.query('SELECT id,nombre FROM equipos WHERE campeonato_id=$1 AND eliminado_at IS NULL ORDER BY id', [championshipId])).rows;
      if (teams.length < 2) throw httpError(400, 'Registra al menos dos equipos antes de generar las jornadas.');
      if (teams.length > 256) throw httpError(400, 'La generación automática admite hasta 256 equipos por campeonato.');
      const conditions = { modalidad: parent.modalidad, hora_inicio: parent.hora_inicio.slice(0, 5), hora_fin: until, duracion_partido_min: parent.duracion_partido_min, descanso_entre_partidos_min: parent.descanso_entre_partidos_min, cantidad_canchas: parent.cantidad_canchas };
      const plan = roundRobin(teams.map(team => team.id), parent.modalidad);
      const data = { condiciones: conditions, categoria: String(parent.categoria).toLowerCase(), equipos: teams, plan };
      await client.query('INSERT INTO fixture_campeonato(campeonato_id,datos) VALUES($1,$2)', [championshipId, JSON.stringify(data)]);
      await maybeAdvanceFixture(client, championshipId, req);
      return getFixture(client, championshipId);
    });
    res.status(201).json(result);
  }));
}
module.exports = { registerFixtureRoutes, getFixture, maybeAdvanceFixture, nowBolivia };
