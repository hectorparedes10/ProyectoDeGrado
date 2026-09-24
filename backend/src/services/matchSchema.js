async function ensureMatchSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS partidos (
      id SERIAL PRIMARY KEY,
      campeonato_id INTEGER REFERENCES campeonatos(id_campeonato),
      fase VARCHAR(30) NOT NULL DEFAULT 'regular',
      categoria VARCHAR(20) NOT NULL,
      equipo_local_id INTEGER REFERENCES equipos(id),
      equipo_visitante_id INTEGER REFERENCES equipos(id),
      goles_local INTEGER DEFAULT 0,
      goles_visitante INTEGER DEFAULT 0,
      fecha_hora TIMESTAMP NOT NULL,
      cancha_numero INTEGER NOT NULL,
      estado VARCHAR(30) DEFAULT 'programado' CHECK (estado IN ('programado','en_curso','finalizado'))
    );
    ALTER TABLE partidos ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE partidos ADD COLUMN IF NOT EXISTS eliminado_at TIMESTAMPTZ;
    ALTER TABLE partidos ADD COLUMN IF NOT EXISTS jornada_numero INTEGER;
    ALTER TABLE partidos ADD COLUMN IF NOT EXISTS vuelta BOOLEAN NOT NULL DEFAULT false;
    CREATE TABLE IF NOT EXISTS fixture_campeonato (
      campeonato_id INTEGER PRIMARY KEY REFERENCES campeonatos(id_campeonato),
      datos JSONB NOT NULL,
      jornada_actual INTEGER NOT NULL DEFAULT 0,
      completado BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS jornadas_campeonato (
      campeonato_id INTEGER NOT NULL REFERENCES fixture_campeonato(campeonato_id),
      numero INTEGER NOT NULL,
      vuelta BOOLEAN NOT NULL DEFAULT false,
      descansa JSONB NOT NULL DEFAULT '[]',
      fecha_inicio TIMESTAMP NOT NULL,
      fecha_fin TIMESTAMP NOT NULL,
      PRIMARY KEY(campeonato_id,numero)
    );
    CREATE INDEX IF NOT EXISTS partidos_jornada_idx ON partidos(campeonato_id,jornada_numero);
    ALTER TABLE partidos DROP CONSTRAINT IF EXISTS partidos_categoria_check;
    ALTER TABLE partidos ADD CONSTRAINT partidos_categoria_check CHECK (categoria IN ('varones','damas','mixto'));
    CREATE TABLE IF NOT EXISTS estadisticas_partido_jugador (
      partido_id INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
      jugador_id INTEGER NOT NULL REFERENCES jugadores(id),
      equipo_id INTEGER NOT NULL REFERENCES equipos(id),
      goles INTEGER NOT NULL DEFAULT 0 CHECK (goles BETWEEN 0 AND 99),
      amarillas INTEGER NOT NULL DEFAULT 0 CHECK (amarillas BETWEEN 0 AND 2),
      rojas INTEGER NOT NULL DEFAULT 0 CHECK (rojas BETWEEN 0 AND 1),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (partido_id,jugador_id)
    );
    CREATE INDEX IF NOT EXISTS estadisticas_partido_jugador_jugador_idx ON estadisticas_partido_jugador(jugador_id);
    CREATE TABLE IF NOT EXISTS historial_participantes_partido (
      partido_id INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
      jugador_id INTEGER NOT NULL REFERENCES jugadores(id),
      PRIMARY KEY(partido_id,jugador_id)
    );
    INSERT INTO historial_participantes_partido(partido_id,jugador_id)
      SELECT partido_id,jugador_id FROM estadisticas_partido_jugador ON CONFLICT DO NOTHING;
    CREATE OR REPLACE VIEW estadisticas_jugador AS
      SELECT s.jugador_id,SUM(s.goles)::int AS goles,SUM(s.amarillas)::int AS amarillas,
        SUM(s.rojas)::int AS rojas,COUNT(*)::int AS partidos_jugados
      FROM estadisticas_partido_jugador s JOIN partidos p ON p.id=s.partido_id
      WHERE p.estado='finalizado' AND p.eliminado_at IS NULL GROUP BY s.jugador_id;
  `);
}
module.exports = { ensureMatchSchema };
