import API from './api';

export const crearCampeonato = async (datosCampeonato) => {
  const response = await API.post('/campeonatos', datosCampeonato);
  return response.data;
};

export const obtenerCampeonatos = async () => {
  const response = await API.get('/campeonatos');
  return response.data;
};
