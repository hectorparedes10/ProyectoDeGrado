const { pool } = require('./config/db');
const { createApp } = require('./src/app');
const { ensureAccessSchema } = require('./src/security/schema');

async function start() {
  await ensureAccessSchema(pool);
  const app = createApp(pool);
  const port = Number(process.env.PORT || 5000);
  const server = app.listen(port, '127.0.0.1', () => console.log('ARENA FUTSAL SYSTEM: servidor listo en el puerto ' + port));
  server.on('error', async error => { console.error('No se pudo iniciar el servidor:', error.code); await pool.end(); process.exitCode = 1; });
}
start().catch(async error => {
  console.error('No se pudo preparar el acceso a la base de datos:', error.code || error.message);
  await pool.end();
  process.exitCode = 1;
});
