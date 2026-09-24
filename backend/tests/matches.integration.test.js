const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const { pool: configurationPool } = require('../config/db');
const { createApp } = require('../src/app');
const { ensureAccessSchema } = require('../src/security/schema');
const { hashPassword } = require('../src/security/access');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('Planillas, acumulados y goleadores con PostgreSQL aislado', { timeout: 120000 }, async t => {
  const schema = 'arena_matches_test_' + process.pid + '_' + randomBytes(5).toString('hex');
  assert.match(schema, /^arena_matches_test_\d+_[a-f0-9]{10}$/);
  const options = { ...configurationPool.options, password: configurationPool.options.password };
  const maintenance = new Pool({ ...options, max: 1 });
  const pool = new Pool({ ...options, options: '-c search_path=' + schema, max: 8 });
  let failNextAudit = false;
  const watchedPool = {
    query: (...args) => pool.query(...args),
    connect: async () => {
      const client = await pool.connect();
      return {
        query: async (...args) => {
          if (failNextAudit && /^\s*INSERT\s+INTO\s+auditoria_logs\b/i.test(args[0])) {
            failNextAudit = false;
            throw Object.assign(new Error('Fallo de auditoría provocado por la prueba'), { code: 'XX001' });
          }
          return client.query(...args);
        },
        release: () => client.release(),
      };
    },
  };
  const password = 'Arena-matches-test-928!';
  let server, serial = 0, admin, mesa, adminToken, mesaToken, refereeToken;
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
  const matchesPath = champ => '/campeonatos/' + champ.id_campeonato + '/partidos';
  const rankingPath = champ => '/campeonatos/' + champ.id_campeonato + '/goleadores';
  const sheetPath = match => '/partidos/' + match.id + '/planilla';
  const entry = (player, goles = 0, amarillas = 0, rojas = 0) => ({ jugador_id: player.id, goles, amarillas, rojas });
  const counters = player => ({ goles: player.goles, amarillas: player.amarillas, rojas: player.rojas, partidos_jugados: player.partidos_jugados });
  async function championship() {
    return expect('POST', '/campeonatos', adminToken, {
      nombre: 'Copa planilla ' + (++serial), modalidad: 'Ida y vuelta', categoria: 'Varones',
      cantidad_canchas: 2, limite_equipos: 12, hora_inicio: '18:00', duracion_partido_min: 30,
      descanso_entre_partidos_min: 5, activo: true,
    }, 201);
  }
  async function team(champ) {
    return expect('POST', '/campeonatos/' + champ.id_campeonato + '/equipos', adminToken, {
      nombre: 'Equipo planilla ' + (++serial), curso: '4to B', delegado_nombre: 'Delegado de prueba',
      delegado_telefono: '+591 70000001', escudo: PNG,
    }, 201);
  }
  async function player(team, dorsal) {
    return expect('POST', '/equipos/' + team.id + '/jugadores', adminToken, {
      nombre: 'Jugador planilla ' + (++serial), apellido: 'Prueba', ci: 'PLANILLA-CI-' + serial,
      curso: '4to B', fecha_nacimiento: '2008-02-29', dorsal, foto: PNG,
    }, 201);
  }
  async function fixture() {
    const champ = await championship(); const localTeam = await team(champ); const visitorTeam = await team(champ);
    return { champ, localTeam, visitorTeam, local: await player(localTeam, 2), bench: await player(localTeam, 10), visitor: await player(visitorTeam, 7) };
  }
  function matchData(context, extra = {}) {
    return { equipo_local_id: context.localTeam.id, equipo_visitante_id: context.visitorTeam.id, fecha_hora: '2026-09-14T18:00', cancha_numero: 1, ...extra };
  }
  const createMatch = (context, extra = {}, token = adminToken) => expect('POST', matchesPath(context.champ), token, matchData(context, extra), 201);
  const save = (match, jugadores, token = mesaToken, estado = 'finalizado') => expect('PUT', sheetPath(match), token, { revision: match.revision, estado, jugadores }, 200);
  const readPlayer = player => expect('GET', '/jugadores/' + player.id, refereeToken, undefined, 200);
  const auditCount = async () => (await pool.query('SELECT count(*)::int AS total FROM auditoria_logs')).rows[0].total;
  try {
    await maintenance.query('CREATE SCHEMA ' + schema);
    await pool.query(`
      CREATE TABLE usuarios_sistema (id SERIAL PRIMARY KEY,nombre VARCHAR(100) NOT NULL,email VARCHAR(150) UNIQUE NOT NULL,password_hash VARCHAR(255) NOT NULL,rol VARCHAR(50) NOT NULL,activo BOOLEAN DEFAULT true,created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE campeonatos (id_campeonato SERIAL PRIMARY KEY,nombre VARCHAR(100) NOT NULL,modalidad VARCHAR(50) NOT NULL,categoria VARCHAR(30),cantidad_canchas INTEGER,limite_equipos INTEGER NOT NULL,hora_inicio VARCHAR(10),duracion_partido_min INTEGER,descanso_entre_partidos_min INTEGER,activo BOOLEAN);
      CREATE TABLE auditoria_logs (id SERIAL PRIMARY KEY,usuario_id INTEGER REFERENCES usuarios_sistema(id),accion VARCHAR(100),detalles JSONB,ip_origen VARCHAR(45),created_at TIMESTAMP DEFAULT NOW());
    `);
    await ensureAccessSchema(pool); await ensureAccessSchema(pool);
    const hash = await hashPassword(password); const accounts = [];
    for (const role of ['admin', 'mesa', 'arbitro']) accounts.push((await pool.query('INSERT INTO usuarios_sistema(nombre,email,password_hash,rol) VALUES($1,$2,$3,$4) RETURNING id,email', ['Prueba ' + role, role + '@matches.example.test', hash, role])).rows[0]);
    [admin, mesa] = accounts;
    await new Promise(resolve => { server = createApp(watchedPool).listen(0, '127.0.0.1', resolve); });
    [adminToken, mesaToken, refereeToken] = await Promise.all(accounts.map(async account => (await expect('POST', '/auth/login', null, { email: account.email, password }, 200)).token));

    await t.test('Admin y mesa registran planillas; árbitro consulta sin modificar y se exige sesión', async () => {
      const context = await fixture(); const match = await createMatch(context, {}, mesaToken);
      assert.equal(match.estado, 'programado'); assert.equal(match.revision, 0); assert.equal(match.fecha_hora, '2026-09-14T18:00');
      assert.deepEqual(match.jugadores.filter(item => item.equipo_id === context.localTeam.id).map(item => item.dorsal), [2, 10]);
      for (const path of [matchesPath(context.champ), '/partidos/' + match.id, rankingPath(context.champ)]) {
        await expect('GET', path, null, undefined, 401);
        for (const token of [adminToken, mesaToken, refereeToken]) await expect('GET', path, token, undefined, 200);
      }
      for (const token of [null, refereeToken]) {
        await expect('POST', matchesPath(context.champ), token, matchData(context, { fecha_hora: '2026-09-15T18:00' }), token ? 403 : 401);
        await expect('PUT', sheetPath(match), token, { revision: 0, estado: 'finalizado', jugadores: [entry(context.local, 3)] }, token ? 403 : 401);
      }
      await save(match, [entry(context.local, 1)], adminToken);
      assert.equal((await readPlayer(context.local)).goles, 1);
    });

    await t.test('Acumula goles y tarjetas solo en partidos finalizados, con participación separada del gol', async () => {
      const context = await fixture(); let first = await createMatch(context); let second = await createMatch(context, { fecha_hora: '2026-09-15T18:00' });
      first = await save(first, [entry(context.local, 2, 1), entry(context.visitor, 1), entry(context.bench)], mesaToken, 'en_curso');
      assert.deepEqual(counters(await readPlayer(context.local)), { goles: 0, amarillas: 0, rojas: 0, partidos_jugados: 0 });
      assert.deepEqual(await expect('GET', rankingPath(context.champ), refereeToken, undefined, 200), []);
      first = await save(first, [entry(context.local, 2, 1), entry(context.visitor, 1), entry(context.bench)]);
      second = await save(second, [entry(context.local, 3, 1, 1), entry(context.visitor, 1, 0, 1)]);
      assert.equal(first.goles_local, 2); assert.equal(first.goles_visitante, 1); assert.equal(second.goles_local, 3);
      assert.deepEqual(counters(await readPlayer(context.local)), { goles: 5, amarillas: 2, rojas: 1, partidos_jugados: 2 });
      assert.deepEqual(counters(await readPlayer(context.visitor)), { goles: 2, amarillas: 0, rojas: 1, partidos_jugados: 2 });
      assert.deepEqual(counters(await readPlayer(context.bench)), { goles: 0, amarillas: 0, rojas: 0, partidos_jugados: 1 });
      const list = await expect('GET', '/equipos/' + context.localTeam.id + '/jugadores', refereeToken, undefined, 200);
      assert.equal(list.find(item => item.id === context.local.id).goles, 5);
      const ranking = await expect('GET', rankingPath(context.champ), refereeToken, undefined, 200);
      assert.deepEqual(ranking.map(item => [item.id, item.goles, item.posicion]), [[context.local.id, 5, 1], [context.visitor.id, 2, 2]]);
      assert.ok(ranking.every(item => !Object.hasOwn(item, 'ci'))); assert.ok(!ranking.some(item => item.id === context.bench.id));
    });

    await t.test('Corregir reemplaza la planilla y resta goles o tarjetas previas sin duplicarlos', async () => {
      const context = await fixture(); let first = await createMatch(context);
      const second = await createMatch(context, { fecha_hora: '2026-09-15T18:00' });
      first = await save(first, [entry(context.local, 4, 2, 1), entry(context.visitor, 2), entry(context.bench)]);
      await save(second, [entry(context.local, 1), entry(context.visitor, 1)]);
      assert.equal((await readPlayer(context.local)).goles, 5);
      const correction = [entry(context.local, 1)]; first = await save(first, correction, adminToken);
      assert.equal(first.goles_local, 1); assert.equal(first.goles_visitante, 0);
      assert.equal(first.jugadores.find(item => item.id === context.visitor.id).participa, false);
      assert.deepEqual(counters(await readPlayer(context.local)), { goles: 2, amarillas: 0, rojas: 0, partidos_jugados: 2 });
      assert.deepEqual(counters(await readPlayer(context.visitor)), { goles: 1, amarillas: 0, rojas: 0, partidos_jugados: 1 });
      assert.deepEqual(counters(await readPlayer(context.bench)), { goles: 0, amarillas: 0, rojas: 0, partidos_jugados: 0 });
      await save(first, correction);
      assert.equal((await readPlayer(context.local)).goles, 2);
      assert.equal((await pool.query('SELECT count(*)::int AS total FROM estadisticas_partido_jugador WHERE partido_id=$1', [first.id])).rows[0].total, 1);
    });

    await t.test('Dos ediciones simultáneas permiten una sola y rechazan revisiones antiguas', async () => {
      const context = await fixture(); const match = await createMatch(context); const beforeAudit = await auditCount();
      const answers = await Promise.all([
        call('PUT', sheetPath(match), adminToken, { revision: 0, estado: 'finalizado', jugadores: [entry(context.local, 2)] }),
        call('PUT', sheetPath(match), mesaToken, { revision: 0, estado: 'finalizado', jugadores: [entry(context.local, 3, 1)] }),
      ]);
      assert.deepEqual(answers.map(item => item.status).sort(), [200, 409]);
      const accepted = answers.find(item => item.status === 200).data;
      const stored = await expect('GET', '/partidos/' + match.id, refereeToken, undefined, 200);
      assert.equal(stored.revision, 1); assert.equal(stored.goles_local, accepted.goles_local);
      assert.equal((await readPlayer(context.local)).goles, accepted.goles_local); assert.equal(await auditCount(), beforeAudit + 1);
      await expect('PUT', sheetPath(match), mesaToken, { revision: 0, estado: 'finalizado', jugadores: [entry(context.local, 9)] }, 409);
    });

    await t.test('Reabrir retira acumulados y finalizar otra vez los cuenta una sola vez', async () => {
      const context = await fixture(); let match = await createMatch(context); const entries = [entry(context.local, 2, 2, 1)];
      match = await save(match, entries); assert.equal((await readPlayer(context.local)).goles, 2);
      assert.equal((await pool.query('SELECT suspendido FROM jugadores WHERE id=$1', [context.local.id])).rows[0].suspendido, false);
      match = await save(match, entries, adminToken, 'programado');
      assert.deepEqual(counters(await readPlayer(context.local)), { goles: 0, amarillas: 0, rojas: 0, partidos_jugados: 0 });
      assert.deepEqual(await expect('GET', rankingPath(context.champ), refereeToken, undefined, 200), []);
      await save(match, entries);
      assert.deepEqual(counters(await readPlayer(context.local)), { goles: 2, amarillas: 2, rojas: 1, partidos_jugados: 1 });
    });

    await t.test('Goleadores se filtra por campeonato y comparte posición al empatar en goles', async () => {
      const context = await fixture(); const other = await fixture();
      await save(await createMatch(context), [entry(context.local, 2), entry(context.visitor, 2)]);
      await save(await createMatch(other), [entry(other.local, 8)]);
      const ranking = await expect('GET', rankingPath(context.champ), refereeToken, undefined, 200);
      assert.equal(ranking.length, 2); assert.ok(ranking.every(item => item.goles === 2 && item.posicion === 1));
      assert.ok(!ranking.some(item => item.id === other.local.id));
      assert.deepEqual((await expect('GET', rankingPath(other.champ), refereeToken, undefined, 200)).map(item => item.id), [other.local.id]);
    });

    await t.test('Valida equipos, participantes, tarjetas, fecha y cancha sin cambiar datos ante errores', async () => {
      const context = await fixture(); const extraTeam = await team(context.champ); const outsidePlayer = await player(extraTeam, 3);
      const other = await fixture(); const match = await createMatch(context);
      for (const invalid of [
        { equipo_visitante_id: context.localTeam.id }, { equipo_visitante_id: other.visitorTeam.id },
        { fecha_hora: '2026-02-30T18:00' }, { fecha_hora: '2026-09-14T25:00' }, { cancha_numero: 0 }, { cancha_numero: 3 },
      ]) await expect('POST', matchesPath(context.champ), adminToken, matchData(context, invalid), 400);
      await expect('POST', matchesPath(context.champ), mesaToken, matchData(context), 409);
      const beforeAudit = await auditCount();
      for (const invalid of [
        { jugadores: [entry(outsidePlayer, 1)] }, { jugadores: [entry(other.local, 1)] },
        { jugadores: [{ jugador_id: 999999, goles: 1, amarillas: 0, rojas: 0 }] },
        { jugadores: [entry(context.local, 1), entry(context.local, 2)] }, { jugadores: [entry(context.local, -1)] },
        { jugadores: [entry(context.local, 100)] }, { jugadores: [entry(context.local, 1.5)] },
        { jugadores: [entry(context.local, 0, 3)] }, { jugadores: [entry(context.local, 0, 0, 2)] },
        { jugadores: [entry(context.local, null)] }, { jugadores: [entry(context.local, '')] },
        { jugadores: [null] }, { jugadores: null }, { estado: 'desconocido' }, { revision: -1 }, { revision: null },
      ]) await expect('PUT', sheetPath(match), mesaToken, { revision: 0, estado: 'finalizado', jugadores: [], ...invalid }, 400);
      const stored = await expect('GET', '/partidos/' + match.id, refereeToken, undefined, 200);
      assert.equal(stored.revision, 0); assert.equal(stored.estado, 'programado'); assert.ok(stored.jugadores.every(item => item.participa === false));
      assert.equal(await auditCount(), beforeAudit);
      for (const path of ['/campeonatos/999999/partidos', '/campeonatos/999999/goleadores', '/partidos/999999']) await expect('GET', path, adminToken, undefined, 404);
    });

    await t.test('Borrar un jugador elimina sus filas y estadísticas, recalcula marcadores y rechaza planillas antiguas', async () => {
      const context = await fixture(); let historical = await createMatch(context);
      historical = await save(historical, [entry(context.local, 2, 1), entry(context.bench, 3), entry(context.visitor, 1)]);
      const future = await createMatch(context, { fecha_hora: '2026-09-15T18:00' });
      await expect('DELETE', '/jugadores/' + context.local.id, adminToken, undefined, 200);
      await expect('GET', '/jugadores/' + context.local.id, refereeToken, undefined, 404);
      for (const [table,column] of [['jugadores','id'],['estadisticas_partido_jugador','jugador_id'],['historial_participantes_partido','jugador_id']]) {
        assert.equal((await pool.query('SELECT 1 FROM '+table+' WHERE '+column+'=$1',[context.local.id])).rowCount,0);
      }
      const saved = await expect('GET', '/partidos/' + historical.id, refereeToken, undefined, 200);
      assert.equal(saved.goles_local,3); assert.equal(saved.goles_visitante,1); assert.equal(saved.revision,historical.revision+1);
      assert.ok(!saved.jugadores.some(row=>row.id===context.local.id));
      const newSheet = await expect('GET', '/partidos/' + future.id, refereeToken, undefined, 200);
      assert.ok(!newSheet.jugadores.some(row=>row.id===context.local.id));
      await expect('PUT', sheetPath(historical), mesaToken, { revision: historical.revision, estado:'finalizado', jugadores:[entry(context.local,9)] },409);
      await expect('PUT', sheetPath(saved), mesaToken, { revision:saved.revision, estado:'finalizado', jugadores:[entry(context.local,9)] },400);
      await expect('PUT', sheetPath(future), mesaToken, { revision:future.revision, estado:'finalizado', jugadores:[entry(context.local,9)] },400);
      const ranking = await expect('GET', rankingPath(context.champ), refereeToken, undefined,200);
      assert.deepEqual(ranking.map(row=>[row.id,row.goles]),[[context.bench.id,3],[context.visitor.id,1]]);
      await save(saved,[entry(context.bench,4),entry(context.visitor,1)]);
      assert.equal((await readPlayer(context.bench)).goles,4);
    });

    await t.test('Equipo con partidos pendientes no se elimina; finalizado borra jugadores, encuentros y estadísticas', async () => {
      const context = await fixture(); let match = await createMatch(context); let before = await auditCount();
      await expect('DELETE', '/equipos/' + context.localTeam.id, adminToken, undefined, 409);
      assert.equal(await auditCount(), before);
      match = await save(match, [entry(context.local, 2, 1)], mesaToken, 'en_curso'); before = await auditCount();
      await expect('DELETE', '/equipos/' + context.localTeam.id, adminToken, undefined, 409);
      assert.equal(await auditCount(), before);
      match = await save(match, [entry(context.local, 2, 1),entry(context.visitor,1)]);
      await expect('DELETE', '/equipos/' + context.localTeam.id, adminToken, undefined, 200);
      for (const path of ['/equipos/'+context.localTeam.id,'/jugadores/'+context.local.id,'/jugadores/'+context.bench.id,'/partidos/'+match.id]) await expect('GET',path,refereeToken,undefined,404);
      assert.deepEqual(await expect('GET', matchesPath(context.champ), refereeToken, undefined, 200),[]);
      assert.deepEqual(await expect('GET', rankingPath(context.champ), refereeToken, undefined, 200),[]);
      assert.equal((await pool.query('SELECT 1 FROM equipos WHERE id=$1',[context.localTeam.id])).rowCount,0);
      assert.equal((await pool.query('SELECT 1 FROM jugadores WHERE equipo_id=$1',[context.localTeam.id])).rowCount,0);
      assert.equal((await pool.query('SELECT 1 FROM partidos WHERE id=$1',[match.id])).rowCount,0);
      assert.equal((await pool.query('SELECT 1 FROM estadisticas_partido_jugador WHERE partido_id=$1',[match.id])).rowCount,0);
      assert.deepEqual(counters(await readPlayer(context.visitor)),{goles:0,amarillas:0,rojas:0,partidos_jugados:0});
      await expect('POST', matchesPath(context.champ), mesaToken, matchData(context, { fecha_hora: '2026-09-16T18:00' }), 400);
    });

    await t.test('Crear partido y eliminar equipo simultáneamente no deja un partido nuevo con equipo eliminado', async () => {
      const context = await fixture();
      const results = await Promise.all([
        call('POST', matchesPath(context.champ), mesaToken, matchData(context)),
        call('DELETE', '/equipos/' + context.localTeam.id, adminToken),
      ]);
      assert.ok((results[0].status === 201 && results[1].status === 409) || (results[0].status === 400 && results[1].status === 200), JSON.stringify(results.map(item => item.status)));
      const unsafe = await pool.query("SELECT p.id FROM partidos p JOIN equipos e ON e.id=p.equipo_local_id WHERE p.campeonato_id=$1 AND p.estado='programado' AND e.eliminado_at IS NOT NULL", [context.champ.id_campeonato]);
      assert.equal(unsafe.rows.length, 0);
    });


    await t.test('Solo admin elimina partidos con revisión vigente y retira sus goles y tarjetas de acumulados', async () => {
      const context = await fixture(); let match = await createMatch(context);
      match = await save(match, [entry(context.local, 4, 2, 1), entry(context.visitor, 1)]);
      const retained = await createMatch(context, { fecha_hora: '2026-09-15T18:00' });
      await save(retained, [entry(context.local, 2, 1)]);
      assert.deepEqual(counters(await readPlayer(context.local)), { goles: 6, amarillas: 3, rojas: 1, partidos_jugados: 2 });
      const path = '/partidos/' + match.id; const beforeAudit = await auditCount();
      await expect('DELETE', path, null, { revision: match.revision }, 401);
      for (const token of [mesaToken, refereeToken]) await expect('DELETE', path, token, { revision: match.revision }, 403);
      for (const body of [undefined, {}, { revision: null }, { revision: -1 }, { revision: '' }]) await expect('DELETE', path, adminToken, body, 400);
      await expect('DELETE', path, adminToken, { revision: 0 }, 409);
      assert.equal(await auditCount(), beforeAudit);
      assert.deepEqual(await expect('DELETE', path, adminToken, { revision: match.revision }, 200), { ok: true });
      assert.equal(await auditCount(), beforeAudit + 1);
      await expect('GET', path, refereeToken, undefined, 404);
      await expect('DELETE', path, adminToken, { revision: match.revision }, 404);
      await expect('PUT', sheetPath(match), mesaToken, { revision: match.revision, estado: 'finalizado', jugadores: [entry(context.local, 9)] }, 404);
      assert.deepEqual((await expect('GET', matchesPath(context.champ), refereeToken, undefined, 200)).map(row => row.id), [retained.id]);
      assert.deepEqual(counters(await readPlayer(context.local)), { goles: 2, amarillas: 1, rojas: 0, partidos_jugados: 1 });
      assert.deepEqual(counters(await readPlayer(context.visitor)), { goles: 0, amarillas: 0, rojas: 0, partidos_jugados: 0 });
      const ranking = await expect('GET', rankingPath(context.champ), refereeToken, undefined, 200);
      assert.deepEqual(ranking.map(row => [row.id, row.goles, row.amarillas, row.rojas]), [[context.local.id, 2, 1, 0]]);
      assert.equal((await pool.query('SELECT id FROM partidos WHERE id=$1', [match.id])).rowCount,0);
      assert.equal((await pool.query('SELECT count(*)::int AS total FROM estadisticas_partido_jugador WHERE partido_id=$1', [match.id])).rows[0].total, 0);
      assert.equal((await pool.query('SELECT 1 FROM historial_participantes_partido WHERE partido_id=$1',[match.id])).rowCount,0);
      const auditEntry = (await pool.query('SELECT * FROM auditoria_logs ORDER BY id DESC LIMIT 1')).rows[0];
      assert.equal(auditEntry.accion, 'partido_eliminado'); assert.equal(auditEntry.usuario_id, admin.id);
      assert.equal(auditEntry.detalles.partido_id, match.id);
      assert.ok(!JSON.stringify(auditEntry).includes('data:image/')); assert.ok(!JSON.stringify(auditEntry).includes('PLANILLA-CI-'));
    });

    await t.test('Eliminar y corregir simultáneamente conserva una sola operación y audita una sola vez', async () => {
      const context = await fixture(); let match = await createMatch(context);
      match = await save(match, [entry(context.local, 2, 1)]);
      const beforeAudit = await auditCount();
      const results = await Promise.all([
        call('DELETE', '/partidos/' + match.id, adminToken, { revision: match.revision }),
        call('PUT', sheetPath(match), mesaToken, { revision: match.revision, estado: 'finalizado', jugadores: [entry(context.local, 3, 0, 1)] }),
      ]);
      assert.ok((results[0].status === 200 && results[1].status === 404) || (results[0].status === 409 && results[1].status === 200), JSON.stringify(results.map(item => item.status)));
      assert.equal(await auditCount(), beforeAudit + 1);
      if (results[0].status === 200) assert.deepEqual(counters(await readPlayer(context.local)), { goles: 0, amarillas: 0, rojas: 0, partidos_jugados: 0 });
      else assert.deepEqual(counters(await readPlayer(context.local)), { goles: 3, amarillas: 0, rojas: 1, partidos_jugados: 1 });
    });

    await t.test('Si falla auditoría al borrar se conserva partido, revisión y todos sus acumulados', async () => {
      const context = await fixture(); let match = await createMatch(context);
      match = await save(match, [entry(context.local, 2, 1, 1)]);
      const beforeAudit = await auditCount(); failNextAudit = true;
      try { await expect('DELETE', '/partidos/' + match.id, adminToken, { revision: match.revision }, 500); assert.equal(failNextAudit, false); }
      finally { failNextAudit = false; }
      const stored = await expect('GET', '/partidos/' + match.id, refereeToken, undefined, 200);
      assert.equal(stored.revision, match.revision); assert.equal(stored.goles_local, 2);
      assert.deepEqual(counters(await readPlayer(context.local)), { goles: 2, amarillas: 1, rojas: 1, partidos_jugados: 1 });
      assert.equal(await auditCount(), beforeAudit);
    });

    await t.test('Audita marcadores y autoría sin CI ni fotos de jugadores', async () => {
      const context = await fixture(); const start = (await pool.query('SELECT COALESCE(max(id),0)::int AS id FROM auditoria_logs')).rows[0].id;
      const match = await createMatch(context, {}, mesaToken);
      await save(match, [entry(context.local, 2, 1), entry(context.visitor, 1)], adminToken);
      const entries = (await pool.query('SELECT * FROM auditoria_logs WHERE id>$1 ORDER BY id', [start])).rows;
      assert.deepEqual(entries.map(item => item.accion), ['partido_creado', 'planilla_actualizada']);
      assert.deepEqual(entries.map(item => item.usuario_id), [mesa.id, admin.id]);
      assert.ok(entries.every(item => item.detalles.partido_id === match.id && item.detalles.autor.id === item.usuario_id));
      assert.equal(entries[1].detalles.goles_local, 2); assert.equal(entries[1].detalles.goles_visitante, 1);
      const serialized = JSON.stringify(entries); assert.ok(!serialized.includes('PLANILLA-CI-'));
      assert.ok(!serialized.includes('data:image/')); assert.ok(!serialized.includes(password));
    });

    await t.test('Si falla auditoría conserva revisión, marcador y estadísticas; tampoco crea un partido parcial', async () => {
      const context = await fixture(); let match = await createMatch(context);
      match = await save(match, [entry(context.local, 2, 1), entry(context.visitor, 1)]);
      const beforeAudit = await auditCount();
      failNextAudit = true;
      try {
        await expect('PUT', sheetPath(match), mesaToken, { revision: match.revision, estado: 'finalizado', jugadores: [entry(context.local, 9, 0, 1)] }, 500);
        assert.equal(failNextAudit, false);
      } finally { failNextAudit = false; }
      const stored = await expect('GET', '/partidos/' + match.id, refereeToken, undefined, 200);
      assert.equal(stored.revision, match.revision); assert.equal(stored.goles_local, 2); assert.equal(stored.goles_visitante, 1);
      assert.deepEqual(counters(await readPlayer(context.local)), { goles: 2, amarillas: 1, rojas: 0, partidos_jugados: 1 });
      assert.equal(stored.jugadores.find(item => item.id === context.visitor.id).participa, true);
      failNextAudit = true;
      try {
        await expect('POST', matchesPath(context.champ), adminToken, matchData(context, { fecha_hora: '2026-09-16T18:00' }), 500);
        assert.equal(failNextAudit, false);
      } finally { failNextAudit = false; }
      assert.equal((await expect('GET', matchesPath(context.champ), refereeToken, undefined, 200)).length, 1);
      assert.equal(await auditCount(), beforeAudit);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end();
    assert.match(schema, /^arena_matches_test_\d+_[a-f0-9]{10}$/);
    try { await maintenance.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); }
    finally { await maintenance.end(); await configurationPool.end(); }
  }
});
