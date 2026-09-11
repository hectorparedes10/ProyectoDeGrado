const { randomBytes } = require('node:crypto');
const { asyncRoute, transaction, digest, hashPassword, httpError, audit, publicUser, requirePermission } = require('./access');
const validate = require('./validation');
const TEMPORARY_PASSWORD = '12345678';
const REQUEST_MESSAGE = 'Si la cuenta está activa, el administrador recibirá tu solicitud. Cuando la apruebe, inicia sesión con la contraseña temporal 12345678 para crear tu nueva contraseña.';

async function rateLimit(pool, entries) {
  const allowed = await transaction(pool, async client => {
    await client.query('DELETE FROM limites_recuperacion WHERE expira_at<=clock_timestamp()');
    for (const [key, limit] of entries) {
      const { rows } = await client.query(`INSERT INTO limites_recuperacion (clave_hash,intentos,expira_at) VALUES ($1,1,clock_timestamp()+INTERVAL '15 minutes') ON CONFLICT (clave_hash) DO UPDATE SET intentos=LEAST(limites_recuperacion.intentos+1,100000) RETURNING intentos`, [digest(key)]);
      if (rows[0].intentos > limit) return false;
    }
    return true;
  });
  if (!allowed) throw httpError(429, 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.');
}

async function invalidateRecovery(client, id) {
  await client.query('DELETE FROM recuperaciones_password WHERE usuario_id=$1', [id]);
  await client.query(`UPDATE solicitudes_recuperacion SET estado='cancelada',respuesta='La cuenta fue actualizada. Solicita nuevamente la recuperación si todavía la necesitas.',resuelta_at=clock_timestamp() WHERE usuario_id=$1 AND estado='pendiente'`, [id]);
}

function registerPublicRecovery(app, pool) {
  app.post('/api/auth/forgot-password', asyncRoute(async (req, res) => {
    const email = validate.text(req.body?.usuario ?? req.body?.email, 'El usuario (correo de acceso)', 150).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'Ingresa el correo con el que inicias sesión.');
    await rateLimit(pool, [['solicitar:ip:' + req.ip, 20], ['solicitar:cuenta:' + email, 3]]);
    await transaction(pool, async client => {
      const { rows } = await client.query('SELECT id,email FROM usuarios_sistema WHERE lower(email)=$1 AND activo=true AND eliminado_at IS NULL FOR UPDATE', [email]);
      if (!rows[0]) return;
      await client.query(`INSERT INTO solicitudes_recuperacion (usuario_id,email_usuario) VALUES ($1,$2) ON CONFLICT (usuario_id) WHERE estado='pendiente' DO NOTHING`, [rows[0].id, rows[0].email]);
    });
    res.status(202).json({ message: REQUEST_MESSAGE });
  }));
  // Old email links cannot bypass the administrator's approval.
  app.post('/api/auth/reset-password', (req, res) => res.status(410).json({ error: 'La recuperación ahora requiere aprobación del administrador. Envía una solicitud desde el login.' }));
}

function registerPrivateRecovery(app, pool, write, clearLoginFailures) {
  app.post('/api/auth/change-password', asyncRoute(async (req, res) => {
    await rateLimit(pool, [['cambiar:cuenta:' + req.user.id, 20]]);
    const { password, confirmPassword } = req.body || {};
    validate.password(password);
    if (password !== confirmPassword) throw httpError(400, 'Las contraseñas no coinciden.');
    if (password === TEMPORARY_PASSWORD) throw httpError(400, 'Elige una contraseña distinta de la temporal 12345678.');
    const result = await write(req, null, async client => {
      if (!req.user.requiresPasswordChange) throw httpError(409, 'Tu cuenta no tiene un cambio de contraseña pendiente.');
      const { rows } = await client.query('UPDATE usuarios_sistema SET password_hash=$1,debe_cambiar_password=false,password_temporal_expira_at=NULL WHERE id=$2 RETURNING *', [await hashPassword(password), req.user.id]);
      await client.query('DELETE FROM sesiones_usuario WHERE usuario_id=$1', [req.user.id]);
      await invalidateRecovery(client, req.user.id);
      const token = randomBytes(32).toString('base64url');
      await client.query(`INSERT INTO sesiones_usuario (token_hash,usuario_id,expira_at,solo_cambio_password) VALUES ($1,$2,clock_timestamp()+INTERVAL '12 hours',false)`, [digest(token), req.user.id]);
      await audit(client, req, 'password_cambiado_por_titular', { usuario_id: req.user.id });
      return { success: true, token, user: publicUser(rows[0]) };
    }, true);
    clearLoginFailures(result.user.email);
    res.json(result);
  }));

  app.get('/api/solicitudes-recuperacion', requirePermission('solicitudes:resolver'), asyncRoute(async (req, res) => {
    const { rows } = await pool.query(`SELECT r.*,u.nombre AS solicitante_nombre,u.rol AS solicitante_rol,u.activo AS solicitante_activo,u.eliminado_at IS NOT NULL AS solicitante_eliminado,a.nombre AS resuelta_por_nombre FROM solicitudes_recuperacion r JOIN usuarios_sistema u ON u.id=r.usuario_id LEFT JOIN usuarios_sistema a ON a.id=r.resuelta_por ORDER BY (r.estado='pendiente') DESC,r.created_at DESC,r.id DESC`);
    res.json(rows);
  }));
  app.patch('/api/solicitudes-recuperacion/:id', requirePermission('solicitudes:resolver'), asyncRoute(async (req, res) => {
    const id = validate.id(req.params.id);
    const { decision } = req.body || {};
    if (!['aprobar', 'rechazar'].includes(decision)) throw httpError(400, 'Selecciona aprobar o rechazar.');
    const respuesta = validate.text(req.body?.respuesta ?? '', 'La respuesta', 500, false);
    const result = await write(req, 'solicitudes:resolver', async client => {
      const { rows } = await client.query('SELECT * FROM solicitudes_recuperacion WHERE id=$1 FOR UPDATE', [id]);
      const request = rows[0];
      if (!request) throw httpError(404, 'La solicitud no existe.');
      if (request.estado !== 'pendiente') throw httpError(409, 'Esta solicitud ya fue resuelta.');
      const user = (await client.query('SELECT * FROM usuarios_sistema WHERE id=$1 FOR UPDATE', [request.usuario_id])).rows[0];
      if (decision === 'aprobar') {
        if (!user?.activo || user.eliminado_at || user.email !== request.email_usuario) throw httpError(409, 'La cuenta cambió o está inactiva. Rechaza esta solicitud.');
        if (user.id === req.user.id) throw httpError(409, 'Tu recuperación debe aprobarla otro administrador.');
        await client.query(`UPDATE usuarios_sistema SET password_hash=$1,debe_cambiar_password=true,password_temporal_expira_at=clock_timestamp()+INTERVAL '24 hours' WHERE id=$2`, [await hashPassword(TEMPORARY_PASSWORD), user.id]);
        await client.query('DELETE FROM sesiones_usuario WHERE usuario_id=$1', [user.id]);
        await client.query('DELETE FROM recuperaciones_password WHERE usuario_id=$1', [user.id]);
      }
      const estado = decision === 'aprobar' ? 'aprobada' : 'rechazada';
      const updated = (await client.query('UPDATE solicitudes_recuperacion SET estado=$1,respuesta=$2,resuelta_por=$3,resuelta_at=clock_timestamp() WHERE id=$4 RETURNING *', [estado, respuesta, req.user.id, id])).rows[0];
      await audit(client, req, 'recuperacion_' + estado, { solicitud_id: id, usuario_id: request.usuario_id });
      return { solicitud: updated, email: user.email };
    });
    if (decision === 'aprobar') clearLoginFailures(result.email);
    res.json({ solicitud: result.solicitud, message: decision === 'aprobar' ? 'Recuperación aprobada. El usuario debe iniciar sesión con 12345678 y crear una nueva contraseña. La clave temporal vence en 24 horas.' : 'Solicitud de recuperación rechazada.' });
  }));
}
module.exports = { registerPublicRecovery, registerPrivateRecovery, invalidateRecovery };
