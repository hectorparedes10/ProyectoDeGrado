const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const { pool: configurationPool } = require('../config/db');
const { ensureAccessSchema } = require('../src/security/schema');
const { transaction } = require('../src/security/access');
const { deletePlayers, deleteMatches, deleteTeams, deleteChampionship } = require('../src/services/sportsDeletion');

test('Borrado físico y migración de bajas con tablas heredadas en PostgreSQL aislado', { timeout: 120000 }, async t => {
  const schema = 'arena_delete_test_' + process.pid + '_' + randomBytes(5).toString('hex');
  assert.match(schema, /^arena_delete_test_\d+_[a-f0-9]{10}$/);
  const options = { ...configurationPool.options, password: configurationPool.options.password };
  const maintenance = new Pool({ ...options, max: 1 });
  const pool = new Pool({ ...options, options: '-c search_path=' + schema, max: 4 });
  let serial = 0, user;
  const tables = ['campeonatos','equipos','jugadores','partidos','estadisticas_partido_jugador','historial_participantes_partido','asistencia_partido','sanciones','tabla_posiciones','tarifas_campeonato','transacciones_financieras','turnos_campeonato','fixture_campeonato','jornadas_campeonato','solicitudes_campeonato','auditoria_logs','usuarios_sistema'];
  async function snapshot() {
    const result = {};
    for (const table of tables) result[table] = (await pool.query('SELECT row_to_json(t) AS data FROM '+table+' t ORDER BY row_to_json(t)::text')).rows;
    return result;
  }
  async function seed() {
    const champ = (await pool.query("INSERT INTO campeonatos(nombre,modalidad,categoria,limite_equipos,activo) VALUES($1,'Solamente ida','Mixto',8,true) RETURNING id_campeonato", ['Copa '+(++serial)])).rows[0].id_campeonato;
    const teams=[],players=[];
    for (let i=0;i<2;i++) {
      const team=(await pool.query("INSERT INTO equipos(campeonato_id,nombre,categoria) VALUES($1,$2,'mixto') RETURNING id",[champ,'Equipo '+(++serial)])).rows[0].id;
      teams.push(team);
      players.push((await pool.query("INSERT INTO jugadores(equipo_id,nombre,apellido,ci,dorsal,foto) VALUES($1,'Jugador','Prueba',$2,1,'foto de prueba') RETURNING id",[team,'TEST-'+(++serial)])).rows[0].id);
      await pool.query('INSERT INTO tabla_posiciones(campeonato_id,equipo_id) VALUES($1,$2)',[champ,team]);
      await pool.query('INSERT INTO transacciones_financieras(campeonato_id,equipo_id) VALUES($1,$2)',[champ,team]);
    }
    const match=(await pool.query("INSERT INTO partidos(campeonato_id,categoria,equipo_local_id,equipo_visitante_id,fecha_hora,cancha_numero,estado,goles_local,goles_visitante) VALUES($1,'mixto',$2,$3,'2026-09-24 18:00',1,'finalizado',2,1) RETURNING id",[champ,...teams])).rows[0].id;
    for(let i=0;i<2;i++) {
      await pool.query('INSERT INTO estadisticas_partido_jugador(partido_id,jugador_id,equipo_id,goles,amarillas) VALUES($1,$2,$3,$4,1)',[match,players[i],teams[i],2-i]);
      await pool.query('INSERT INTO historial_participantes_partido(partido_id,jugador_id) VALUES($1,$2)',[match,players[i]]);
      await pool.query('INSERT INTO asistencia_partido(partido_id,jugador_id) VALUES($1,$2)',[match,players[i]]);
      await pool.query('INSERT INTO sanciones(partido_origen_id,jugador_id) VALUES($1,$2)',[match,players[i]]);
    }
    // Championship-only rows have no FK in the legacy installation.
    for(const table of ['transacciones_financieras','tarifas_campeonato','turnos_campeonato']) await pool.query('INSERT INTO '+table+'(campeonato_id) VALUES($1)',[champ]);
    await pool.query('INSERT INTO transacciones_financieras(campeonato_id,partido_id) VALUES($1,$2)',[champ,match]);
    await pool.query("INSERT INTO fixture_campeonato(campeonato_id,datos,jornada_actual,completado) VALUES($1,'{}',1,true)",[champ]);
    await pool.query("INSERT INTO jornadas_campeonato(campeonato_id,numero,fecha_inicio,fecha_fin) VALUES($1,1,'2026-09-24 18:00','2026-09-24 19:00')",[champ]);
    const request=(await pool.query("INSERT INTO solicitudes_campeonato(solicitante_id,datos,estado,campeonato_id) VALUES($1,'{}','aprobada',$2) RETURNING id",[user,champ])).rows[0].id;
    return {champ,teams,players,match,request};
  }
  async function noRows(table,column,id) { assert.equal((await pool.query('SELECT 1 FROM '+table+' WHERE '+column+'=$1',[id])).rowCount,0,table); }
  try {
    await maintenance.query('CREATE SCHEMA '+schema);
    await pool.query(`
      CREATE TABLE usuarios_sistema(id SERIAL PRIMARY KEY,nombre VARCHAR(100),email VARCHAR(150) UNIQUE,password_hash VARCHAR(255),rol VARCHAR(50),activo BOOLEAN DEFAULT true,created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE campeonatos(id_campeonato SERIAL PRIMARY KEY,nombre VARCHAR(100),modalidad VARCHAR(50),categoria VARCHAR(30),cantidad_canchas INT,limite_equipos INT,hora_inicio VARCHAR(10),duracion_partido_min INT,descanso_entre_partidos_min INT,activo BOOLEAN);
      CREATE TABLE auditoria_logs(id SERIAL PRIMARY KEY,usuario_id INT REFERENCES usuarios_sistema(id),accion VARCHAR(100),detalles JSONB,ip_origen VARCHAR(45),created_at TIMESTAMP DEFAULT NOW());
    `);
    await ensureAccessSchema(pool);
    // Restrictive FKs prove that cleanup does not rely on accidental cascades.
    await pool.query(`
      CREATE TABLE asistencia_partido(id SERIAL PRIMARY KEY,partido_id INT REFERENCES partidos(id),jugador_id INT REFERENCES jugadores(id));
      CREATE TABLE sanciones(id SERIAL PRIMARY KEY,partido_origen_id INT REFERENCES partidos(id),jugador_id INT REFERENCES jugadores(id));
      CREATE TABLE tabla_posiciones(id SERIAL PRIMARY KEY,campeonato_id INT,equipo_id INT REFERENCES equipos(id));
      CREATE TABLE transacciones_financieras(id SERIAL PRIMARY KEY,campeonato_id INT,equipo_id INT REFERENCES equipos(id),partido_id INT REFERENCES partidos(id));
      CREATE TABLE tarifas_campeonato(id SERIAL PRIMARY KEY,campeonato_id INT);
      CREATE TABLE turnos_campeonato(id SERIAL PRIMARY KEY,campeonato_id INT);
    `);
    user=(await pool.query("INSERT INTO usuarios_sistema(nombre,email,password_hash,rol,activo) VALUES('Admin prueba','bajas@example.test','no-login','admin',false) RETURNING id")).rows[0].id;

    await t.test('Borrar jugador quita foto, estadísticas, historial, asistencia y sanciones sin afectar al rival',async()=>{
      const data=await seed();
      await transaction(pool,client=>deletePlayers(client,[data.players[0]]));
      for(const [table,column] of [['jugadores','id'],['estadisticas_partido_jugador','jugador_id'],['historial_participantes_partido','jugador_id'],['asistencia_partido','jugador_id'],['sanciones','jugador_id']]) await noRows(table,column,data.players[0]);
      assert.equal((await pool.query('SELECT 1 FROM jugadores WHERE id=$1',[data.players[1]])).rowCount,1);
      assert.deepEqual((await pool.query('SELECT goles_local,goles_visitante,revision FROM partidos WHERE id=$1',[data.match])).rows[0],{goles_local:0,goles_visitante:1,revision:1});
      assert.equal((await pool.query('SELECT 1 FROM asistencia_partido WHERE jugador_id=$1',[data.players[1]])).rowCount,1);
    });
    await t.test('Borrar partido quita todas sus referencias sin borrar equipos ni jugadores',async()=>{
      const data=await seed();
      await transaction(pool,client=>deleteMatches(client,[data.match]));
      for(const [table,column] of [['partidos','id'],['estadisticas_partido_jugador','partido_id'],['historial_participantes_partido','partido_id'],['asistencia_partido','partido_id'],['sanciones','partido_origen_id'],['transacciones_financieras','partido_id']]) await noRows(table,column,data.match);
      assert.equal((await pool.query('SELECT 1 FROM jugadores WHERE id=ANY($1::int[])',[data.players])).rowCount,2);
    });
    await t.test('Borrar equipo quita posiciones, pagos y encuentros sin borrar el equipo contrario',async()=>{
      const data=await seed();
      const counts=await transaction(pool,client=>deleteTeams(client,[data.teams[0]]));
      assert.deepEqual(counts,{equipos_eliminados:1,jugadores_eliminados:1,partidos_eliminados:1});
      for(const [table,column] of [['equipos','id'],['jugadores','equipo_id'],['tabla_posiciones','equipo_id'],['transacciones_financieras','equipo_id']]) await noRows(table,column,data.teams[0]);
      await noRows('partidos','id',data.match);
      assert.equal((await pool.query('SELECT 1 FROM equipos WHERE id=$1',[data.teams[1]])).rowCount,1);
    });
    await t.test('Borrar campeonato limpia tablas heredadas sin FK y conserva su solicitud aprobada',async()=>{
      const data=await seed(); const untouched=await seed();
      const counts=await transaction(pool,client=>deleteChampionship(client,data.champ));
      assert.deepEqual(counts,{equipos_eliminados:2,jugadores_eliminados:2,partidos_eliminados:1});
      await noRows('campeonatos','id_campeonato',data.champ);
      for(const table of ['equipos','partidos','tabla_posiciones','tarifas_campeonato','transacciones_financieras','turnos_campeonato','fixture_campeonato','jornadas_campeonato']) await noRows(table,'campeonato_id',data.champ);
      for(const id of data.players) await noRows('jugadores','id',id);
      const request=(await pool.query('SELECT estado,campeonato_id FROM solicitudes_campeonato WHERE id=$1',[data.request])).rows[0];
      assert.deepEqual(request,{estado:'aprobada',campeonato_id:null});
      assert.equal((await pool.query('SELECT 1 FROM jugadores WHERE id=ANY($1::int[])',[untouched.players])).rowCount,2);
      assert.equal((await pool.query('SELECT goles_local FROM partidos WHERE id=$1',[untouched.match])).rows[0].goles_local,2);
    });
    await t.test('Migración de bajas antiguas es atómica, idempotente y conserva campeonatos inactivos',async()=>{
      const champ=await seed(), team=await seed(), match=await seed(), player=await seed(), inactive=await seed();
      await pool.query('UPDATE campeonatos SET eliminado_at=NOW() WHERE id_campeonato=$1',[champ.champ]);
      await pool.query('UPDATE equipos SET eliminado_at=NOW() WHERE id=$1',[team.teams[0]]);
      await pool.query('UPDATE partidos SET eliminado_at=NOW() WHERE id=$1',[match.match]);
      await pool.query('UPDATE jugadores SET eliminado_at=NOW() WHERE id=$1',[player.players[0]]);
      await pool.query('UPDATE campeonatos SET activo=false WHERE id_campeonato=$1',[inactive.champ]);
      const before=await snapshot();
      await pool.query(`CREATE FUNCTION fail_migration() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.accion='eliminacion_fisica_migrada' THEN RAISE EXCEPTION 'audit test failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER reject_migration BEFORE INSERT ON auditoria_logs FOR EACH ROW EXECUTE FUNCTION fail_migration();`);
      await assert.rejects(ensureAccessSchema(pool),/audit test failure/);
      assert.deepEqual(await snapshot(),before);
      await pool.query('DROP TRIGGER reject_migration ON auditoria_logs');
      await ensureAccessSchema(pool);
      await noRows('campeonatos','id_campeonato',champ.champ); await noRows('equipos','id',team.teams[0]);
      await noRows('partidos','id',match.match); await noRows('jugadores','id',player.players[0]);
      const audit=(await pool.query("SELECT detalles FROM auditoria_logs WHERE accion='eliminacion_fisica_migrada'")).rows;
      assert.deepEqual(audit,[{detalles:{campeonatos_eliminados:1,equipos_eliminados:3,jugadores_eliminados:4,partidos_eliminados:3}}]);
      assert.equal((await pool.query('SELECT activo FROM campeonatos WHERE id_campeonato=$1',[inactive.champ])).rows[0].activo,false);
      assert.equal((await pool.query('SELECT 1 FROM jugadores WHERE id=ANY($1::int[])',[inactive.players])).rowCount,2);
      assert.equal((await pool.query('SELECT 1 FROM usuarios_sistema WHERE id=$1',[user])).rowCount,1);
      const migrated=await snapshot(); await ensureAccessSchema(pool); assert.deepEqual(await snapshot(),migrated);
    });
  } finally {
    await pool.end();
    assert.match(schema,/^arena_delete_test_\d+_[a-f0-9]{10}$/);
    try { await maintenance.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE'); }
    finally { await maintenance.end(); await configurationPool.end(); }
  }
});
