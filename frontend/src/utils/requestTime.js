const timeZone = 'America/La_Paz';
const dateFormatter = new Intl.DateTimeFormat('es-BO', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFormatter = new Intl.DateTimeFormat('es-BO', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
function format(value, formatter) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? formatter.format(date) : 'Sin registro';
}
export const requestDateLabel = value => format(value, dateFormatter);
export const requestTimeLabel = value => format(value, timeFormatter);