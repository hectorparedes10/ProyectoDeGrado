// Isolated visual fixture. No production records are read or changed.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const { pool: configurationPool } = require('../config/db');
const { createApp } = require('../src/app');
const { ensureAccessSchema } = require('../src/security/schema');
const { hashPassword } = require('../src/security/access');
const schema = 'arena_roster_visual_' + process.pid + '_' + randomBytes(5).toString('hex');
if (!/^arena_roster_visual_\d+_[a-f0-9]{10}$/.test(schema)) throw new Error('Invalid test schema');
const options = { ...configurationPool.options, password: configurationPool.options.password };
const maintenance = new Pool({ ...options, max: 1 });
const pool = new Pool({ ...options, options: '-c search_path=' + schema, max: 6 });
const password = 'Arena-visual-2026!';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
let apiServer, vite, stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  process.stdin.pause();
  if (vite) await vite.close();
  if (apiServer) await new Promise(resolve => apiServer.close(resolve));
  await pool.end();
  await maintenance.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
  await maintenance.end(); await configurationPool.end();
}
async function main() {
  await maintenance.query('CREATE SCHEMA ' + schema);
  await pool.query(`
    CREATE TABLE usuarios_sistema (id SERIAL PRIMARY KEY,nombre VARCHAR(100) NOT NULL,email VARCHAR(150) UNIQUE NOT NULL,password_hash VARCHAR(255) NOT NULL,rol VARCHAR(50) NOT NULL,activo BOOLEAN DEFAULT true,created_at TIMESTAMP DEFAULT NOW());
    CREATE TABLE campeonatos (id_campeonato SERIAL PRIMARY KEY,nombre VARCHAR(100) NOT NULL,modalidad VARCHAR(50) NOT NULL,categoria VARCHAR(30),cantidad_canchas INTEGER,limite_equipos INTEGER NOT NULL,hora_inicio VARCHAR(10),duracion_partido_min INTEGER,descanso_entre_partidos_min INTEGER,activo BOOLEAN);
    CREATE TABLE auditoria_logs (id SERIAL PRIMARY KEY,usuario_id INTEGER REFERENCES usuarios_sistema(id),accion VARCHAR(100),detalles JSONB,ip_origen VARCHAR(45),created_at TIMESTAMP DEFAULT NOW());
  `);
  await ensureAccessSchema(pool);
  const hash = await hashPassword(password);
  for (const rol of ['admin','mesa','arbitro']) await pool.query('INSERT INTO usuarios_sistema(nombre,email,password_hash,rol) VALUES($1,$2,$3,$4)', ['Prueba '+rol,rol+'@visual.example.test',hash,rol]);
  apiServer = await new Promise(resolve => { const server = createApp(pool).listen(0,'127.0.0.1',()=>resolve(server)); });
  const apiUrl = 'http://127.0.0.1:' + apiServer.address().port;
  async function post(route,body,token) {
    const response = await fetch(apiUrl+'/api'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
    const data = await response.json();
    if (!response.ok) throw new Error(route+': '+JSON.stringify(data));
    return data;
  }
  const token = (await post('/auth/login',{email:'admin@visual.example.test',password})).token;
  const championship = await post('/campeonatos',{nombre:'Campeonato de prueba visual',modalidad:'Solamente ida',categoria:'Mixto',cantidad_canchas:2,limite_equipos:8,hora_inicio:'18:00',duracion_partido_min:40,descanso_entre_partidos_min:10,activo:true},token);
  const teams = [];
  const players = [];
  for (const [nombre,curso,delegado_nombre,delegado_telefono] of [['Halcones','6to A','Delegado de prueba A','70000001'],['Cóndores','6to B','Delegado de prueba B','70000002'],['Tigres del Norte','5to A','Delegado de prueba C','70000003']]) teams.push(await post('/campeonatos/'+championship.id_campeonato+'/equipos',{nombre,curso,delegado_nombre,delegado_telefono,escudo:null},token));
  for (const [nombre,apellido,dorsal,ci] of [['Lucas','Prueba',10,'QA10001'],['Mateo','Ejemplo',2,'QA10002'],['Alex','Demostración',7,'QA10003']]) players.push(await post('/equipos/'+teams[0].id+'/jugadores',{nombre,apellido,ci,dorsal,curso:'6to A',fecha_nacimiento:'2008-06-15',foto:PNG},token));
  await post('/equipos/'+teams[1].id+'/jugadores',{nombre:'Diego',apellido:'Prueba',ci:'QA10004',dorsal:9,curso:'6to B',fecha_nacimiento:'2007-04-10',foto:PNG},token);
  const frontend = path.resolve(__dirname,'../../frontend');
  const { createServer } = await import(pathToFileURL(path.join(frontend,'node_modules/vite/dist/node/index.js')).href);
  vite = await createServer({root:frontend,configFile:path.join(frontend,'vite.config.js'),server:{host:'127.0.0.1',port:5175,strictPort:true,proxy:{'/api':{target:apiUrl,changeOrigin:true}}}});
  await vite.listen();
  console.log(JSON.stringify({preview:'http://127.0.0.1:5175/login',championship:championship.id_campeonato,email:'admin@visual.example.test',password,schema}));
  console.log('Fixture visual aislada. Escribe cerrar para terminar y limpiar.');
  process.stdin.setEncoding('utf8');
  process.stdin.on('data',data=>{if(data.trim()==='cerrar') stop().catch(error=>{console.error(error.message);process.exitCode=1;});});
  process.stdin.once('end',()=>stop().catch(error=>{console.error(error.message);process.exitCode=1;}));
  process.stdin.resume();
}
process.on('SIGINT',()=>stop());
process.on('SIGTERM',()=>stop());
main().catch(async error=>{console.error(error.message);await stop();process.exitCode=1;});
