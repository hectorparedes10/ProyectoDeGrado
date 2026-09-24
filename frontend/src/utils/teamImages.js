const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' });
export function boliviaTodayISO(now = new Date()) {
  const parts = Object.fromEntries(dateParts.formatToParts(now).map(part => [part.type, part.value]));
  return parts.year + '-' + parts.month + '-' + parts.day;
}
export function ageFromBirthDate(value, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(value + 'T12:00:00.000Z');
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  const today = boliviaTodayISO(now);
  if (value > today) return null;
  return Number(today.slice(0, 4)) - year - (today.slice(5) < value.slice(5) ? 1 : 0);
}
export function initialsForTeam(name) {
  return String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('es') || 'AF';
}
export const playerName = player => player.nombre_completo || [player.nombre, player.apellido].filter(Boolean).join(' ');
export function sortPlayers(players) {
  const number = value => value === null || value === undefined || value === '' ? Infinity : Number(value);
  return [...players].sort((a, b) => (number(a.dorsal) - number(b.dorsal) || playerName(a).localeCompare(playerName(b), 'es', { sensitivity: 'base' }) || a.id - b.id));
}
function ensureActive(signal) {
  if (signal?.aborted) throw new DOMException('Carga cancelada.', 'AbortError');
}
function blobAsDataURL(blob, signal) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const finish = callback => event => { signal?.removeEventListener('abort', abort); callback(event); };
    reader.onload = finish(() => resolve(reader.result));
    reader.onerror = finish(() => reject(new Error('No pudimos leer la imagen.')));
    reader.onabort = finish(() => reject(new DOMException('Carga cancelada.', 'AbortError')));
    if (signal?.aborted) { signal.removeEventListener('abort', abort); reject(new DOMException('Carga cancelada.', 'AbortError')); return; }
    reader.readAsDataURL(blob);
  });
}
export async function prepareTeamImage(file, { maxDimension = 512, signal } = {}) {
  ensureActive(signal);
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Selecciona una imagen PNG, JPG o WebP.');
  if (!file.size || file.size > 8 * 1024 * 1024) throw new Error('La imagen debe pesar como máximo 8 MB.');
  const source = URL.createObjectURL(file);
  const picture = new Image();
  try {
    await new Promise((resolve, reject) => {
      const abort = () => { picture.src = ''; reject(new DOMException('Carga cancelada.', 'AbortError')); };
      const finish = callback => () => { signal?.removeEventListener('abort', abort); callback(); };
      picture.onload = finish(resolve);
      picture.onerror = finish(() => reject(new Error('No pudimos abrir esta imagen. Selecciona otro archivo.')));
      signal?.addEventListener('abort', abort, { once: true });
      picture.src = source;
      if (signal?.aborted) abort();
    });
    ensureActive(signal);
    const { naturalWidth: width, naturalHeight: height } = picture;
    if (!width || !height || width * height > 40000000) throw new Error('La imagen es demasiado grande. Utiliza una de hasta 40 megapíxeles.');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Tu navegador no pudo preparar la imagen.');
    let scale = Math.min(1, maxDimension / Math.max(width, height));
    const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    for (let attempt = 0; attempt < 6; attempt++) {
      ensureActive(signal);
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      if (mime === 'image/jpeg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); }
      context.drawImage(picture, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, Math.max(.62, .88 - attempt * .06)));
      ensureActive(signal);
      if (blob && blob.size <= 1024 * 1024) return await blobAsDataURL(blob, signal);
      scale *= .75;
    }
    throw new Error('No pudimos reducir la imagen. Selecciona una de menor tamaño.');
  } finally {
    picture.onload = null; picture.onerror = null;
    URL.revokeObjectURL(source);
  }
}