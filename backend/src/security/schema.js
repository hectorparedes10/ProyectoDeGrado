async function ensureAccessSchema(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE usuarios_sistema ADD COLUMN IF NOT EXISTS telefono VARCHAR(30);
      ALTER TABLE usuarios_sistema ADD COLUMN IF NOT EXISTS email_recuperacion VARCHAR(150);
      ALTER TABLE usuarios_sistema ADD COLUMN IF NOT EXISTS eliminado_at TIMESTAMPTZ;
      ALTER TABLE usuarios_sistema ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE usuarios_sistema ADD COLUMN IF NOT EXISTS password_temporal_expira_at TIMESTAMPTZ;
      CREATE UNIQUE INDEX IF NOT EXISTS usuarios_sistema_email_ci_idx ON usuarios_sistema(lower(email));
      CREATE TABLE IF NOT EXISTS sesiones_usuario (
        token_hash VARCHAR(64) PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios_sistema(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expira_at TIMESTAMPTZ NOT NULL
      );
      ALTER TABLE sesiones_usuario ADD COLUMN IF NOT EXISTS solo_cambio_password BOOLEAN NOT NULL DEFAULT false;
      CREATE INDEX IF NOT EXISTS sesiones_usuario_usuario_idx ON sesiones_usuario(usuario_id);
      CREATE TABLE IF NOT EXISTS recuperaciones_password (
        token_hash VARCHAR(64) PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios_sistema(id) ON DELETE CASCADE,
        email_recuperacion VARCHAR(150) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expira_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS recuperaciones_password_usuario_idx ON recuperaciones_password(usuario_id);
      CREATE TABLE IF NOT EXISTS limites_recuperacion (
        clave_hash VARCHAR(64) PRIMARY KEY,
        intentos INTEGER NOT NULL,
        expira_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS limites_recuperacion_expira_idx ON limites_recuperacion(expira_at);
      CREATE TABLE IF NOT EXISTS solicitudes_recuperacion (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios_sistema(id),
        email_usuario VARCHAR(150) NOT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada','cancelada')),
        respuesta VARCHAR(500) NOT NULL DEFAULT '',
        resuelta_por INTEGER REFERENCES usuarios_sistema(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resuelta_at TIMESTAMPTZ
      );
      CREATE UNIQUE INDEX IF NOT EXISTS solicitudes_recuperacion_pendiente_idx ON solicitudes_recuperacion(usuario_id) WHERE estado='pendiente';
      CREATE TABLE IF NOT EXISTS solicitudes_campeonato (
        id SERIAL PRIMARY KEY,
        solicitante_id INTEGER NOT NULL REFERENCES usuarios_sistema(id),
        datos JSONB NOT NULL,
        motivo VARCHAR(500) NOT NULL DEFAULT '',
        estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada')),
        respuesta VARCHAR(500) NOT NULL DEFAULT '',
        resuelta_por INTEGER REFERENCES usuarios_sistema(id),
        campeonato_id INTEGER REFERENCES campeonatos(id_campeonato) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resuelta_at TIMESTAMPTZ
      );
      CREATE UNIQUE INDEX IF NOT EXISTS solicitudes_campeonato_pendiente_idx ON solicitudes_campeonato(solicitante_id) WHERE estado='pendiente';
    `);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
module.exports = { ensureAccessSchema };
