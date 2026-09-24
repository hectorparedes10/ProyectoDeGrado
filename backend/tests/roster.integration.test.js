const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const { pool: configurationPool } = require('../config/db');
const { createApp } = require('../src/app');
const { ensureAccessSchema } = require('../src/security/schema');
const { hashPassword } = require('../src/security/access');

// A complete 1 x 1 PNG, rather than a MIME label around arbitrary bytes.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('Equipos y jugadores persistentes, permisos y concurrencia con PostgreSQL aislado', { timeout: 120000 }, async t => {
  const schema = 'arena_roster_test_' + process.pid + '_' + randomBytes(5).toString('hex');
  assert.match(schema, /^arena_roster_test_\d+_[a-f0-9]{10}$/);
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
  const password = 'Arena-roster-test-928!';
  let server, sequence = 0, admin, mesa, referee, adminToken, mesaToken, refereeToken;
  let legacyChampionship, legacyTeam, legacyPlayer;
  async function call(method, path, token, body, instance = server) {
    const response = await fetch('http://127.0.0.1:' + instance.address().port + '/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    return { status: response.status, data: await response.json() };
  }
  async function expect(method, path, token, body, status, instance) {
    const result = await call(method, path, token, body, instance);
    assert.equal(result.status, status, method + ' ' + path + ': ' + (result.data.error || result.status));
    return result.data;
  }
  const teamsPath = championship => '/campeonatos/' + championship.id_campeonato + '/equipos';
  const playersPath = team => '/equipos/' + team.id + '/jugadores';
  function teamData(extra = {}) {
    return { nombre: 'Equipo de prueba ' + (++sequence), curso: '4to A', delegado_nombre: 'Delegado de prueba', delegado_telefono: '+591 70000000', escudo: null, ...extra };
  }
  function playerData(extra = {}) {
    return { nombre: 'Jugador de prueba', apellido: 'Apellido de prueba', ci: 'ROSTER-' + (++sequence), curso: '4to A', fecha_nacimiento: '2008-01-15', dorsal: sequence % 100, foto: PNG, ...extra };
  }
  async function championship(extra = {}) {
    return expect('POST', '/campeonatos', adminToken, {
      nombre: 'Campeonato de prueba ' + (++sequence), modalidad: 'Ida y vuelta', categoria: 'Varones',
      cantidad_canchas: 2, limite_equipos: 12, hora_inicio: '18:00', duracion_partido_min: 30,
      descanso_entre_partidos_min: 5, activo: true, ...extra,
    }, 201);
  }
  const createTeam = (champ, extra = {}, token = adminToken) => expect('POST', teamsPath(champ), token, teamData(extra), 201);
  const createPlayer = (team, extra = {}, token = adminToken) => expect('POST', playersPath(team), token, playerData(extra), 201);
  const total = async table => (await pool.query('SELECT count(*)::int AS total FROM ' + table)).rows[0].total;
  try {
    await maintenance.query('CREATE SCHEMA ' + schema);
    await pool.query(`
      CREATE TABLE usuarios_sistema (
        id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL, email VARCHAR(150) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL, rol VARCHAR(50) NOT NULL, activo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE campeonatos (
        id_campeonato SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL, modalidad VARCHAR(50) NOT NULL,
        categoria VARCHAR(30), cantidad_canchas INTEGER, limite_equipos INTEGER NOT NULL,
        hora_inicio VARCHAR(10), duracion_partido_min INTEGER, descanso_entre_partidos_min INTEGER,
        activo BOOLEAN
      );
      CREATE TABLE auditoria_logs (
        id SERIAL PRIMARY KEY, usuario_id INTEGER REFERENCES usuarios_sistema(id), accion VARCHAR(100),
        detalles JSONB, ip_origen VARCHAR(45), created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE equipos (
        id SERIAL PRIMARY KEY, campeonato_id INTEGER REFERENCES campeonatos(id_campeonato),
        nombre VARCHAR(100) NOT NULL, categoria VARCHAR(20) NOT NULL CHECK (categoria IN ('varones','damas')),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE jugadores (
        id SERIAL PRIMARY KEY, equipo_id INTEGER REFERENCES equipos(id) ON DELETE CASCADE,
        nombre VARCHAR(100) NOT NULL, apellido VARCHAR(100) NOT NULL,
        ci VARCHAR(20) NOT NULL CONSTRAINT jugadores_dni_key UNIQUE, dorsal INTEGER,
        foto_url VARCHAR(255), face_descriptor JSONB, suspendido BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    legacyChampionship = (await pool.query("INSERT INTO campeonatos (nombre,modalidad,categoria,limite_equipos) VALUES ('Campeonato previo','Ida y vuelta','Varones',12) RETURNING *")).rows[0];
    legacyTeam = (await pool.query("INSERT INTO equipos (campeonato_id,nombre,categoria) VALUES ($1,'Equipo previo','varones') RETURNING *", [legacyChampionship.id_campeonato])).rows[0];
    legacyPlayer = (await pool.query("INSERT INTO jugadores (equipo_id,nombre,apellido,ci,dorsal) VALUES ($1,'Jugador previo','Apellido previo','LEGACY-01',8) RETURNING *", [legacyTeam.id])).rows[0];
    await ensureAccessSchema(pool);
    await ensureAccessSchema(pool);
    const passwordHash = await hashPassword(password);
    const accounts = [];
    for (const role of ['admin', 'mesa', 'arbitro']) {
      accounts.push((await pool.query('INSERT INTO usuarios_sistema (nombre,email,password_hash,rol) VALUES ($1,$2,$3,$4) RETURNING id,email', ['Prueba ' + role, role + '@roster.example.test', passwordHash, role])).rows[0]);
    }
    [admin, mesa, referee] = accounts;
    await new Promise(resolve => { server = createApp(watchedPool).listen(0, '127.0.0.1', resolve); });
    [adminToken, mesaToken, refereeToken] = await Promise.all(accounts.map(async account => (
      await expect('POST', '/auth/login', null, { email: account.email, password }, 200)
    ).token));

    await t.test('La migración repetida conserva registros anteriores con campos nuevos sin completar', async () => {
      const team = await expect('GET', '/equipos/' + legacyTeam.id, adminToken, undefined, 200);
      assert.equal(team.id, legacyTeam.id); assert.equal(team.nombre, legacyTeam.nombre);
      assert.equal(team.curso, null); assert.equal(team.escudo, null);
      const player = await expect('GET', '/jugadores/' + legacyPlayer.id, adminToken, undefined, 200);
      assert.equal(player.id, legacyPlayer.id); assert.equal(player.ci, legacyPlayer.ci);
      assert.equal(player.fecha_nacimiento, null); assert.equal(player.edad, null);
      assert.equal(player.curso, null); assert.equal(player.foto, null);
      assert.equal((await expect('GET', playersPath(team), refereeToken, undefined, 200))[0].id, legacyPlayer.id);
      await ensureAccessSchema(pool);
      assert.equal((await expect('GET', '/jugadores/' + legacyPlayer.id, mesaToken, undefined, 200)).ci, legacyPlayer.ci);
    });

    await t.test('Exige sesión en todas las rutas; admin, mesa y árbitro pueden consultar', async () => {
      const reads = [teamsPath(legacyChampionship), '/equipos/' + legacyTeam.id, playersPath(legacyTeam), '/jugadores/' + legacyPlayer.id];
      for (const path of reads) {
        await expect('GET', path, null, undefined, 401);
        for (const token of [adminToken, mesaToken, refereeToken]) await expect('GET', path, token, undefined, 200);
      }
      for (const [method, path, body] of [
        ['POST', teamsPath(legacyChampionship), teamData()], ['PUT', '/equipos/' + legacyTeam.id, teamData()],
        ['POST', playersPath(legacyTeam), playerData()], ['PUT', '/jugadores/' + legacyPlayer.id, playerData()],
      ]) {
        await expect(method, path, null, body, 401);
        await expect(method, path, refereeToken, body, 403);
      }
      assert.equal(await total('equipos'), 1); assert.equal(await total('jugadores'), 1);
    });

    await t.test('Persiste escudo, foto y campos del formulario y los recupera en otra instancia', async () => {
      const champ = await championship({ categoria: 'Damas' });
      const team = await createTeam(champ, { escudo: PNG }, mesaToken);
      assert.equal(team.campeonato_id, champ.id_campeonato); assert.equal(team.categoria, 'damas');
      assert.equal(team.curso, '4to A'); assert.equal(team.delegado_nombre, 'Delegado de prueba');
      assert.equal(team.delegado_telefono, '+591 70000000'); assert.equal(team.escudo, PNG);
      const data = playerData({ foto: PNG, dorsal: 10 });
      const player = await expect('POST', playersPath(team), mesaToken, data, 201);
      for (const field of ['nombre', 'apellido', 'ci', 'curso', 'fecha_nacimiento', 'dorsal', 'foto']) assert.equal(player[field], data[field]);
      assert.equal(player.equipo_id, team.id);
      const expectedAge = (await pool.query("SELECT EXTRACT(YEAR FROM age((now() AT TIME ZONE 'America/La_Paz')::date,$1::date))::int AS edad", [data.fecha_nacimiento])).rows[0].edad;
      assert.equal(player.edad, expectedAge);
      const secondServer = await new Promise(resolve => { const instance = createApp(pool).listen(0, '127.0.0.1', () => resolve(instance)); });
      try {
        const persistedTeam = await expect('GET', '/equipos/' + team.id, refereeToken, undefined, 200, secondServer);
        const persistedPlayer = await expect('GET', '/jugadores/' + player.id, refereeToken, undefined, 200, secondServer);
        assert.equal(persistedTeam.escudo, PNG); assert.equal(persistedPlayer.foto, PNG);
        assert.equal(persistedPlayer.ci, data.ci); assert.equal(persistedPlayer.edad, expectedAge);
        assert.ok((await expect('GET', teamsPath(champ), refereeToken, undefined, 200, secondServer)).some(item => item.id === team.id));
      } finally { await new Promise(resolve => secondServer.close(resolve)); }
    });

    await t.test('PUT parcial conserva imágenes y no permite mover registros cambiando IDs del cuerpo', async () => {
      const champ = await championship(); const otherChamp = await championship();
      const team = await createTeam(champ, { escudo: PNG }); const otherTeam = await createTeam(otherChamp);
      const player = await createPlayer(team, { foto: PNG, dorsal: 7 });
      const updatedTeam = await expect('PUT', '/equipos/' + team.id, mesaToken, { nombre: 'Nombre actualizado', id: otherTeam.id, campeonato_id: otherChamp.id_campeonato, categoria: 'damas' }, 200);
      assert.equal(updatedTeam.id, team.id); assert.equal(updatedTeam.campeonato_id, champ.id_campeonato);
      assert.equal(updatedTeam.categoria, 'varones'); assert.equal(updatedTeam.escudo, PNG);
      assert.equal(updatedTeam.curso, team.curso); assert.equal(updatedTeam.nombre, 'Nombre actualizado');
      const updatedPlayer = await expect('PUT', '/jugadores/' + player.id, mesaToken, { apellido: 'Apellido actualizado', id: 999999, equipo_id: otherTeam.id }, 200);
      assert.equal(updatedPlayer.id, player.id); assert.equal(updatedPlayer.equipo_id, team.id);
      assert.equal(updatedPlayer.foto, PNG); assert.equal(updatedPlayer.fecha_nacimiento, player.fecha_nacimiento);
      assert.equal(updatedPlayer.apellido, 'Apellido actualizado'); assert.equal(updatedPlayer.ci, player.ci);
      assert.equal((await expect('GET', playersPath(otherTeam), adminToken, undefined, 200)).length, 0);
      assert.equal((await expect('PUT', '/equipos/' + team.id, adminToken, { escudo: null }, 200)).escudo, null);
      await expect('PUT', '/jugadores/' + player.id, adminToken, { foto: '' }, 400);
      assert.equal((await expect('GET', '/jugadores/' + player.id, adminToken, undefined, 200)).foto, PNG);
    });

    await t.test('Ordena dorsales numéricamente, admite cero y rechaza duplicados por equipo', async () => {
      const champ = await championship(); const team = await createTeam(champ); const otherTeam = await createTeam(champ);
      const ten = await createPlayer(team, { dorsal: 10 }); const two = await createPlayer(team, { dorsal: 2 });
      const zero = await createPlayer(team, { dorsal: 0 }); const seven = await createPlayer(team, { dorsal: 7 });
      assert.deepEqual((await expect('GET', playersPath(team), refereeToken, undefined, 200)).map(item => item.dorsal), [0, 2, 7, 10]);
      await expect('POST', playersPath(team), adminToken, playerData({ dorsal: 2 }), 409);
      await expect('PUT', '/jugadores/' + ten.id, mesaToken, { dorsal: 2 }, 409);
      assert.equal((await expect('GET', '/jugadores/' + ten.id, adminToken, undefined, 200)).dorsal, 10);
      assert.equal((await createPlayer(otherTeam, { dorsal: 2 })).dorsal, 2);
      assert.equal((await expect('PUT', '/jugadores/' + two.id, mesaToken, { nombre: 'Mismo dorsal conservado' }, 200)).dorsal, 2);
      assert.notEqual(zero.id, seven.id);
    });

    await t.test('La misma CI no puede registrarse otra vez, ni en otro equipo ni con distinto uso de mayúsculas', async () => {
      const champ = await championship(); const team = await createTeam(champ); const otherTeam = await createTeam(champ);
      const first = await createPlayer(team, { ci: '  prueba-ci-unica  ' });
      assert.equal(first.ci, 'PRUEBA-CI-UNICA');
      await expect('POST', playersPath(otherTeam), mesaToken, playerData({ ci: 'Prueba-Ci-Unica' }), 409);
      const second = await createPlayer(otherTeam);
      await expect('PUT', '/jugadores/' + second.id, adminToken, { ci: first.ci }, 409);
      assert.equal((await expect('GET', '/jugadores/' + second.id, adminToken, undefined, 200)).ci, second.ci);
    });

    await t.test('El nombre del equipo es único por campeonato incluso con espacios o mayúsculas', async () => {
      const champ = await championship(); const otherChamp = await championship();
      const first = await createTeam(champ, { nombre: '  Tigres de prueba  ' });
      assert.equal(first.nombre, 'Tigres de prueba');
      await expect('POST', teamsPath(champ), adminToken, teamData({ nombre: 'TIGRES DE PRUEBA' }), 409);
      const second = await createTeam(champ);
      await expect('PUT', '/equipos/' + second.id, mesaToken, { nombre: 'tigres de prueba' }, 409);
      assert.equal((await expect('GET', '/equipos/' + second.id, adminToken, undefined, 200)).nombre, second.nombre);
      assert.equal((await createTeam(otherChamp, { nombre: 'Tigres de prueba' })).campeonato_id, otherChamp.id_campeonato);
    });

    await t.test('Dos inscripciones simultáneas compiten por el último cupo sin superar el límite', async () => {
      const champ = await championship({ limite_equipos: 2 }); await createTeam(champ);
      const beforeAudit = await total('auditoria_logs');
      const results = await Promise.all([
        call('POST', teamsPath(champ), adminToken, teamData({ nombre: 'Último cupo A' })),
        call('POST', teamsPath(champ), mesaToken, teamData({ nombre: 'Último cupo B' })),
      ]);
      assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
      assert.equal((await expect('GET', teamsPath(champ), adminToken, undefined, 200)).length, 2);
      assert.equal((await pool.query('SELECT count(*)::int AS total FROM equipos WHERE campeonato_id=$1', [champ.id_campeonato])).rows[0].total, 2);
      assert.equal(await total('auditoria_logs'), beforeAudit + 1);
    });

    await t.test('Valida datos obligatorios, fechas reales y futuras, CI y dorsal sin guardar filas inválidas', async () => {
      const champ = await championship(); const team = await createTeam(champ);
      const teamCount = await total('equipos'); const playerCount = await total('jugadores');
      for (const invalid of [
        { nombre: '   ' }, { nombre: 'N'.repeat(101) }, { curso: '' }, { curso: 'C'.repeat(81) },
        { delegado_nombre: '' }, { delegado_telefono: 'abc' }, { delegado_telefono: '123' },
      ]) await expect('POST', teamsPath(champ), mesaToken, teamData(invalid), 400);
      for (const invalid of [
        { nombre: '' }, { apellido: '' }, { ci: '' }, { ci: 'C'.repeat(21) }, { curso: '' },
        { fecha_nacimiento: null }, { fecha_nacimiento: '2008-02-30' }, { fecha_nacimiento: '2999-01-01' },
        { fecha_nacimiento: '15/01/2008' }, { dorsal: -1 }, { dorsal: 100 }, { dorsal: 1.5 },
      ]) await expect('POST', playersPath(team), adminToken, playerData(invalid), 400);
      assert.equal(await total('equipos'), teamCount); assert.equal(await total('jugadores'), playerCount);
      const player = await createPlayer(team, { fecha_nacimiento: '2008-02-29', dorsal: 0 });
      assert.equal(player.fecha_nacimiento, '2008-02-29'); assert.equal(player.dorsal, 0);
      await expect('PUT', '/jugadores/' + player.id, mesaToken, { fecha_nacimiento: '2009-02-29' }, 400);
      assert.equal((await expect('GET', '/jugadores/' + player.id, adminToken, undefined, 200)).fecha_nacimiento, '2008-02-29');
    });

    await t.test('Cada campo de jugador y su fotografía son obligatorios al registrar; PUT no permite vaciarlos', async () => {
      const champ = await championship(); const team = await createTeam(champ);
      const beforePlayers = await total('jugadores'); const beforeAudit = await total('auditoria_logs');
      const fields = ['nombre', 'apellido', 'ci', 'curso', 'fecha_nacimiento', 'dorsal', 'foto'];
      for (const field of fields) {
        const missing = playerData(); delete missing[field];
        await expect('POST', playersPath(team), adminToken, missing, 400);
        for (const value of [null, '', '   ']) await expect('POST', playersPath(team), mesaToken, playerData({ [field]: value }), 400);
      }
      assert.equal(await total('jugadores'), beforePlayers); assert.equal(await total('auditoria_logs'), beforeAudit);
      const player = await createPlayer(team, { dorsal: 0 });
      for (const field of fields) for (const value of [null, '', '   ']) {
        await expect('PUT', '/jugadores/' + player.id, mesaToken, { [field]: value }, 400);
      }
      assert.deepEqual(await expect('GET', '/jugadores/' + player.id, adminToken, undefined, 200), player);
      // Partial changes keep complete stored values; incomplete legacy rows must be completed before editing.
      await expect('PUT', '/jugadores/' + legacyPlayer.id, adminToken, { nombre: 'Aún incompleto' }, 400);
      const completed = await expect('PUT', '/jugadores/' + legacyPlayer.id, adminToken, playerData({ dorsal: 8 }), 200);
      assert.equal(completed.foto, PNG); assert.equal(completed.dorsal, 8);
    });

    await t.test('Rechaza SVG, URLs, MIME falso, cabeceras truncadas y archivos mayores a 1 MiB', async () => {
      const champ = await championship(); const team = await createTeam(champ); const player = await createPlayer(team);
      const pngBytes = Buffer.from(PNG.split(',')[1], 'base64');
      const invalidImages = [
        'https://example.test/imagen.png',
        'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64'),
        PNG.replace('image/png', 'image/jpeg'),
        'data:image/png;base64,' + Buffer.from('esto no es una imagen').toString('base64'),
        'data:image/png;base64,' + pngBytes.subarray(0, 8).toString('base64'),
        'data:image/jpeg;base64,' + Buffer.from([255, 216, 255]).toString('base64'),
        'data:image/webp;base64,' + Buffer.from('RIFF0000WEBP').toString('base64'),
        PNG.slice(0, -1),
      ];
      for (const value of invalidImages) {
        await expect('POST', teamsPath(champ), mesaToken, teamData({ escudo: value }), 400);
        await expect('POST', playersPath(team), adminToken, playerData({ foto: value }), 400);
        await expect('PUT', '/jugadores/' + player.id, mesaToken, { foto: value }, 400);
      }
      const overLimit = 'data:image/png;base64,' + Buffer.concat([pngBytes, Buffer.alloc(1024 * 1024)]).toString('base64');
      await expect('POST', teamsPath(champ), adminToken, teamData({ escudo: overLimit }), 413);
      await expect('PUT', '/jugadores/' + player.id, adminToken, { foto: overLimit }, 413);
      assert.equal((await expect('GET', '/jugadores/' + player.id, refereeToken, undefined, 200)).foto, PNG);
    });

    await t.test('Devuelve 404 para padres o registros inexistentes y no inserta huérfanos', async () => {
      for (const path of ['/campeonatos/999999/equipos', '/equipos/999999', '/equipos/999999/jugadores', '/jugadores/999999']) {
        await expect('GET', path, adminToken, undefined, 404);
      }
      await expect('POST', '/campeonatos/999999/equipos', adminToken, teamData(), 404);
      await expect('POST', '/equipos/999999/jugadores', mesaToken, playerData(), 404);
      await expect('PUT', '/equipos/999999', mesaToken, teamData(), 404);
      await expect('PUT', '/jugadores/999999', adminToken, playerData(), 404);
    });

    await t.test('Solo administrador elimina jugadores y equipos; dejan de verse y no admiten ediciones', async () => {
      const champ = await championship({ limite_equipos: 2 }); const team = await createTeam(champ); const other = await createTeam(champ);
      const player = await createPlayer(team); const teammate = await createPlayer(team);
      for (const path of ['/jugadores/' + player.id, '/equipos/' + team.id]) {
        await expect('DELETE', path, null, undefined, 401);
        await expect('DELETE', path, mesaToken, undefined, 403);
        await expect('DELETE', path, refereeToken, undefined, 403);
      }
      const beforeAudit = await total('auditoria_logs');
      await expect('DELETE', '/jugadores/' + player.id, adminToken, undefined, 200);
      assert.equal((await pool.query('SELECT id FROM jugadores WHERE id=$1', [player.id])).rowCount, 0);
      assert.equal((await expect('GET', playersPath(team), adminToken, undefined, 200)).length, 1);
      const teamInfo = await expect('GET', '/equipos/' + team.id, adminToken, undefined, 200);
      assert.equal(teamInfo.cantidad_jugadores, 1);
      await expect('GET', '/jugadores/' + player.id, adminToken, undefined, 404);
      await expect('PUT', '/jugadores/' + player.id, adminToken, { nombre: 'No resucitar' }, 404);
      await expect('DELETE', '/jugadores/' + player.id, adminToken, undefined, 404);
      await expect('DELETE', '/equipos/' + team.id, adminToken, undefined, 200);
      assert.equal((await pool.query('SELECT id FROM equipos WHERE id=$1', [team.id])).rowCount, 0);
      assert.equal((await pool.query('SELECT id FROM jugadores WHERE id=$1', [teammate.id])).rowCount, 0);
      assert.deepEqual((await expect('GET', teamsPath(champ), adminToken, undefined, 200)).map(item => item.id), [other.id]);
      for (const path of ['/equipos/' + team.id, playersPath(team)]) await expect('GET', path, refereeToken, undefined, 404);
      await expect('PUT', '/equipos/' + team.id, adminToken, { nombre: 'No resucitar' }, 404);
      await expect('POST', playersPath(team), adminToken, playerData(), 404);
      assert.equal(await total('auditoria_logs'), beforeAudit + 2);
      const replacement = await createTeam(champ, { nombre: team.nombre });
      assert.notEqual(replacement.id, team.id);
      const newPlayer = await createPlayer(replacement, { ci: player.ci, dorsal: player.dorsal });
      assert.notEqual(newPlayer.id, player.id);
      assert.equal((await expect('GET', teamsPath(champ), adminToken, undefined, 200)).length, 2);
    });

    await t.test('Eliminaciones simultáneas producen una sola baja y una sola auditoría', async () => {
      const champ = await championship(); const team = await createTeam(champ); const player = await createPlayer(team);
      for (const path of ['/jugadores/' + player.id, '/equipos/' + team.id]) {
        const before = await total('auditoria_logs');
        const results = await Promise.all([call('DELETE', path, adminToken), call('DELETE', path, adminToken)]);
        assert.deepEqual(results.map(item => item.status).sort(), [200, 404]);
        assert.equal(await total('auditoria_logs'), before + 1);
      }
    });

    await t.test('Auditoría registra autoría y cambios sin fotografías, CI ni datos faciales', async () => {
      const champ = await championship(); const before = (await pool.query('SELECT COALESCE(max(id),0)::int AS id FROM auditoria_logs')).rows[0].id;
      const team = await createTeam(champ, { escudo: PNG }, mesaToken);
      const player = await createPlayer(team, { ci: 'CI-PRIVADA-AUDIT', foto: PNG }, adminToken);
      await expect('PUT', '/jugadores/' + player.id, mesaToken, { nombre: 'Nombre corregido' }, 200);
      await expect('DELETE', '/equipos/' + team.id, adminToken, undefined, 200);
      const entries = (await pool.query('SELECT * FROM auditoria_logs WHERE id>$1 ORDER BY id', [before])).rows;
      assert.equal(entries.length, 4);
      assert.deepEqual(entries.map(item => item.usuario_id), [mesa.id, admin.id, mesa.id, admin.id]);
      assert.ok(entries.every(item => item.detalles.autor.id === item.usuario_id));
      const serialized = JSON.stringify(entries);
      assert.ok(!serialized.includes('data:image/')); assert.ok(!serialized.includes('CI-PRIVADA-AUDIT'));
      assert.ok(!serialized.includes('face_descriptor')); assert.ok(!serialized.includes(password));
    });

    await t.test('Fallo de auditoría revierte altas, ediciones y bajas completas', async () => {
      const champ = await championship(); const team = await createTeam(champ, { escudo: PNG }); const player = await createPlayer(team);
      const teamCount = await total('equipos'); const playerCount = await total('jugadores'); const auditCount = await total('auditoria_logs');
      for (const [method, path, token, body] of [
        ['POST', teamsPath(champ), mesaToken, teamData()], ['POST', playersPath(team), adminToken, playerData()],
        ['PUT', '/equipos/' + team.id, mesaToken, { nombre: 'No debe persistir', escudo: null }],
        ['PUT', '/jugadores/' + player.id, mesaToken, { nombre: 'No debe persistir' }],
        ['DELETE', '/jugadores/' + player.id, adminToken], ['DELETE', '/equipos/' + team.id, adminToken],
      ]) {
        failNextAudit = true;
        try { await expect(method, path, token, body, 500); assert.equal(failNextAudit, false); }
        finally { failNextAudit = false; }
      }
      assert.equal(await total('equipos'), teamCount); assert.equal(await total('jugadores'), playerCount);
      assert.equal(await total('auditoria_logs'), auditCount);
      assert.deepEqual(await expect('GET', '/equipos/' + team.id, adminToken, undefined, 200), { ...team, cantidad_jugadores: 1 });
      assert.deepEqual(await expect('GET', '/jugadores/' + player.id, adminToken, undefined, 200), player);
      assert.equal((await pool.query('SELECT eliminado_at FROM jugadores WHERE id=$1', [player.id])).rows[0].eliminado_at, null);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end();
    assert.match(schema, /^arena_roster_test_\d+_[a-f0-9]{10}$/);
    try { await maintenance.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); }
    finally { await maintenance.end(); await configurationPool.end(); }
  }
});
