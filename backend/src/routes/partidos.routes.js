const express = require('express');
const router = express.Router();
const { generarFixture, getPartidosPorCampeonato } = require('../controllers/partidos.controller');

router.post('/generar-fixture', generarFixture);
router.get('/campeonato/:campeonato_id', getPartidosPorCampeonato);

module.exports = router;
