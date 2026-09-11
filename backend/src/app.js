const express = require('express');
const cors = require('cors');
const { randomBytes } = require('node:crypto');
const { publicUser, hashPassword, verifyPassword, digest, httpError, asyncRoute, requirePermission, authenticate, transaction, audit } = require('./security/access');
const validate = require('./security/validation');
const { registerPublicRecovery, registerPrivateRecovery, invalidateRecovery } = require('./security/passwordRecovery');
const { createChampionship, updateChampionship } = require('./services/championshipPersistence');

function createApp(pool) {
  const app = express();
  app.disable('x-powered-by');
  // Only the proxy running on this machine may supply client IP headers.
  app.set('trust proxy', 'loopback');
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const route = asyncRoute;
  const allow = requirePermission;
  const failedLogins = new Map();
  async function write(req, permission, operation, allowPasswordChange = false) {
    return transaction(pool, async client => {
      const { rows } = await client.query('SELECT u.*,s.solo_cambio_password FROM usuarios_sistema u JOIN sesiones_usuario s ON s.usuario_id=u.id WHERE s.token_hash=$1 AND s.expira_at>clock_timestamp() AND u.activo=true AND u.eliminado_at IS NULL AND (NOT s.solo_cambio_password OR u.debe_cambiar_password) AND (NOT u.debe_cambiar_password OR u.password_temporal_expira_at>clock_timestamp())', [req.tokenHash]);
      if (!rows[0]) throw httpError(401, 'La sesión fue revocada. Vuelve a iniciar sesión.');
      req.user = publicUser(rows[0]);
      if (req.user.requiresPasswordChange && !allowPasswordChange) throw httpError(403, 'Debes cambiar tu contraseña temporal para continuar.');
      if (permission && !req.user.permissions.includes(permission)) throw httpError(403, 'Tu rol no tiene permiso para realizar esta acción.');
      return operation(client);
    });
  }

  app.get('/api/health', route(async (req, res) => {
    await pool.query('SELECT 1'); res.json({ ok: true, accessControl: true });
  }));

  app.post('/api/auth/login', route(async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || email.length>150 || !password || password.length>128) throw httpError(400, 'Ingresa tu correo y contraseña.');
    const key = digest(req.ip + ':' + email.trim().toLowerCase());
    const now = Date.now();
    for (const [oldKey, entry] of failedLogins) if (entry.expires<now) failedLogins.delete(oldKey);
    if ((failedLogins.get(key)?.count || 0)>=10) throw httpError(429, 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.');
    const result = await transaction(pool, async client => {
      const { rows } = await client.query('SELECT * FROM usuarios_sistema WHERE lower(email)=lower($1) FOR UPDATE', [email.trim()]);
      const user = rows[0];
      if (!user || !user.activo || user.eliminado_at || (user.debe_cambiar_password && (!user.password_temporal_expira_at || user.password_temporal_expira_at.getTime()<=Date.now())) || !await verifyPassword(password, user.password_hash)) return null;
      if (!user.password_hash.startsWith('scrypt$')) await client.query('UPDATE usuarios_sistema SET password_hash=$1 WHERE id=$2', [await hashPassword(password), user.id]);
      const token = randomBytes(32).toString('base64url');
      await client.query('DELETE FROM sesiones_usuario WHERE expira_at<=NOW()');
      await client.query("INSERT INTO sesiones_usuario (token_hash,usuario_id,expira_at,solo_cambio_password) VALUES ($1,$2,clock_timestamp()+CASE WHEN $3 THEN INTERVAL '10 minutes' ELSE INTERVAL '12 hours' END,$3)", [digest(token), user.id, user.debe_cambiar_password]);
      return { success: true, token, user: publicUser(user) };
    });
    if (!result) {
      if (failedLogins.size>10000) failedLogins.clear();
      failedLogins.set(key, { count: (failedLogins.get(key)?.count || 0)+1, expires: now + 15*60*1000, accountHash: digest(email.trim().toLowerCase()) });
      throw httpError(401, 'Correo o contraseña incorrectos, o cuenta desactivada.');
    }
    failedLogins.delete(key); res.json(result);
  }));

  const clearLoginFailures = email => {
    const accountHash = digest(email.toLowerCase());
    for (const [key, entry] of failedLogins) if (entry.accountHash === accountHash) failedLogins.delete(key);
  };
  registerPublicRecovery(app, pool);
  app.use('/api', authenticate(pool));
  app.get('/api/auth/me', (req, res) => res.json({ user: req.user }));
  app.post('/api/auth/logout', route(async (req, res) => {
    await transaction(pool, client => client.query('DELETE FROM sesiones_usuario WHERE token_hash=$1', [req.tokenHash])); res.json({ success: true });
  }));
  registerPrivateRecovery(app, pool, write, clearLoginFailures);
  app.use('/api', (req, res, next) => req.user.requiresPasswordChange ? res.status(403).json({ error: 'Debes cambiar tu contraseña temporal para continuar.', code: 'PASSWORD_CHANGE_REQUIRED' }) : next());
  // No match-result or roster mutation is available to a referee, including future routes.
  app.use('/api/partidos', (req, res, next) => {
    if (req.user.role === 'arbitro' && !['GET','HEAD'].includes(req.method)) return next(httpError(403, 'El árbitro no puede modificar partidos ni resultados.'));
    next();
  });

  app.get('/api/usuarios', allow('usuarios:gestionar'), route(async (req, res) => {
    const { rows } = await pool.query('SELECT id,nombre,email,telefono,email_recuperacion,rol,activo,debe_cambiar_password,created_at FROM usuarios_sistema WHERE eliminado_at IS NULL ORDER BY id');
    res.json(rows.map(row => ({ ...publicUser(row), created_at: row.created_at })));
  }));
  app.post('/api/usuarios', allow('usuarios:gestionar'), route(async (req, res) => {
    const data = validate.user(req.body);
    const passwordHash = await hashPassword(data.password);
    const user = await write(req, 'usuarios:gestionar', async client => {
      const { rows } = await client.query('INSERT INTO usuarios_sistema (nombre,email,password_hash,rol,activo,telefono,email_recuperacion) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,nombre,email,rol,activo,telefono,email_recuperacion,debe_cambiar_password', [data.nombre,data.email,passwordHash,data.rol,data.activo,data.telefono,data.email_recuperacion]);
      await audit(client, req, 'usuario_creado', { usuario_id: rows[0].id, rol: data.rol }); return publicUser(rows[0]);
    });
    res.status(201).json(user);
  }));
  app.put('/api/usuarios/:id', allow('usuarios:gestionar'), route(async (req, res) => {
    const id = validate.id(req.params.id);
    if (!req.body || typeof req.body!=='object' || Array.isArray(req.body)) throw httpError(400, 'Completa los datos del usuario.');
    const user = await write(req, 'usuarios:gestionar', async client => {
      // Lock in a consistent order to preserve at least one active administrator.
      const { rows: users } = await client.query('SELECT id,nombre,email,telefono,email_recuperacion,rol,activo FROM usuarios_sistema WHERE eliminado_at IS NULL ORDER BY id FOR UPDATE');
      const actor = users.find(item => item.id===req.user.id);
      if (!actor?.activo || actor.rol!=='admin') throw httpError(403, 'Ya no tienes permiso para administrar usuarios.');
      const existing = users.find(item => item.id===id);
      if (!existing) throw httpError(404, 'El usuario no existe.');
      const data = validate.user({ ...existing, ...req.body }, true);
      const passwordHash = data.password ? await hashPassword(data.password) : null;
      if (id===req.user.id && (!data.activo || data.rol!=='admin')) throw httpError(409, 'No puedes desactivar tu propia cuenta ni retirarte el rol administrador.');
      if (existing.rol==='admin' && existing.activo && (!data.activo || data.rol!=='admin') && users.filter(item => item.activo && item.rol==='admin').length<=1) throw httpError(409, 'Debe quedar al menos un administrador activo.');
      const { rows } = await client.query('UPDATE usuarios_sistema SET nombre=$1,email=$2,rol=$3,activo=$4,password_hash=COALESCE($5,password_hash),telefono=$7,email_recuperacion=$8 WHERE id=$6 RETURNING id,nombre,email,rol,activo,telefono,email_recuperacion,debe_cambiar_password', [data.nombre,data.email,data.rol,data.activo,passwordHash,id,data.telefono,data.email_recuperacion]);
      if (passwordHash || existing.rol!==data.rol || existing.activo!==data.activo) await client.query('DELETE FROM sesiones_usuario WHERE usuario_id=$1', [id]);
      if (passwordHash || existing.email!==data.email || existing.email_recuperacion!==data.email_recuperacion || existing.rol!==data.rol || existing.activo!==data.activo) {
        await invalidateRecovery(client, id);
        if (passwordHash) { await client.query('UPDATE usuarios_sistema SET debe_cambiar_password=false,password_temporal_expira_at=NULL WHERE id=$1', [id]); rows[0].debe_cambiar_password = false; }
        else await client.query('UPDATE usuarios_sistema SET password_temporal_expira_at=clock_timestamp() WHERE id=$1 AND debe_cambiar_password=true', [id]);
      }
      await audit(client, req, 'usuario_actualizado', { usuario_id: id, rol: data.rol, activo: data.activo, cambio_password: Boolean(passwordHash) });
      return publicUser(rows[0]);
    });
    res.json(user);
  }));

  async function changeAccount(req, deleting) {
    const id = validate.id(req.params.id);
    if (!deleting && typeof req.body?.activo!=='boolean') throw httpError(400, 'Indica el nuevo estado del usuario.');
    return write(req, 'usuarios:gestionar', async client => {
      const { rows: users } = await client.query('SELECT id,nombre,rol,activo FROM usuarios_sistema WHERE eliminado_at IS NULL ORDER BY id FOR UPDATE');
      const actor = users.find(item => item.id===req.user.id);
      if (!actor?.activo || actor.rol!=='admin') throw httpError(403, 'Ya no tienes permiso para administrar usuarios.');
      const target = users.find(item => item.id===id);
      if (!target) throw httpError(404, 'El usuario no existe.');
      const active = deleting ? false : req.body.activo;
      if (id===req.user.id && !active) throw httpError(409, 'No puedes desactivar ni eliminar tu propia cuenta.');
      if (target.rol==='admin' && target.activo && !active && users.filter(item => item.rol==='admin' && item.activo).length<=1) throw httpError(409, 'Debe quedar al menos un administrador activo.');
      const { rows } = await client.query('UPDATE usuarios_sistema SET activo=$1,eliminado_at=CASE WHEN $2 THEN NOW() ELSE eliminado_at END WHERE id=$3 RETURNING id,nombre,email,rol,activo,telefono,email_recuperacion,debe_cambiar_password', [active,deleting,id]);
      if (!active) {
        await client.query('DELETE FROM sesiones_usuario WHERE usuario_id=$1', [id]);
        await invalidateRecovery(client, id);
        await client.query('UPDATE usuarios_sistema SET password_temporal_expira_at=clock_timestamp() WHERE id=$1 AND debe_cambiar_password=true', [id]);
      }
      await audit(client, req, deleting ? 'usuario_eliminado' : 'usuario_estado_actualizado', { usuario_id: id, nombre: target.nombre, activo: active });
      return publicUser(rows[0]);
    });
  }
  app.patch('/api/usuarios/:id/estado', allow('usuarios:gestionar'), route(async (req, res) => res.json(await changeAccount(req, false))));
  app.delete('/api/usuarios/:id', allow('usuarios:gestionar'), route(async (req, res) => {
    await changeAccount(req, true); res.json({ success: true, message: 'Usuario eliminado. Su historial de acciones se conserva.' });
  }));

  app.get('/api/campeonatos', allow('campeonatos:ver'), route(async (req, res) => {
    res.json((await pool.query('SELECT * FROM campeonatos ORDER BY id_campeonato DESC')).rows);
  }));
  app.get('/api/campeonatos/:id', allow('campeonatos:ver'), route(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM campeonatos WHERE id_campeonato=$1', [validate.id(req.params.id)]);
    if (!rows[0]) throw httpError(404, 'El campeonato no existe.'); res.json(rows[0]);
  }));
  app.post('/api/campeonatos', allow('campeonatos:crear'), route(async (req, res) => {
    const data = validate.championship(req.body);
    const championship = await write(req, 'campeonatos:crear', async client => {
      const row = await createChampionship(client, data); await audit(client, req, 'campeonato_creado', { campeonato_id: row.id_campeonato }); return row;
    });
    res.status(201).json(championship);
  }));
  app.put('/api/campeonatos/:id', allow('campeonatos:editar'), route(async (req, res) => {
    const id = validate.id(req.params.id);
    const campeonato = await write(req, 'campeonatos:editar', async client => {
      const { rows } = await client.query('SELECT * FROM campeonatos WHERE id_campeonato=$1 FOR UPDATE', [id]);
      if (!rows[0]) throw httpError(404, 'El campeonato no existe.');
      const data = validate.championship({ ...rows[0], ...req.body });
      const updated = await updateChampionship(client, id, data);
      const cambios = Object.fromEntries(Object.keys(data).filter(key => data[key]!==rows[0][key]).map(key => [key, { antes: rows[0][key], despues: data[key] }]));
      await audit(client, req, 'campeonato_actualizado', { campeonato_id: id, campeonato_nombre: updated.nombre, cambios }); return updated;
    });
    res.json({ message: 'Campeonato actualizado correctamente', campeonato });
  }));
  app.delete('/api/campeonatos/:id', allow('campeonatos:eliminar'), route(async (req, res) => {
    const id = validate.id(req.params.id);
    await write(req, 'campeonatos:eliminar', async client => {
      const { rows } = await client.query('SELECT id_campeonato FROM campeonatos WHERE id_campeonato=$1 FOR UPDATE', [id]);
      if (!rows[0]) throw httpError(404, 'El campeonato no existe.');
      const linked = await client.query(`SELECT EXISTS(SELECT 1 FROM equipos WHERE campeonato_id=$1 UNION ALL SELECT 1 FROM partidos WHERE campeonato_id=$1 UNION ALL SELECT 1 FROM tabla_posiciones WHERE campeonato_id=$1 UNION ALL SELECT 1 FROM tarifas_campeonato WHERE campeonato_id=$1 UNION ALL SELECT 1 FROM transacciones_financieras WHERE campeonato_id=$1 UNION ALL SELECT 1 FROM turnos_campeonato WHERE campeonato_id=$1) AS found`, [id]);
      if (linked.rows[0].found) throw httpError(409, 'Este campeonato tiene registros asociados. Desactívalo para conservar su historial.');
      await client.query('DELETE FROM campeonatos WHERE id_campeonato=$1', [id]); await audit(client, req, 'campeonato_eliminado', { campeonato_id: id });
    });
    res.json({ message: 'Campeonato eliminado' });
  }));

  app.get('/api/solicitudes-campeonato', route(async (req, res) => {
    if (!['admin','mesa'].includes(req.user.role)) throw httpError(403, 'Tu rol no puede consultar solicitudes.');
    const { rows } = await pool.query(`SELECT s.*,u.nombre AS solicitante_nombre,u.email AS solicitante_email,u.activo AS solicitante_activo,u.rol AS solicitante_rol,a.nombre AS resuelta_por_nombre FROM solicitudes_campeonato s JOIN usuarios_sistema u ON u.id=s.solicitante_id LEFT JOIN usuarios_sistema a ON a.id=s.resuelta_por WHERE ($1='admin' OR s.solicitante_id=$2) ORDER BY (s.estado='pendiente') DESC,s.created_at DESC`, [req.user.role, req.user.id]);
    res.json(rows);
  }));

  app.get('/api/auditoria/campeonatos', allow('auditoria:ver'), route(async (req, res) => {
    const championshipId = req.query.campeonato_id ? validate.id(req.query.campeonato_id) : null;
    const before = req.query.antes ? validate.id(req.query.antes) : null;
    const { rows } = await pool.query(`SELECT a.id,a.created_at,a.detalles,COALESCE(a.detalles#>>'{autor,nombre}',u.nombre,'Usuario no disponible') AS usuario_nombre,COALESCE(a.detalles#>>'{autor,rol}',u.rol) AS usuario_rol FROM auditoria_logs a LEFT JOIN usuarios_sistema u ON u.id=a.usuario_id WHERE a.accion='campeonato_actualizado' AND ($1::text IS NULL OR a.detalles->>'campeonato_id'=$1::text) AND ($2::int IS NULL OR a.id<$2) ORDER BY a.id DESC LIMIT 51`, [championshipId,before]);
    res.json({ items: rows.slice(0,50), nextCursor: rows.length>50 ? rows[49].id : null });
  }));
  app.post('/api/solicitudes-campeonato', allow('campeonatos:solicitar'), route(async (req, res) => {
    const data = validate.championship(req.body?.datos);
    const motivo = validate.text(req.body?.motivo ?? '', 'El motivo', 500, false);
    const request = await write(req, 'campeonatos:solicitar', async client => {
      const { rows } = await client.query('INSERT INTO solicitudes_campeonato (solicitante_id,datos,motivo) VALUES ($1,$2,$3) RETURNING *', [req.user.id, JSON.stringify(data), motivo]);
      await audit(client, req, 'campeonato_solicitado', { solicitud_id: rows[0].id }); return rows[0];
    });
    res.status(201).json(request);
  }));
  app.patch('/api/solicitudes-campeonato/:id', allow('solicitudes:resolver'), route(async (req, res) => {
    const id = validate.id(req.params.id);
    const { decision } = req.body || {};
    if (!['aprobar','rechazar'].includes(decision)) throw httpError(400, 'Selecciona aprobar o rechazar.');
    const respuesta = validate.text(req.body.respuesta ?? '', 'La respuesta', 500, false);
    const result = await write(req, 'solicitudes:resolver', async client => {
      const { rows } = await client.query('SELECT * FROM solicitudes_campeonato WHERE id=$1 FOR UPDATE', [id]);
      const request = rows[0];
      if (!request) throw httpError(404, 'La solicitud no existe.');
      if (request.estado!=='pendiente') throw httpError(409, 'Esta solicitud ya fue resuelta.');
      let campeonato = null;
      if (decision==='aprobar') {
        const requester = (await client.query('SELECT rol,activo FROM usuarios_sistema WHERE id=$1 AND eliminado_at IS NULL FOR SHARE', [request.solicitante_id])).rows[0];
        if (!requester?.activo || requester.rol!=='mesa') throw httpError(409, 'El solicitante ya no es un usuario mesa activo. Puedes rechazar la solicitud.');
        campeonato = await createChampionship(client, validate.championship(request.datos));
      }
      const estado = decision==='aprobar' ? 'aprobada' : 'rechazada';
      const updated = await client.query('UPDATE solicitudes_campeonato SET estado=$1,respuesta=$2,resuelta_por=$3,resuelta_at=NOW(),campeonato_id=$4 WHERE id=$5 RETURNING *', [estado,respuesta,req.user.id,campeonato?.id_campeonato ?? null,id]);
      await audit(client, req, 'solicitud_' + estado, { solicitud_id: id, solicitante_id: request.solicitante_id, campeonato_id: campeonato?.id_campeonato ?? null });
      return { solicitud: updated.rows[0], campeonato };
    });
    res.json(result);
  }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Esta función todavía no está disponible.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.code==='23505') return res.status(409).json({ error: error.constraint==='solicitudes_campeonato_pendiente_idx' ? 'Ya tienes una solicitud pendiente. Espera la respuesta del administrador.' : 'Ya existe un usuario con ese correo electrónico.' });
    if (error.type==='entity.parse.failed') return res.status(400).json({ error: 'Los datos enviados no tienen un formato válido.' });
    if (error.status && error.status<500) return res.status(error.status).json({ error: error.message });
    console.error('Error de API:', error.code || error.name);
    res.status(500).json({ error: 'No pudimos completar la operación. Inténtalo de nuevo.' });
  });
  return app;
}
module.exports = { createApp };
