const db = require('../config/db');

// Obtener equipos con el nombre de su campeonato
const getEquipos = async (req, res) => {
  try {
    const query = `
      SELECT e.*, c.nombre as campeonato_nombre 
      FROM equipos e
      LEFT JOIN campeonatos c ON e.campeonato_id = c.id
      ORDER BY e.id DESC;
    `;
    const { rows } = await db.query(query);
    res.json({ ok: true, data: rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

// Obtener jugadores de un equipo específico
const getJugadoresPorEquipo = async (req, res) => {
  try {
    const { equipoId } = req.params;
    const { rows } = await db.query('SELECT * FROM jugadores WHERE equipo_id = $1 ORDER BY dorsal ASC;', [equipoId]);
    res.json({ ok: true, data: rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

// Registrar un nuevo jugador
const registrarJugador = async (req, res) => {
  try {
    const { equipo_id, nombre, apellido, dni, dorsal, foto_url } = req.body;

    if (!equipo_id || !nombre || !apellido || !dni) {
      return res.status(400).json({ ok: false, error: 'Equipo, nombre, apellido y DNI son obligatorios.' });
    }

    const query = `
      INSERT INTO jugadores (equipo_id, nombre, apellido, dni, dorsal, foto_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const values = [equipo_id, nombre, apellido, dni, dorsal || null, foto_url || null];
    const { rows } = await db.query(query, values);

    res.status(201).json({ ok: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

module.exports = {
  getEquipos,
  getJugadoresPorEquipo,
  registrarJugador
};
