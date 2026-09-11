const express = require('express');
const router = express.Router();
const { getEquipos, getJugadoresPorEquipo, registrarJugador } = require('../controllers/equipos.controller');

router.get('/', getEquipos);
router.get('/:equipoId/jugadores', getJugadoresPorEquipo);
router.post('/jugadores', registrarJugador);

module.exports = router;
