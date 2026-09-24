const { randomBytes, scrypt: scryptCallback, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(scryptCallback);

const permissions = {
  admin: ['campeonatos:ver', 'campeonatos:crear', 'campeonatos:editar', 'campeonatos:eliminar', 'usuarios:gestionar', 'solicitudes:resolver', 'auditoria:ver', 'equipos:gestionar', 'equipos:eliminar', 'jugadores:gestionar', 'jugadores:eliminar', 'partidos:eliminar', 'partidos:registrar_jugadores', 'partidos:resultados', 'facial:verificar'],
  mesa: ['campeonatos:ver', 'campeonatos:editar', 'campeonatos:solicitar', 'equipos:gestionar', 'jugadores:gestionar', 'partidos:registrar_jugadores', 'partidos:resultados'],
  arbitro: ['campeonatos:ver', 'facial:verificar'],
};

function publicUser(row) {
  return { id: row.id, nombre: row.nombre, email: row.email, telefono: row.telefono ?? null, role: row.rol, rol: row.rol, activo: row.activo, requiresPasswordChange: Boolean(row.debe_cambiar_password || row.solo_cambio_password), permissions: row.debe_cambiar_password || row.solo_cambio_password ? [] : permissions[row.rol] || [] };
}
function digest(token) { return createHash('sha256').update(token).digest('hex'); }
function safeEqual(a, b) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return 'scrypt$' + salt + '$' + derived.toString('hex');
}
async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  if (!stored.startsWith('scrypt$')) return safeEqual(password, stored);
  const [, salt, hash] = stored.split('$');
  if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(hash || '')) return false;
  return safeEqual((await scrypt(password, salt, 64)).toString('hex'), hash);
}
function httpError(status, message) { return Object.assign(new Error(message), { status }); }
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
function requirePermission(permission) {
  return (req, res, next) => req.user?.permissions.includes(permission) ? next() : next(httpError(403, 'Tu rol no tiene permiso para realizar esta acción.'));
}
function authenticate(pool) {
  return asyncRoute(async (req, res, next) => {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '');
    if (!match) throw httpError(401, 'Inicia sesión para continuar.');
    const tokenHash = digest(match[1]);
    const { rows } = await pool.query(`SELECT u.*,s.solo_cambio_password FROM sesiones_usuario s JOIN usuarios_sistema u ON u.id=s.usuario_id WHERE s.token_hash=$1 AND s.expira_at>clock_timestamp() AND u.activo=true AND u.eliminado_at IS NULL AND (NOT s.solo_cambio_password OR u.debe_cambiar_password) AND (NOT u.debe_cambiar_password OR u.password_temporal_expira_at>clock_timestamp())`, [tokenHash]);
    if (!rows[0] || !permissions[rows[0].rol]) throw httpError(401, 'La sesión expiró o fue revocada. Vuelve a iniciar sesión.');
    req.user = publicUser(rows[0]); req.tokenHash = tokenHash;
    res.set('Cache-Control', 'no-store'); next();
  });
}
async function transaction(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize security-changing writes so revocation and approval have a clear order.
    await client.query('SELECT pg_advisory_xact_lock(91840621)');
    const result = await operation(client); await client.query('COMMIT'); return result;
  }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function audit(client, req, action, details) {
  const entry = { ...details, autor: { id: req.user.id, nombre: req.user.nombre, rol: req.user.role } };
  await client.query('INSERT INTO auditoria_logs (usuario_id,accion,detalles,ip_origen) VALUES ($1,$2,$3,$4)', [req.user.id, action, JSON.stringify(entry), req.ip]);
}

module.exports = { publicUser, permissions, hashPassword, verifyPassword, digest, httpError, asyncRoute, requirePermission, authenticate, transaction, audit };
