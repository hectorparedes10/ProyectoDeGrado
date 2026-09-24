async function ensureRosterSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS equipos (
      id SERIAL PRIMARY KEY,
      campeonato_id INTEGER,
      nombre VARCHAR(100) NOT NULL,
      categoria VARCHAR(20) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE equipos ADD COLUMN IF NOT EXISTS curso VARCHAR(80);
    ALTER TABLE equipos ADD COLUMN IF NOT EXISTS delegado_nombre VARCHAR(100);
    ALTER TABLE equipos ADD COLUMN IF NOT EXISTS delegado_telefono VARCHAR(30);
    ALTER TABLE equipos ADD COLUMN IF NOT EXISTS escudo TEXT;
    ALTER TABLE equipos ADD COLUMN IF NOT EXISTS eliminado_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS jugadores (
      id SERIAL PRIMARY KEY,
      equipo_id INTEGER REFERENCES equipos(id) ON DELETE CASCADE,
      nombre VARCHAR(100) NOT NULL,
      apellido VARCHAR(100) NOT NULL,
      ci VARCHAR(20) NOT NULL UNIQUE,
      dorsal INTEGER,
      foto_url VARCHAR(255),
      face_descriptor JSONB,
      suspendido BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE jugadores ADD COLUMN IF NOT EXISTS curso VARCHAR(80);
    ALTER TABLE jugadores ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE;
    ALTER TABLE jugadores ADD COLUMN IF NOT EXISTS foto TEXT;
    ALTER TABLE jugadores ADD COLUMN IF NOT EXISTS eliminado_at TIMESTAMPTZ;
    CREATE UNIQUE INDEX IF NOT EXISTS jugadores_ci_normalizado_idx ON jugadores(upper(btrim(ci)));

  `);
  // Archived registrations retain their history while releasing active names and shirt numbers.
  for (const name of ['equipos_campeonato_nombre_ci_idx', 'jugadores_equipo_dorsal_idx']) {
    const current = (await client.query('SELECT indexdef FROM pg_indexes WHERE schemaname=current_schema() AND indexname=$1', [name])).rows[0];
    if (current && !current.indexdef.includes('eliminado_at IS NULL')) await client.query('DROP INDEX "' + name + '"');
  }
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS equipos_campeonato_nombre_ci_idx ON equipos(campeonato_id,lower(btrim(nombre))) WHERE eliminado_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS jugadores_equipo_dorsal_idx ON jugadores(equipo_id,dorsal) WHERE dorsal IS NOT NULL AND eliminado_at IS NULL;
  `);
  // Retain unrelated constraints while extending the legacy category check.
  const { rows } = await client.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='equipos'::regclass AND contype='c'");
  for (const constraint of rows) {
    if (constraint.conname !== 'equipos_categoria_roster_check' && /categoria/.test(constraint.definition) && /varones/.test(constraint.definition) && /damas/.test(constraint.definition)) {
      await client.query('ALTER TABLE equipos DROP CONSTRAINT "' + constraint.conname.replace(/"/g, '""') + '"');
    }
  }
  if (!rows.some(constraint => constraint.conname === 'equipos_categoria_roster_check')) {
    await client.query("ALTER TABLE equipos ADD CONSTRAINT equipos_categoria_roster_check CHECK (categoria IN ('varones','damas','mixto'))");
  }
}

module.exports = { ensureRosterSchema };
