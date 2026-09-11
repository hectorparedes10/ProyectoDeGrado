const db = require('../../config/db');

class FixtureService {
  /**
   * Genera y guarda los partidos para un campeonato usando Round-Robin (Todos contra todos)
   */
  static async generarFixture(campeonatoId, fechaInicioJornada) {
    // 1. Obtener datos del campeonato
    const { rows: campRows } = await db.query(
      'SELECT * FROM campeonatos WHERE id = $1', 
      [campeonatoId]
    );
    
    if (campRows.length === 0) {
      throw new Error('El campeonato especificado no existe.');
    }
    const campeonato = campRows[0];

    // 2. Obtener equipos registrados en el campeonato
    const { rows: equipos } = await db.query(
      'SELECT id, categoria FROM equipos WHERE campeonato_id = $1', 
      [campeonatoId]
    );

    if (equipos.length < 2) {
      throw new Error('Se necesitan al menos 2 equipos para generar el fixture.');
    }

    // 3. Agrupar equipos por categoría (varones / damas)
    const categorias = [...new Set(equipos.map(e => e.categoria))];
    const partidosAInsertar = [];

    for (const cat of categorias) {
      const equiposCat = equipos.filter(e => e.categoria === cat);
      const enfrentamientos = this.generarEnfrentamientosRoundRobin(equiposCat);

      if (campeonato.modalidad === 'ida_vuelta') {
        // Duplicar los enfrentamientos invirtiendo localía
        const enfrentamientosVuelta = enfrentamientos.map(p => ({
          local: p.visitante,
          visitante: p.local,
          categoria: cat
        }));
        enfrentamientos.push(...enfrentamientosVuelta);
      }

      enfrentamientos.forEach(e => e.categoria = cat);
      partidosAInsertar.push(...enfrentamientos);
    }

    // 4. Asignar Fechas, Horarios y Canchas
    const partidosProgramados = this.asignarHorariosYCanchas(
      partidosAInsertar, 
      campeonato, 
      fechaInicioJornada
    );

    // 5. Insertar los partidos en la Base de Datos dentro de una transacción
    const client = await db.pool ? await db.pool.connect() : null; // Para manejo seguro de transacciones
    
    try {
      const insertPromises = partidosProgramados.map(p => {
        const query = `
          INSERT INTO partidos (
            campeonato_id, fase, categoria, equipo_local_id, equipo_visitante_id, fecha_hora, cancha_numero
          ) VALUES ($1, 'regular', $2, $3, $4, $5, $6)
          RETURNING *;
        `;
        return db.query(query, [
          campeonatoId,
          p.categoria,
          p.local,
          p.visitante,
          p.fecha_hora,
          p.cancha_numero
        ]);
      });

      const resultados = await Promise.all(insertPromises);
      return resultados.map(r => r.rows[0]);
    } catch (error) {
      throw new Error(`Error guardando fixture en base de datos: ${error.message}`);
    }
  }

  /**
   * Algoritmo Round Robin para generar enfrentamientos sin repetir
   */
  static generarEnfrentamientosRoundRobin(equipos) {
    const enfrentamientos = [];
    const n = equipos.length;
    
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        enfrentamientos.push({
          local: equipos[i].id,
          visitante: equipos[j].id
        });
      }
    }
    return enfrentamientos;
  }

  /**
   * Calcula los saltos de hora según duracion_partido_min + descanso_entre_partidos_min
   */
  static asignarHorariosYCanchas(partidos, campeonato, fechaInicio) {
    const { hora_inicio, duracion_partido_min, descanso_entre_partidos_min, cantidad_canchas } = campeonato;
    const intervaloMinutos = Number(duracion_partido_min) + Number(descanso_entre_partidos_min);
    
    // Construir la fecha/hora base de inicio
    let tiempoActual = new Date(`${fechaInicio}T${hora_inicio}`);
    let canchaActual = 1;

    return partidos.map(partido => {
      const partidoConHorario = {
        ...partido,
        fecha_hora: new Date(tiempoActual).toISOString(),
        cancha_numero: canchaActual
      };

      // Asignar canchas secuencialmente (Cancha 1, Cancha 2...)
      canchaActual++;
      if (canchaActual > cantidad_canchas) {
        canchaActual = 1; // Reiniciar a Cancha 1
        // Avanzar el reloj al siguiente turno
        tiempoActual = new Date(tiempoActual.getTime() + intervaloMinutos * 60000);
      }

      return partidoConHorario;
    });
  }
}

module.exports = FixtureService;