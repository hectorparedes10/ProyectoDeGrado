const { httpError } = require('./access');
const { text } = require('./validation');

const MAX_IMAGE_BYTES = 1024 * 1024;
const teamFields = ['nombre', 'curso', 'delegado_nombre', 'delegado_telefono', 'escudo'];
const playerFields = ['nombre', 'apellido', 'ci', 'curso', 'fecha_nacimiento', 'dorsal', 'foto'];

function object(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw httpError(400, 'Completa los datos del formulario.');
  return data;
}

function image(value, label) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw httpError(400, label + ' debe ser una imagen PNG, JPEG o WebP.');
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw httpError(400, label + ' debe ser una imagen PNG, JPEG o WebP en formato válido.');
  const encoded = match[2];
  if (encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw httpError(413, label + ' debe pesar como máximo 1 MiB.');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) throw httpError(413, label + ' debe pesar como máximo 1 MiB.');
  if (bytes.toString('base64') !== encoded) throw httpError(400, label + ' tiene una codificación inválida.');
  const valid = match[1] === 'png' ? validPng(bytes)
    : match[1] === 'jpeg' ? bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217
      : validWebp(bytes);
  if (!valid) throw httpError(400, label + ' no coincide con el formato de imagen indicado.');
  return value;
}

// Check bounded container structure before accepting a stored data URI.
function validPng(bytes) {
  if (bytes.length < 57 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return false;
  let offset = 8;
  let hasPixels = false;
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset);
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    if (size > bytes.length - offset - 12) return false;
    if (offset === 8) {
      if (kind !== 'IHDR' || size !== 13) return false;
      const width = bytes.readUInt32BE(offset + 8);
      const height = bytes.readUInt32BE(offset + 12);
      if (!width || !height || width * height > 40000000) return false;
    } else if (kind === 'IHDR') return false;
    if (kind === 'IDAT' && size > 0) hasPixels = true;
    offset += size + 12;
    if (kind === 'IEND') return size === 0 && hasPixels && offset === bytes.length;
  }
  return false;
}

function validWebp(bytes) {
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) !== bytes.length - 8) return false;
  let offset = 12;
  let hasPixels = false;
  while (offset + 8 <= bytes.length) {
    const kind = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const padded = size + (size % 2);
    if (padded > bytes.length - offset - 8) return false;
    if (offset === 12 && !['VP8 ', 'VP8L', 'VP8X'].includes(kind)) return false;
    if ((kind === 'VP8 ' && size >= 10) || (kind === 'VP8L' && size >= 5) || (kind === 'ANMF' && size >= 16)) hasPixels = true;
    if (kind === 'VP8X' && size !== 10) return false;
    offset += 8 + padded;
  }
  return hasPixels && offset === bytes.length;
}

function todayBolivia(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = key => parts.find(item => item.type === key).value;
  return part('year') + '-' + part('month') + '-' + part('day');
}

function birthDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) throw httpError(400, 'La fecha de nacimiento no es válida.');
  const date = new Date(value + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value > todayBolivia()) throw httpError(400, 'La fecha de nacimiento debe ser real y no puede estar en el futuro.');
  return value;
}

function age(value, today = todayBolivia()) {
  if (!value) return null;
  return Number(today.slice(0, 4)) - Number(value.slice(0, 4)) - (today.slice(5) < value.slice(5) ? 1 : 0);
}

function team(body, existing = {}) {
  const data = { ...existing, ...object(body) };
  const phone = text(data.delegado_telefono, 'El teléfono del delegado', 30);
  if (!/^\+?[\d\s()-]+$/.test(phone) || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15) throw httpError(400, 'El teléfono del delegado debe contener entre 7 y 15 dígitos.');
  return {
    nombre: text(data.nombre, 'El nombre del equipo', 100),
    curso: text(data.curso, 'El curso', 80),
    delegado_nombre: text(data.delegado_nombre, 'El nombre del delegado', 100),
    delegado_telefono: phone,
    escudo: image(data.escudo, 'El escudo'),
  };
}

function player(body, existing = {}) {
  const data = { ...existing, ...object(body) };
  const rawDorsal = data.dorsal;
  if (!['number', 'string'].includes(typeof rawDorsal) || !/^\d{1,2}$/.test(String(rawDorsal).trim()) || !Number.isInteger(Number(rawDorsal)) || Number(rawDorsal) < 0 || Number(rawDorsal) > 99) throw httpError(400, 'El dorsal es obligatorio y debe ser un número entero entre 0 y 99.');
  const dorsal = Number(rawDorsal);
  const foto = image(data.foto, 'La fotografía');
  if (!foto) throw httpError(400, 'La fotografía del jugador es obligatoria.');
  return {
    nombre: text(data.nombre, 'El nombre', 100),
    apellido: text(data.apellido, 'El apellido', 100),
    ci: text(text(data.ci, 'El CI', 20).toUpperCase(), 'El CI', 20),
    curso: text(data.curso, 'El curso', 80),
    fecha_nacimiento: birthDate(data.fecha_nacimiento),
    dorsal,
    foto,
  };
}

module.exports = { team, player, image, age, todayBolivia, teamFields, playerFields, MAX_IMAGE_BYTES };
