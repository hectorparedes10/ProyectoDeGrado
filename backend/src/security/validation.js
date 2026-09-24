const { httpError } = require('./access');

function text(value, label, max, required = true) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw httpError(400, label + ' no es válido.');
  return value.trim();
}
function id(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw httpError(400, 'El identificador no es válido.');
  return Number(value);
}
function password(value) {
  if (typeof value !== 'string' || value.length<8 || value.length>128) throw httpError(400, 'La contraseña debe tener entre 8 y 128 caracteres.');
  return value;
}
function integer(value, label, min) {
  if (!['number','string'].includes(typeof value) || String(value).trim() === '' || !Number.isInteger(Number(value)) || Number(value)<min || Number(value)>2147483647) throw httpError(400, label + ' debe ser un número entero mayor o igual a ' + min + '.');
  return Number(value);
}
function championship(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw httpError(400, 'Completa los datos del campeonato.');
  const result = {
    nombre: text(data.nombre, 'El nombre', 100),
    modalidad: text(data.modalidad ?? 'Ida y vuelta', 'La modalidad', 50),
    categoria: text(data.categoria ?? 'Varones', 'La categoría', 30),
    cantidad_canchas: integer(data.cantidad_canchas ?? 1, 'Las canchas', 1),
    limite_equipos: integer(data.limite_equipos, 'El límite de equipos', 2),
    hora_inicio: data.hora_inicio ?? '18:00',
    duracion_partido_min: integer(data.duracion_partido_min ?? 40, 'La duración', 1),
    descanso_entre_partidos_min: integer(data.descanso_entre_partidos_min ?? 10, 'El descanso', 0),
    activo: data.activo ?? true,
  };
  if (!['Solamente ida','Ida y vuelta'].includes(result.modalidad) || !['Varones','Damas','Mixto'].includes(result.categoria)) throw httpError(400, 'Selecciona una modalidad y categoría válidas.');
  if (typeof result.hora_inicio !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(result.hora_inicio)) throw httpError(400, 'La hora de inicio no es válida.');
  if (typeof result.activo !== 'boolean') throw httpError(400, 'El estado activo debe ser verdadero o falso.');
  return result;
}
function user(data, editing = false) {
  if (!data || typeof data!=='object' || Array.isArray(data)) throw httpError(400, 'Completa los datos del usuario.');
  const result = { nombre: text(data.nombre, 'El nombre', 100), email: text(data.email, 'El correo', 150).toLowerCase(), rol: data.rol, activo: data.activo ?? true };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw httpError(400, 'El correo electrónico no es válido.');
  if (!['admin','mesa','arbitro'].includes(result.rol) || typeof result.activo !== 'boolean') throw httpError(400, 'Selecciona un rol y estado válidos.');
  result.telefono = text(data.telefono ?? '', 'El teléfono', 30, false) || null;
  if (result.telefono && (!/^\+?[\d\s()-]+$/.test(result.telefono) || result.telefono.replace(/\D/g,'').length<7 || result.telefono.replace(/\D/g,'').length>15)) throw httpError(400, 'El teléfono debe contener entre 7 y 15 dígitos; puedes incluir el código de país.');
  if (!editing || data.password) {
    result.password = password(data.password);
  }
  return result;
}
module.exports = { text, id, championship, user, password };
