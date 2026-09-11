const express = require('express');
const router = express.Router();
const { getCampeonatos, crearCampeonato } = require('../controllers/campeonatos.controller');

router.get('/', getCampeonatos);
router.post('/', crearCampeonato);

module.exports = router;
