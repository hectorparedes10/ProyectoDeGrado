'use strict';

// Timestamps are local wall-clock values. UTC arithmetic keeps the host timezone
// and daylight-saving changes from shifting the championship's Bolivian schedule.
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };

function integer(value, label, minimum = 0) {
  if (!['string', 'number'].includes(typeof value) || !/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum) fail(label + ' no es válido.');
  return Number(value);
}
function teamId(value) { return integer(value, 'El equipo', 1); }
function clock(value, label) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(value)) fail(label + ' no es válida.');
  return (Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))) * MINUTE;
}
function timestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) fail(label + ' no es válida.');
  const parsed = Date.parse(value + ':00Z');
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 16) !== value || Number(value.slice(0, 4)) < 1900) fail(label + ' no es válida.');
  return parsed;
}
function localTimestamp(value) {
  const result = new Date(value).toISOString();
  if (result.length !== 24) fail('La programación supera el rango de fechas disponible.');
  return result.slice(0, 16);
}
function day(value) { return Math.floor(value / DAY) * DAY; }
function shareTeam(a, b) { return a.local === b.local || a.local === b.visitante || a.visitante === b.local || a.visitante === b.visitante; }

function roundRobin(teamIds, modalidad = 'Solamente ida') {
  if (!Array.isArray(teamIds) || teamIds.length < 2 || teamIds.length > 256) fail('Se necesitan entre 2 y 256 equipos para generar las fechas.');
  if (!['Solamente ida', 'Ida y vuelta'].includes(modalidad)) fail('La modalidad del campeonato no es válida.');
  const teams = teamIds.map(teamId).sort((a, b) => a - b);
  if (new Set(teams).size !== teams.length) fail('Un equipo no puede estar repetido en el campeonato.');
  const positions = new Map(teams.map((team, index) => [team, index]));
  const rotation = teams.length % 2 ? [...teams, null] : [...teams];
  const rounds = [];
  for (let index = 0; index < rotation.length - 1; index++) {
    const partidos = [];
    const descansa = [];
    for (let pair = 0; pair < rotation.length / 2; pair++) {
      let local = rotation[pair];
      let visitante = rotation[rotation.length - 1 - pair];
      if (local === null || visitante === null) {
        descansa.push(local ?? visitante);
        continue;
      }
      // Orient the complete graph cyclically to balance home and away games.
      const distance = (positions.get(visitante) - positions.get(local) + teams.length) % teams.length;
      if (distance > teams.length / 2 || (distance === teams.length / 2 && local > visitante)) [local, visitante] = [visitante, local];
      partidos.push({ local, visitante });
    }
    rounds.push({ numero: index + 1, vuelta: false, descansa, partidos });
    rotation.splice(1, 0, rotation.pop());
  }
  if (modalidad === 'Ida y vuelta') {
    const firstLeg = [...rounds];
    for (const round of firstLeg) rounds.push({
      numero: rounds.length + 1,
      vuelta: true,
      descansa: [...round.descansa],
      partidos: round.partidos.map(({ local, visitante }) => ({ local: visitante, visitante: local })),
    });
  }
  return rounds;
}

function scheduleRound(round, options = {}) {
  if (!round || !Array.isArray(round.partidos) || !round.partidos.length || round.partidos.length > 128) fail('La fecha no contiene una cantidad válida de partidos.');
  const remaining = round.partidos.map((match, index) => ({ local: teamId(match?.local), visitante: teamId(match?.visitante), index }));
  const participants = remaining.flatMap(match => [match.local, match.visitante]);
  if (new Set(participants).size !== participants.length) fail('Cada equipo puede jugar una sola vez en cada fecha.');
  const startClock = clock(options.hora_inicio, 'La hora de inicio');
  const endClock = clock(options.hora_fin, 'La hora límite');
  const duration = integer(options.duracion_partido_min, 'La duración', 1) * MINUTE;
  const rest = integer(options.descanso_entre_partidos_min ?? 0, 'El descanso') * MINUTE;
  const courts = integer(options.cantidad_canchas, 'La cantidad de canchas', 1);
  if (endClock <= startClock || duration > endClock - startClock) fail('La hora límite debe permitir completar al menos un partido después de la hora de inicio.');
  if (!Number.isSafeInteger(rest)) fail('El descanso no es válido.');
  const baseDate = timestamp(String(options.fecha_inicio) + 'T00:00', 'La fecha de inicio');
  let floor = baseDate + startClock;
  if (options.minStart !== undefined && options.minStart !== null) floor = Math.max(floor, timestamp(options.minStart, 'La fecha mínima'));
  if (options.previousMatches !== undefined && !Array.isArray(options.previousMatches)) fail('El historial de partidos no es válido.');
  const previous = (options.previousMatches ?? []).map((match, index) => {
    const local = teamId(match?.local);
    const visitante = teamId(match?.visitante);
    const court = integer(match?.cancha_numero, 'La cancha', 1);
    if (local === visitante || court > courts) fail('El historial de partidos contiene un encuentro no válido.');
    return { local, visitante, court, start: timestamp(match?.fecha_hora, 'La fecha del partido'), index };
  }).sort((a, b) => a.start - b.start || a.index - b.index);
  if (previous.length) {
    const latest = previous[previous.length - 1];
    floor = Math.max(floor, latest.start + duration + rest);
    if (options.oneRoundPerDay) floor = Math.max(floor, day(latest.start) + DAY + startClock);
  }
  const align = value => {
    if (!Number.isSafeInteger(value) || !Number.isFinite(new Date(value).getTime())) fail('La programación supera el rango de fechas disponible.');
    let result = Math.max(value, day(value) + startClock);
    if (result + duration > day(result) + endClock) result = day(result) + DAY + startClock;
    localTimestamp(result + duration);
    return result;
  };
  const scheduled = [];
  if (courts === 1) {
    let cursor = align(floor);
    let last = previous.length ? previous[previous.length - 1] : null;
    while (remaining.length) {
      cursor = align(cursor);
      const selected = options.avoidConsecutive === false || !last || day(last.start) !== day(cursor)
        ? 0 : remaining.findIndex(match => !shareTeam(match, last));
      if (selected === -1) {
        // A gap on an empty court is not another match: rest until the next day.
        cursor = day(cursor) + DAY + startClock;
        continue;
      }
      const match = remaining.splice(selected, 1)[0];
      scheduled.push({ local: match.local, visitante: match.visitante, start: cursor, court: 1 });
      last = { ...match, start: cursor };
      cursor += duration + rest;
    }
  } else {
    const courtFree = new Map();
    const teamFree = new Map();
    const lastCourt = new Map();
    for (const match of previous) {
      courtFree.set(match.court, Math.max(courtFree.get(match.court) ?? -Infinity, match.start + duration + rest));
      for (const team of [match.local, match.visitante]) {
        teamFree.set(team, match.start + duration + rest);
        lastCourt.set(team, match.court);
      }
    }
    // A round needs no more simultaneous courts than it has games. Include
    // preferred rotations separately, even when only one game needs scheduling.
    const candidateCourts = new Set(Array.from({ length: Math.min(courts, remaining.length) }, (_, i) => i + 1));
    const preferred = new Map();
    for (const team of participants) {
      if (!lastCourt.has(team)) continue;
      const nextCourt = lastCourt.get(team) % courts + 1;
      preferred.set(team, nextCourt);
      candidateCourts.add(nextCourt);
    }
    while (remaining.length) {
      let best = null;
      for (let index = 0; index < remaining.length; index++) {
        const match = remaining[index];
        for (const court of candidateCourts) {
          const start = align(Math.max(floor, courtFree.get(court) ?? -Infinity, teamFree.get(match.local) ?? -Infinity, teamFree.get(match.visitante) ?? -Infinity));
          const rotation = Number(preferred.get(match.local) === court) + Number(preferred.get(match.visitante) === court);
          if (!best || start < best.start || (start === best.start && (rotation > best.rotation || (rotation === best.rotation && (court < best.court || (court === best.court && index < best.index)))))) best = { index, start, court, rotation };
        }
      }
      const match = remaining.splice(best.index, 1)[0];
      scheduled.push({ local: match.local, visitante: match.visitante, start: best.start, court: best.court });
      courtFree.set(best.court, best.start + duration + rest);
      teamFree.set(match.local, best.start + duration + rest);
      teamFree.set(match.visitante, best.start + duration + rest);
    }
  }
  scheduled.sort((a, b) => a.start - b.start || a.court - b.court);
  return {
    partidos: scheduled.map(match => ({ local: match.local, visitante: match.visitante, fecha_hora: localTimestamp(match.start), cancha_numero: match.court })),
    fecha_inicio: localTimestamp(scheduled[0].start),
    fecha_fin: localTimestamp(Math.max(...scheduled.map(match => match.start + duration))),
  };
}

module.exports = { roundRobin, scheduleRound };
