import axios from 'axios';

const API_URL = 'http://localhost:3000/api/partidos';

export const generarFixtureService = async (datos) => {
  const res = await axios.post(`${API_URL}/generar-fixture`, datos);
  return res.data;
};

export const obtenerPartidosPorCampeonato = async (campeonatoId) => {
  const res = await axios.get(`${API_URL}/campeonato/${campeonatoId}`);
  return res.data;
};
