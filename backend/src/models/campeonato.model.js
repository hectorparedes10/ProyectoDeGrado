const db = require('../../config/db');

class CampeonatoModel {
  static async create({ nombre, modalidad, cantidad_canchas, hora_inicio, duracion_partido_min, descanso_entre_partidos_min }) {
    const query = `
      INSERT INTO campeonatos (
        nombre, modalidad, cantidad_canchas, 
        hora_inicio, duracion_partido_min, descanso_entre_partidos_min
      ) VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING *;
    `;
    const values = [
      nombre, 
      modalidad, 
      cantidad_canchas || 1, 
      hora_inicio, 
      duracion_partido_min, 
      descanso_entre_partidos_min
    ];
    
    const { rows } = await db.query(query, values);
    return rows[0];
  }

  static async getAll() {
    const query = 'SELECT * FROM campeonatos ORDER BY created_at DESC;';
    const { rows } = await db.query(query);
    return rows;
  }

  static async getById(id) {
    const query = 'SELECT * FROM campeonatos WHERE id = $1;';
    const { rows } = await db.query(query, [id]);
    return rows[0];
  }
}

module.exports = CampeonatoModel;