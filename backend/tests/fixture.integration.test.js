const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const { pool: configurationPool } = require('../config/db');
const { createApp } = require('../src/app');
const { ensureAccessSchema } = require('../src/security/schema');
const { hashPassword } = require('../src/security/access');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('Fixture automático por jornadas con PostgreSQL aislado', { timeout: 180000 }, async t => {
  const schema = 'arena_fixture_test_' + process.pid + '_' + randomBytes(5).toString('hex');
  assert.match(schema, /^arena_fixture_test_\d+_[a-f0-9]{10}$/);
  const options = { ...configurationPool.options, password: configurationPool.options.password };
  const maintenance = new Pool({ ...options, max: 1 });
  const pool = new Pool({ ...options, options: '-c search_path=' + schema, max: 8 });
  let failNextAudit = false; let failAuditAction = null;
  const watchedPool = {
    query: (...args) => pool.query(...args),
    connect: async () => {
      const client = await pool.connect();
      return {
        query: async (...args) => {
          if (failNextAudit && (!failAuditAction || args[1]?.[1] === failAuditAction) && /^\s*INSERT\s+INTO\s+auditoria_logs\b/i.test(args[0])) {
            failNextAudit = false;
            throw Object.assign(new Error('Fallo de auditoría provocado por la prueba'), { code: 'XX001' });
          }
          return client.query(...args);
        },
        release: () => client.release(),
      };
    },
  };
  const password = 'Arena-fixture-test-928!';
  let server, serial = 0, adminToken, mesaToken, refereeToken;
  async function call(method, path, token, body) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/api' + path, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
    return { status: response.status, data: await response.json() };
  }
  async function expect(method, path, token, body, status) {
    const result = await call(method, path, token, body);
    assert.equal(result.status, status, method + ' ' + path + ': ' + (result.data.error || result.status));
    return result.data;
  }
  const fixturePath = champ => '/campeonatos/' + champ.id_campeonato + '/fixture';
  const matchesPath = champ => '/campeonatos/' + champ.id_campeonato + '/partidos';
  const sheetPath = match => '/partidos/' + match.id + '/planilla';
  const fixtureState = champ => expect('GET', fixturePath(champ), refereeToken, undefined, 200);
  const matches = champ => expect('GET', matchesPath(champ), refereeToken, undefined, 200);
  const generate = (champ, hora_fin = '23:00', token = mesaToken) => expect('POST', fixturePath(champ), token, { hora_fin }, 201);
  const finish = (match, token = mesaToken) => expect('PUT', sheetPath(match), token, { revision: match.revision, estado: 'finalizado', jugadores: [] }, 200);
  const auditCount = async () => (await pool.query('SELECT count(*)::int AS total FROM auditoria_logs')).rows[0].total;
  function champData(overrides = {}) {
    return { nombre: 'Copa fixture ' + (++serial), modalidad: 'Solamente ida', categoria: 'Mixto', cantidad_canchas: 1,
      limite_equipos: 12, hora_inicio: '18:00', duracion_partido_min: 30, descanso_entre_partidos_min: 5, activo: true, ...overrides };
  }
  function teamData() {
    return { nombre: 'Equipo fixture ' + (++serial), curso: '6to A', delegado_nombre: 'Delegado de prueba', delegado_telefono: '70000001', escudo: PNG };
  }
  async function setup(count = 4, overrides = {}) {
    const champ = await expect('POST', '/campeonatos', adminToken, champData(overrides), 201);
    const teams = [];
    for (let i = 0; i < count; i++) teams.push(await expect('POST', '/campeonatos/' + champ.id_campeonato + '/equipos', adminToken, teamData(), 201));
    return { champ, teams };
  }
  const manualData = ({ teams }) => ({ equipo_local_id: teams[0].id, equipo_visitante_id: teams[1].id, fecha_hora: '2026-09-15T18:00', cancha_numero: 1 });
  function validateSchedule(rows, config) {
    const start = config.hora_inicio.slice(0, 5), end = config.hora_fin.slice(0, 5);
    const mins = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
    const occupied = new Map();
    for (const match of rows) {
      assert.ok(match.jornada_numero >= 1);
      assert.ok(match.equipo_local_id !== match.equipo_visitante_id);
      assert.ok(match.cancha_numero >= 1 && match.cancha_numero <= config.cantidad_canchas);
      const kickoff = match.fecha_hora.slice(11, 16);
      assert.ok(mins(kickoff) >= mins(start), 'Un partido empieza antes de la apertura');
      assert.ok(mins(kickoff) + config.duracion_partido_min <= mins(end), 'Un partido acaba después del cierre');
      const courtDay = match.fecha_hora.slice(0, 10) + ':' + match.cancha_numero;
      const begin = mins(kickoff), finish = begin + config.duracion_partido_min;
      for (const prior of occupied.get(courtDay) || []) assert.ok(finish <= prior.begin || begin >= prior.finish, 'Hay dos partidos superpuestos en una cancha');
      occupied.set(courtDay, [...(occupied.get(courtDay) || []), { begin, finish }]);
      for (const other of rows) {
        if (other.id >= match.id || other.fecha_hora.slice(0, 10) !== match.fecha_hora.slice(0, 10)) continue;
        if (![other.equipo_local_id, other.equipo_visitante_id].some(id => [match.equipo_local_id, match.equipo_visitante_id].includes(id))) continue;
        const otherStart = mins(other.fecha_hora.slice(11, 16));
        assert.ok(finish <= otherStart || begin >= otherStart + config.duracion_partido_min, 'Un equipo juega dos partidos al mismo tiempo');
      }
    }
  }
  async function finishAll(champ, expectedRounds) {
    const seen = new Set();
    for (let round = 1; round <= expectedRounds; round++) {
      const state = await fixtureState(champ);
      assert.equal(state.config.jornada_actual, round);
      const roundMatches = (await matches(champ)).filter(match => match.jornada_numero === round);
      assert.ok(roundMatches.length > 0);
      assert.ok(roundMatches.every(match => match.estado === 'programado'));
      for (const match of roundMatches) {
        assert.ok(!seen.has(match.id)); seen.add(match.id);
        await finish(match);
      }
    }
    const state = await fixtureState(champ);
    assert.equal(state.config.completado, true);
    assert.equal(state.config.total_jornadas, expectedRounds);
    assert.equal(state.jornadas.length, expectedRounds);
    assert.ok(state.jornadas.every(round => round.pendientes === 0));
    const rows = await matches(champ);
    assert.equal(rows.length, seen.size);
    validateSchedule(rows, state.config);
    return { state, rows };
  }
  try {
    await maintenance.query('CREATE SCHEMA ' + schema);
    await pool.query(
      'CREATE TABLE usuarios_sistema (id SERIAL PRIMARY KEY,nombre VARCHAR(100) NOT NULL,email VARCHAR(150) UNIQUE NOT NULL,password_hash VARCHAR(255) NOT NULL,rol VARCHAR(50) NOT NULL,activo BOOLEAN DEFAULT true,created_at TIMESTAMP DEFAULT NOW());' +
      'CREATE TABLE campeonatos (id_campeonato SERIAL PRIMARY KEY,nombre VARCHAR(100) NOT NULL,modalidad VARCHAR(50) NOT NULL,categoria VARCHAR(30),cantidad_canchas INTEGER,limite_equipos INTEGER NOT NULL,hora_inicio VARCHAR(10),duracion_partido_min INTEGER,descanso_entre_partidos_min INTEGER,activo BOOLEAN);' +
      'CREATE TABLE auditoria_logs (id SERIAL PRIMARY KEY,usuario_id INTEGER REFERENCES usuarios_sistema(id),accion VARCHAR(100),detalles JSONB,ip_origen VARCHAR(45),created_at TIMESTAMP DEFAULT NOW());'
    );
    await ensureAccessSchema(pool); await ensureAccessSchema(pool);
    const hash = await hashPassword(password); const accounts = [];
    for (const role of ['admin', 'mesa', 'arbitro']) accounts.push((await pool.query('INSERT INTO usuarios_sistema(nombre,email,password_hash,rol) VALUES($1,$2,$3,$4) RETURNING id,email', ['Prueba ' + role, role + '@fixture.example.test', hash, role])).rows[0]);
    await new Promise(resolve => { server = createApp(watchedPool).listen(0, '127.0.0.1', resolve); });
    [adminToken, mesaToken, refereeToken] = await Promise.all(accounts.map(async account => (await expect('POST', '/auth/login', null, { email: account.email, password }, 200)).token));

    await t.test('Admin y mesa generan; árbitro consulta; ausencia de sesión y campeonato se rechazan', async () => {
      const { champ } = await setup();
      assert.deepEqual(await fixtureState(champ), { config: null, jornadas: [] });
      await expect('GET', fixturePath(champ), null, undefined, 401);
      await expect('POST', fixturePath(champ), null, { hora_fin: '23:00' }, 401);
      await expect('POST', fixturePath(champ), refereeToken, { hora_fin: '23:00' }, 403);
      await expect('GET', '/campeonatos/999999/fixture', adminToken, undefined, 404);
      await expect('POST', '/campeonatos/999999/fixture', adminToken, { hora_fin: '23:00' }, 404);
      const created = await generate(champ);
      assert.equal(created.config.jornada_actual, 1); assert.equal(created.config.total_jornadas, 3);
      assert.equal(created.config.equipos_count, 4); assert.equal(created.config.completado, false);
      assert.equal(created.jornadas.length, 1);
      assert.equal((await matches(champ)).length, 2);
      assert.ok((await matches(champ)).every(match => match.jornada_numero === 1 && match.vuelta === false));
      for (const token of [adminToken, mesaToken, refereeToken]) await expect('GET', fixturePath(champ), token, undefined, 200);
    });

    await t.test('Valida equipos y horario de cierre antes de generar cualquier partido', async () => {
      const insufficient = await setup(1);
      await expect('POST', fixturePath(insufficient.champ), adminToken, { hora_fin: '23:00' }, 400);
      assert.equal((await fixtureState(insufficient.champ)).config, null);
      const { champ } = await setup(4);
      const beforeAudit = await auditCount();
      for (const hora_fin of ['', null, '6:30', '25:00', '18:60', '17:00', '18:00', '18:29']) {
        await expect('POST', fixturePath(champ), mesaToken, { hora_fin }, 400);
      }
      assert.equal((await matches(champ)).length, 0);
      assert.equal((await fixtureState(champ)).config, null);
      assert.equal(await auditCount(), beforeAudit);
      const accepted = await generate(champ, '18:30');
      validateSchedule(await matches(champ), accepted.config);
    });

    await t.test('Generación simultánea crea una sola jornada y evita mezclar encuentros manuales', async () => {
      const context = await setup();
      const answers = await Promise.all([call('POST', fixturePath(context.champ), adminToken, { hora_fin: '23:00' }), call('POST', fixturePath(context.champ), mesaToken, { hora_fin: '22:00' })]);
      assert.deepEqual(answers.map(answer => answer.status).sort(), [201, 409]);
      assert.equal((await matches(context.champ)).length, 2);
      assert.equal((await fixtureState(context.champ)).jornadas.length, 1);
      await expect('POST', matchesPath(context.champ), mesaToken, manualData(context), 409);
      const manual = await setup();
      await expect('POST', matchesPath(manual.champ), adminToken, manualData(manual), 201);
      await expect('POST', fixturePath(manual.champ), mesaToken, { hora_fin: '23:00' }, 409);
      assert.equal((await fixtureState(manual.champ)).config, null);
    });

    await t.test('Congela equipos y condiciones usadas por el calendario pero permite editar el nombre', async () => {
      const context = await setup(); const { champ } = context;
      const generated = await generate(champ);
      await expect('POST', '/campeonatos/' + champ.id_campeonato + '/equipos', mesaToken, teamData(), 409);
      await expect('DELETE', '/equipos/' + context.teams[0].id, adminToken, undefined, 409);
      for (const changes of [{ modalidad: 'Ida y vuelta' }, { hora_inicio: '17:00' }, { duracion_partido_min: 40 }, { descanso_entre_partidos_min: 10 }, { cantidad_canchas: 2 }]) {
        await expect('PUT', '/campeonatos/' + champ.id_campeonato, adminToken, { ...champ, ...changes }, 409);
      }
      const updated = await expect('PUT', '/campeonatos/' + champ.id_campeonato, adminToken, { ...champ, nombre: 'Copa renombrada' }, 200);
      assert.equal(updated.campeonato.nombre, 'Copa renombrada');
      assert.deepEqual((await fixtureState(champ)).config, generated.config);
    });

    await t.test('Solo finaliza la jornada completa; correcciones no duplican y la jornada anterior no se reabre', async () => {
      const { champ } = await setup(); await generate(champ);
      let current = await matches(champ);
      const corrected = await finish(current[0]);
      assert.equal((await fixtureState(champ)).config.jornada_actual, 1);
      assert.equal((await matches(champ)).length, 2);
      const answers = await Promise.all([call('PUT', sheetPath(current[1]), mesaToken, { revision: current[1].revision, estado: 'finalizado', jugadores: [] }), call('PUT', sheetPath(current[1]), adminToken, { revision: current[1].revision, estado: 'finalizado', jugadores: [] })]);
      assert.deepEqual(answers.map(answer => answer.status).sort(), [200, 409]);
      assert.equal((await fixtureState(champ)).config.jornada_actual, 2);
      assert.equal((await matches(champ)).length, 4);
      const edited = await finish(corrected, adminToken);
      assert.equal((await matches(champ)).length, 4);
      for (const estado of ['programado', 'en_curso']) await expect('PUT', sheetPath(edited), mesaToken, { revision: edited.revision, estado, jugadores: [] }, 409);
      assert.equal((await fixtureState(champ)).jornadas.length, 2);
    });

    await t.test('Una ida cubre todos los pares una vez y acaba sin crear una jornada adicional', async () => {
      const { champ, teams } = await setup(); await generate(champ);
      const { rows } = await finishAll(champ, 3);
      assert.equal(rows.length, 6);
      const pairs = rows.map(match => [match.equipo_local_id, match.equipo_visitante_id].sort((a, b) => a - b).join(':'));
      assert.equal(new Set(pairs).size, 6);
      for (const team of teams) assert.equal(rows.filter(match => [match.equipo_local_id, match.equipo_visitante_id].includes(team.id)).length, 3);
      for (let number = 1; number <= 3; number++) {
        const participants = rows.filter(match => match.jornada_numero === number).flatMap(match => [match.equipo_local_id, match.equipo_visitante_id]);
        assert.equal(new Set(participants).size, 4);
      }
      const last = rows.at(-1); await finish(last, adminToken);
      assert.equal((await matches(champ)).length, 6);
      assert.equal((await fixtureState(champ)).config.completado, true);
    });

    await t.test('Ida y vuelta con equipos impares invierte localía y registra el equipo que descansa', async () => {
      const { champ, teams } = await setup(3, { modalidad: 'Ida y vuelta', cantidad_canchas: 2 });
      await generate(champ);
      const { state, rows } = await finishAll(champ, 6);
      assert.equal(rows.length, 6);
      const oriented = rows.map(match => match.equipo_local_id + ':' + match.equipo_visitante_id);
      assert.equal(new Set(oriented).size, 6);
      for (const match of rows) assert.ok(oriented.includes(match.equipo_visitante_id + ':' + match.equipo_local_id));
      assert.ok(state.jornadas.every(round => round.descansa.length === 1));
      for (const team of teams) {
        assert.equal(rows.filter(match => [match.equipo_local_id, match.equipo_visitante_id].includes(team.id)).length, 4);
        assert.equal(state.jornadas.filter(round => round.descansa[0].id === team.id).length, 2);
      }
      assert.ok(rows.filter(match => match.jornada_numero <= 3).every(match => match.vuelta === false));
      assert.ok(rows.filter(match => match.jornada_numero > 3).every(match => match.vuelta === true));
    });

    await t.test('Varias canchas reparten partidos sin superponer equipos y respetan el cierre', async () => {
      const { champ } = await setup(6, { cantidad_canchas: 2 });
      const state = await generate(champ, '19:10');
      const rows = await matches(champ);
      assert.equal(rows.length, 3);
      assert.equal(new Set(rows.map(match => match.cancha_numero)).size, 2);
      validateSchedule(rows, state.config);
      assert.equal(new Set(rows.flatMap(match => [match.equipo_local_id, match.equipo_visitante_id])).size, 6);
    });

    await t.test('Solo admin elimina y borrar el último pendiente avanza una sola vez', async () => {
      const { champ } = await setup(); await generate(champ);
      let rows = await matches(champ); const closed = await finish(rows[0]);
      for (const token of [mesaToken, refereeToken]) await expect('DELETE', '/partidos/' + rows[1].id, token, { revision: rows[1].revision }, 403);
      await expect('DELETE', '/partidos/' + rows[1].id, adminToken, { revision: 99 }, 409);
      await expect('DELETE', '/partidos/' + rows[1].id, adminToken, { revision: rows[1].revision }, 200);
      await expect('GET', '/partidos/' + rows[1].id, refereeToken, undefined, 404);
      assert.equal((await fixtureState(champ)).config.jornada_actual, 2);
      rows = await matches(champ); assert.equal(rows.length, 3);
      await expect('DELETE', '/partidos/' + closed.id, adminToken, { revision: closed.revision }, 200);
      assert.equal((await fixtureState(champ)).config.jornada_actual, 2);
      assert.equal((await matches(champ)).length, 2);
      assert.equal((await fixtureState(champ)).jornadas.length, 2);
    });


    await t.test('Si falla auditoría de la nueva jornada, también revierte la eliminación del último pendiente', async () => {
      const { champ } = await setup(); await generate(champ);
      const rows = await matches(champ); await finish(rows[0]);
      const beforeAudit = await auditCount();
      failNextAudit = true; failAuditAction = 'jornada_generada';
      try { await expect('DELETE', '/partidos/' + rows[1].id, adminToken, { revision: rows[1].revision }, 500); assert.equal(failNextAudit, false); }
      finally { failNextAudit = false; failAuditAction = null; }
      assert.equal((await fixtureState(champ)).config.jornada_actual, 1);
      assert.equal((await matches(champ)).length, 2);
      const original = await expect('GET', '/partidos/' + rows[1].id, refereeToken, undefined, 200);
      assert.equal(original.estado, 'programado'); assert.equal(original.revision, rows[1].revision);
      assert.equal(await auditCount(), beforeAudit);
      await expect('DELETE', '/partidos/' + rows[1].id, adminToken, { revision: rows[1].revision }, 200);
      assert.equal((await fixtureState(champ)).config.jornada_actual, 2);
    });

    await t.test('Fallo de auditoría revierte la generación inicial y el avance junto a su planilla', async () => {
      const { champ } = await setup(); let beforeAudit = await auditCount();
      failNextAudit = true;
      try { await expect('POST', fixturePath(champ), adminToken, { hora_fin: '23:00' }, 500); assert.equal(failNextAudit, false); }
      finally { failNextAudit = false; failAuditAction = null; }
      assert.equal((await fixtureState(champ)).config, null); assert.equal((await matches(champ)).length, 0);
      assert.equal(await auditCount(), beforeAudit);
      await generate(champ); let rows = await matches(champ);
      await finish(rows[0]); beforeAudit = await auditCount();
      failNextAudit = true; failAuditAction = 'jornada_generada';
      try { await expect('PUT', sheetPath(rows[1]), mesaToken, { revision: rows[1].revision, estado: 'finalizado', jugadores: [] }, 500); assert.equal(failNextAudit, false); }
      finally { failNextAudit = false; failAuditAction = null; }
      assert.equal((await fixtureState(champ)).config.jornada_actual, 1); assert.equal((await matches(champ)).length, 2);
      const original = await expect('GET', '/partidos/' + rows[1].id, refereeToken, undefined, 200);
      assert.equal(original.estado, 'programado'); assert.equal(original.revision, rows[1].revision);
      assert.equal(await auditCount(), beforeAudit);
      await finish(original); assert.equal((await fixtureState(champ)).config.jornada_actual, 2);
    });

    await t.test('Admin elimina campeonatos con resultados y jornadas pendientes; todos sus enlaces dejan de funcionar', async () => {
      const context = await setup(); const { champ } = context;
      await generate(champ); const games = await matches(champ);
      const body = { nombre: 'Jugador baja', apellido: 'Prueba', ci: 'BORRAR-' + (++serial), curso: '6to A', fecha_nacimiento: '2008-04-10', dorsal: 4, foto: PNG };
      const player = await expect('POST', '/equipos/' + games[0].equipo_local_id + '/jugadores', adminToken, body, 201);
      await expect('PUT', sheetPath(games[0]), mesaToken, { revision: games[0].revision, estado: 'finalizado', jugadores: [{ jugador_id: player.id, goles: 2, amarillas: 1, rojas: 0 }] }, 200);
      assert.equal((await expect('GET', '/jugadores/' + player.id, refereeToken, undefined, 200)).goles, 2);
      const championshipPath = '/campeonatos/' + champ.id_campeonato;
      await expect('DELETE', championshipPath, null, undefined, 401);
      for (const token of [mesaToken, refereeToken]) await expect('DELETE', championshipPath, token, undefined, 403);
      const previousAudit = await auditCount();
      await expect('DELETE', championshipPath, adminToken, undefined, 200);
      assert.equal(await auditCount(), previousAudit + 1);
      assert.ok(!(await expect('GET', '/campeonatos', adminToken, undefined, 200)).some(row => row.id_campeonato === champ.id_campeonato));
      for (const endpoint of [championshipPath, championshipPath + '/equipos', matchesPath(champ), championshipPath + '/goleadores', fixturePath(champ), '/equipos/' + context.teams[0].id, '/equipos/' + context.teams[0].id + '/jugadores', '/jugadores/' + player.id, '/partidos/' + games[0].id]) {
        await expect('GET', endpoint, adminToken, undefined, 404);
      }
      await expect('DELETE', championshipPath, adminToken, undefined, 404);
      await expect('PUT', championshipPath, adminToken, { nombre: 'No reactivar' }, 404);
      await expect('POST', championshipPath + '/equipos', adminToken, teamData(), 404);
      await expect('POST', '/equipos/' + context.teams[0].id + '/jugadores', adminToken, { ...body, ci: 'NUEVO-' + (++serial) }, 404);
      await expect('POST', fixturePath(champ), adminToken, { hora_fin: '23:00' }, 404);
      await expect('POST', matchesPath(champ), adminToken, manualData(context), 404);
      await expect('PUT', sheetPath(games[1]), adminToken, { revision: games[1].revision, estado: 'finalizado', jugadores: [] }, 404);
      assert.equal((await pool.query('SELECT 1 FROM campeonatos WHERE id_campeonato=$1',[champ.id_campeonato])).rowCount,0);
      for (const table of ['equipos','partidos','fixture_campeonato','jornadas_campeonato']) assert.equal((await pool.query('SELECT 1 FROM '+table+' WHERE campeonato_id=$1',[champ.id_campeonato])).rowCount,0);
      for (const [table,column] of [['jugadores','id'],['estadisticas_partido_jugador','jugador_id'],['historial_participantes_partido','jugador_id']]) assert.equal((await pool.query('SELECT 1 FROM '+table+' WHERE '+column+'=$1',[player.id])).rowCount,0);
      assert.equal((await pool.query('SELECT * FROM estadisticas_jugador WHERE jugador_id=$1', [player.id])).rows.length, 0);
    });

    await t.test('Eliminar un campeonato es atómico ante fallo de auditoría y ante dos administradores', async () => {
      const { champ } = await setup(); await generate(champ);
      const beforeGames = await matches(champ); const beforeState = await fixtureState(champ); const previousAudit = await auditCount();
      const endpoint = '/campeonatos/' + champ.id_campeonato;
      failNextAudit = true; failAuditAction = 'campeonato_eliminado';
      try { await expect('DELETE', endpoint, adminToken, undefined, 500); assert.equal(failNextAudit, false); }
      finally { failNextAudit = false; failAuditAction = null; }
      assert.deepEqual(await matches(champ), beforeGames);
      assert.deepEqual(await fixtureState(champ), beforeState);
      assert.equal((await expect('GET', endpoint + '/equipos', adminToken, undefined, 200)).length, 4);
      assert.equal(await auditCount(), previousAudit);
      const answers = await Promise.all([call('DELETE', endpoint, adminToken), call('DELETE', endpoint, adminToken)]);
      assert.deepEqual(answers.map(answer => answer.status).sort(), [200,404]);
      assert.equal(await auditCount(), previousAudit + 1);
      const empty = await expect('POST', '/campeonatos', adminToken, champData(), 201);
      await expect('DELETE', '/campeonatos/' + empty.id_campeonato, adminToken, undefined, 200);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end();
    assert.match(schema, /^arena_fixture_test_\d+_[a-f0-9]{10}$/);
    try { await maintenance.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); }
    finally { await maintenance.end(); await configurationPool.end(); }
  }
});
