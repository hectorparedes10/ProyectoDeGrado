import api from './api';

export const loginService = async (username, password) => {
  const response = await api.post('/auth/login', { 
    correo: username,
    email: username,
    usuario: username,
    username: username,
    login: username,
    contrasena: password,
    password: password
  });
  return response.data;
};

export const logoutService = () => {
  localStorage.clear();
};
