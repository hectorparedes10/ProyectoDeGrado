const db = require('../config/db');

// Obtener todos los campeonatos
const getCampeonatos = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM campeonatos ORDER BY id DESC;');
    res.json({ ok: true, data: rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

// Crear nuevo campeonato adaptado a las columnas de tu BD
const crearCampeonato = async (req, res) => {
  try {
    const { 
      nombre, 
      modalidad, 
      cantidad_canchas, 
      hora_inicio, 
      duracion_partido_min, 
      descanso_entre_partidos_min 
    } = req.body;

    if (!nombre) {
      return res.status(400).json({ ok: false, error: 'El nombre del campeonato es obligatorio.' });
    }

    const query = `
      INSERT INTO campeonatos (
        nombre, modalidad, cantidad_canchas, activo, 
        hora_inicio, duracion_partido_min, descanso_entre_partidos_min
      ) 
      VALUES ($1, $2, $3, true, $4, $5, $6) 
      RETURNING *;
    `;

    const values = [
      nombre,
      modalidad || 'Ida Simple',
      cantidad_canchas || 1,
      hora_inicio || '13:00',
      duracion_partido_min || 40,
      descanso_entre_partidos_min || 0
    ];

    const { rows } = await db.query(query, values);
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (error) {
    console.error('Error al crear campeonato:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

module.exports = {
  getCampeonatos,
  crearCampeonato
};
