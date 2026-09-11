import axios from 'axios';

const API_URL = 'http://localhost:3000/api/campeonatos';

export const crearCampeonatoService = async (datos) => {
  const response = await axios.post(API_URL, datos);
  return response.data;
};

export const obtenerCampeonatosService = async () => {
  const response = await axios.get(API_URL);
  return response.data;
};
