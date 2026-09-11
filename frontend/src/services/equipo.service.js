import axios from 'axios';

const API_URL = 'http://localhost:3000/api/equipos';

export const obtenerEquipos = async () => {
  const res = await axios.get(API_URL);
  return res.data;
};

export const crearEquipo = async (datos) => {
  const res = await axios.post(API_URL, datos);
  return res.data;
};

export const obtenerJugadoresPorEquipo = async (equipoId) => {
  const res = await axios.get(`${API_URL}/${equipoId}/jugadores`);
  return res.data;
};

export const registrarJugador = async (datosJugador) => {
  const res = await axios.post(`${API_URL}/jugadores`, datosJugador);
  return res.data;
};
