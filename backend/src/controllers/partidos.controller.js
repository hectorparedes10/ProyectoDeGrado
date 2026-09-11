const db = require('../config/db');

// Generar Fixture Automático (Todos contra todos - Round Robin)
const generarFixture = async (req, res) => {
  try {
    const { campeonato_id, fecha_inicio } = req.body;

    if (!campeonato_id || !fecha_inicio) {
      return res.status(400).json({ ok: false, error: 'campeonato_id y fecha_inicio son obligatorios.' });
    }

    // 1. Obtener la configuración del campeonato
    const campRes = await db.query('SELECT * FROM campeonatos WHERE id = $1;', [campeonato_id]);
    if (campRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Campeonato no encontrado.' });
    }
    const campeonato = campRes.rows[0];

    // 2. Obtener los equipos del campeonato
    const equiposRes = await db.query('SELECT id, nombre FROM equipos WHERE campeonato_id = $1;', [campeonato_id]);
    const equipos = equiposRes.rows;

    if (equipos.length < 2) {
      return res.status(400).json({ ok: false, error: 'Se necesitan al menos 2 equipos para generar el fixture.' });
    }

    // Algoritmo Round-Robin para emparejamientos
    let listaEquipos = [...equipos];
    if (listaEquipos.length % 2 !== 0) {
      listaEquipos.push({ id: null, nombre: 'DESCANSA' }); // Bye/Descanso si son impares
    }

    const totalEquipos = listaEquipos.length;
    const totalFechas = totalEquipos - 1;
    const partidosPorFecha = totalEquipos / 2;

    const duracionBloque = (campeonato.duracion_partido_min || 40) + (campeonato.descanso_entre_partidos_min || 10);
    const canchasTotales = campeonato.cantidad_canchas || 1;

    let fechaActual = new Date(fecha_inicio);
    const partidosCreados = [];

    for (let f = 0; f < totalFechas; f++) {
      const numeroFase = `Fecha ${f + 1}`;
      let horaActualMs = new Date(`${fecha_inicio}T${campeonato.hora_inicio || '13:00'}:00`).getTime();
      let canchaActual = 1;

      for (let p = 0; p < partidosPorFecha; p++) {
        const local = listaEquipos[p];
        const visitante = listaEquipos[totalEquipos - 1 - p];

        if (local.id && visitante.id) {
          const fechaHoraPartida = new Date(horaActualMs).toISOString();

          const queryInsert = `
            INSERT INTO partidos (campeonato_id, fase, categoria, equipo_local_id, equipo_visitante_id, fecha_hora, cancha_numero, estado)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *;
          `;
          const values = [
            campeonato_id,
            numeroFase,
            'Libre',
            local.id,
            visitante.id,
            fechaHoraPartida,
            canchaActual,
            'programado'
          ];

          const insertRes = await db.query(queryInsert, values);
          partidosCreados.push(insertRes.rows[0]);

          // Rotación de canchas y horarios
          canchaActual++;
          if (canchaActual > canchasTotales) {
            canchaActual = 1;
            horaActualMs += duracionBloque * 60 * 1000; // Sumar minutos en ms
          }
        }
      }

      // Rotación de equipos para la siguiente jornada
      listaEquipos.splice(1, 0, listaEquipos.pop());
      // Avanzar 7 días para la siguiente jornada/fecha
      fechaActual.setDate(fechaActual.getDate() + 7);
    }

    res.status(201).json({
      ok: true,
      mensaje: `Se generaron ${partidosCreados.length} partidos exitosamente.`,
      data: partidosCreados
    });

  } catch (error) {
    console.error('Error al generar fixture:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

// Obtener partidos de un campeonato
const getPartidosPorCampeonato = async (req, res) => {
  try {
    const { campeonato_id } = req.params;
    const query = `
      SELECT 
        p.*,
        el.nombre AS equipo_local,
        ev.nombre AS equipo_visitante
      FROM partidos p
      JOIN equipos el ON p.equipo_local_id = el.id
      JOIN equipos ev ON p.equipo_visitante_id = ev.id
      WHERE p.campeonato_id = $1
      ORDER BY p.fecha_hora ASC;
    `;
    const { rows } = await db.query(query, [campeonato_id]);
    res.json({ ok: true, data: rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

module.exports = {
  generarFixture,
  getPartidosPorCampeonato
};
