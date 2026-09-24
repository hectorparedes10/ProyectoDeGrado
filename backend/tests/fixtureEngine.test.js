'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { roundRobin, scheduleRound } = require('../src/services/fixtureEngine');

const settings = (extra = {}) => ({ hora_inicio: '18:00', hora_fin: '22:00', duracion_partido_min: 40, descanso_entre_partidos_min: 10, cantidad_canchas: 1, fecha_inicio: '2026-09-15', ...extra });
const time = value => Date.parse(value + ':00Z');
const pairKey = match => [match.local, match.visitante].sort((a, b) => a - b).join('-');
const sameTeam = (a, b) => [a.local, a.visitante].some(team => team === b.local || team === b.visitante);
const status400 = fn => assert.throws(fn, error => error.status === 400);

function assertValidSchedule(matches, options) {
  const duration = options.duracion_partido_min * 60000;
  const rest = options.descanso_entre_partidos_min * 60000;
  for (const match of matches) {
    assert.ok(match.cancha_numero >= 1 && match.cancha_numero <= options.cantidad_canchas);
    assert.ok(match.fecha_hora.slice(11) >= options.hora_inicio);
    const end = new Date(time(match.fecha_hora) + duration).toISOString().slice(0, 16);
    assert.equal(end.slice(0, 10), match.fecha_hora.slice(0, 10));
    assert.ok(end.slice(11) <= options.hora_fin);
  }
  for (let first = 0; first < matches.length; first++) {
    for (let second = first + 1; second < matches.length; second++) {
      const a = matches[first], b = matches[second];
      if (a.cancha_numero !== b.cancha_numero && !sameTeam(a, b)) continue;
      assert.ok(time(a.fecha_hora) + duration + rest <= time(b.fecha_hora) || time(b.fecha_hora) + duration + rest <= time(a.fecha_hora), 'Partidos superpuestos o sin descanso configurado');
    }
  }
}

test('Todos contra todos cubre cada pareja exactamente una vez y cada equipo una vez por fecha', () => {
  for (let count = 2; count <= 33; count++) {
    const ids = Array.from({ length: count }, (_, i) => i * 3 + 1);
    const rounds = roundRobin(ids, 'Solamente ida');
    assert.equal(rounds.length, count % 2 ? count : count - 1);
    assert.equal(rounds.flatMap(round => round.partidos).length, count * (count - 1) / 2);
    assert.equal(new Set(rounds.flatMap(round => round.partidos.map(pairKey))).size, count * (count - 1) / 2);
    for (const [index, round] of rounds.entries()) {
      assert.equal(round.numero, index + 1);
      assert.equal(round.vuelta, false);
      assert.equal(round.descansa.length, count % 2);
      const teams = round.partidos.flatMap(match => [match.local, match.visitante]).concat(round.descansa);
      assert.deepEqual(teams.sort((a, b) => a - b), ids);
    }
    if (count % 2) assert.deepEqual(rounds.flatMap(round => round.descansa).sort((a, b) => a - b), ids);
  }
});

test('Ida y vuelta invierte local y visitante y conserva descansos', () => {
  for (const count of [2, 3, 4, 9, 16]) {
    const rounds = roundRobin(Array.from({ length: count }, (_, i) => i + 1), 'Ida y vuelta');
    const half = rounds.length / 2;
    for (let index = 0; index < half; index++) {
      const first = rounds[index], second = rounds[index + half];
      assert.equal(second.numero, index + half + 1);
      assert.equal(second.vuelta, true);
      assert.deepEqual(second.descansa, first.descansa);
      assert.deepEqual(second.partidos, first.partidos.map(match => ({ local: match.visitante, visitante: match.local })));
    }
  }
});

test('El calendario es determinista sin depender del orden de entrada ni mutarlo', () => {
  const input = [8, 2, 17, 5, 4];
  const copy = [...input];
  assert.deepEqual(roundRobin(input), roundRobin([...input].reverse()));
  assert.deepEqual(input, copy);
  const round = roundRobin(input)[0];
  const untouched = JSON.stringify(round);
  assert.deepEqual(scheduleRound(round, settings()), scheduleRound(round, settings()));
  assert.equal(JSON.stringify(round), untouched);
});

test('Los partidos terminan antes de la hora límite y continúan al día siguiente', () => {
  const options = settings({ hora_fin: '20:00', duracion_partido_min: 60, descanso_entre_partidos_min: 0 });
  const result = scheduleRound(roundRobin([1, 2, 3, 4, 5, 6])[0], options);
  assert.deepEqual(result.partidos.map(match => match.fecha_hora), ['2026-09-15T18:00', '2026-09-15T19:00', '2026-09-16T18:00']);
  assert.equal(result.fecha_inicio, '2026-09-15T18:00');
  assert.equal(result.fecha_fin, '2026-09-16T19:00');
  assertValidSchedule(result.partidos, options);
});

test('El descanso se suma entre partidos y el último no necesita acabar su descanso antes del cierre', () => {
  const options = settings({ hora_fin: '19:50', duracion_partido_min: 50 });
  const result = scheduleRound(roundRobin([1, 2, 3, 4])[0], options);
  assert.deepEqual(result.partidos.map(match => match.fecha_hora), ['2026-09-15T18:00', '2026-09-15T19:00']);
  assert.equal(result.fecha_fin, '2026-09-15T19:50');
});

test('Una cancha ordena un cruce independiente antes de repetir un equipo de la fecha anterior', () => {
  const options = settings({ previousMatches: [{ local: 1, visitante: 2, fecha_hora: '2026-09-15T18:00', cancha_numero: 1 }] });
  const result = scheduleRound({ partidos: [{ local: 1, visitante: 3 }, { local: 2, visitante: 4 }, { local: 5, visitante: 6 }] }, options);
  assert.equal(pairKey(result.partidos[0]), '5-6');
  assert.equal(result.fecha_inicio, '2026-09-15T18:50');
  const all = options.previousMatches.concat(result.partidos);
  for (let index = 1; index < all.length; index++) assert.equal(sameTeam(all[index - 1], all[index]), false);
  assertValidSchedule(all, options);
});

test('Una cancha pasa al día siguiente cuando todos los cruces repetirían equipo, aun con una pausa larga', () => {
  for (const partidos of [[{ local: 2, visitante: 1 }], [{ local: 1, visitante: 3 }], [{ local: 1, visitante: 3 }, { local: 2, visitante: 4 }]]) {
    const result = scheduleRound({ partidos }, settings({ minStart: '2026-09-15T21:00', previousMatches: [{ local: 1, visitante: 2, fecha_hora: '2026-09-15T18:00', cancha_numero: 1 }] }));
    assert.equal(result.fecha_inicio, '2026-09-16T18:00');
  }
});

test('Dos canchas permiten jugar la siguiente fecha ese mismo día y rotan la cancha', () => {
  const options = settings({ cantidad_canchas: 2, previousMatches: [{ local: 1, visitante: 2, fecha_hora: '2026-09-15T18:00', cancha_numero: 1 }] });
  const next = scheduleRound({ partidos: [{ local: 2, visitante: 1 }] }, options);
  assert.deepEqual(next.partidos, [{ local: 2, visitante: 1, fecha_hora: '2026-09-15T18:50', cancha_numero: 2 }]);
  const following = scheduleRound({ partidos: [{ local: 1, visitante: 2 }] }, { ...options, previousMatches: options.previousMatches.concat(next.partidos) });
  assert.equal(following.partidos[0].cancha_numero, 1);
  assert.equal(following.partidos[0].fecha_hora, '2026-09-15T19:40');
  assertValidSchedule(options.previousMatches.concat(next.partidos, following.partidos), options);
});

test('Con varias canchas asigna juegos simultáneos sin sobreponer equipos ni canchas', () => {
  const options = settings({ cantidad_canchas: 2, hora_fin: '19:30' });
  const result = scheduleRound(roundRobin([1, 2, 3, 4, 5, 6, 7, 8])[0], options);
  assert.deepEqual(result.partidos.map(match => [match.fecha_hora, match.cancha_numero]), [['2026-09-15T18:00', 1], ['2026-09-15T18:00', 2], ['2026-09-15T18:50', 1], ['2026-09-15T18:50', 2]]);
  assertValidSchedule(result.partidos, options);
});

test('Varias canchas no retrasan un cruce para conseguir su cancha preferida', () => {
  const options = settings({ cantidad_canchas: 2, previousMatches: [
    { local: 1, visitante: 2, fecha_hora: '2026-09-15T18:00', cancha_numero: 1 },
    { local: 3, visitante: 4, fecha_hora: '2026-09-15T17:00', cancha_numero: 1 },
  ] });
  const result = scheduleRound({ partidos: [{ local: 1, visitante: 3 }, { local: 2, visitante: 4 }] }, options);
  assert.equal(result.partidos[0].fecha_hora, '2026-09-15T18:50');
  assert.equal(result.partidos[1].fecha_hora, '2026-09-15T18:50');
  assert.deepEqual(new Set(result.partidos.map(match => match.cancha_numero)), new Set([1, 2]));
});

test('Respeta el mínimo temporal, el inicio diario y los cambios de mes y año', () => {
  const round = { partidos: [{ local: 1, visitante: 2 }] };
  assert.equal(scheduleRound(round, settings({ minStart: '2026-09-15T17:00' })).fecha_inicio, '2026-09-15T18:00');
  assert.equal(scheduleRound(round, settings({ minStart: '2026-09-15T21:21' })).fecha_inicio, '2026-09-16T18:00');
  assert.equal(scheduleRound(round, settings({ fecha_inicio: '2026-12-31', minStart: '2026-12-31T23:59' })).fecha_inicio, '2027-01-01T18:00');
  assert.equal(scheduleRound(round, settings({ fecha_inicio: '2028-02-28', minStart: '2028-02-28T23:59' })).fecha_inicio, '2028-02-29T18:00');
});

test('La opción de una fecha por día avanza después del último día previo', () => {
  const result = scheduleRound({ partidos: [{ local: 3, visitante: 4 }] }, settings({ oneRoundPerDay: true, previousMatches: [{ local: 1, visitante: 2, fecha_hora: '2026-09-16T18:00', cancha_numero: 1 }] }));
  assert.equal(result.fecha_inicio, '2026-09-17T18:00');
});

test('Los horarios son independientes de la zona horaria del proceso', () => {
  const before = process.env.TZ;
  try {
    process.env.TZ = 'Pacific/Auckland';
    const first = scheduleRound(roundRobin([1, 2, 3, 4, 5, 6])[0], settings());
    process.env.TZ = 'America/Los_Angeles';
    assert.deepEqual(scheduleRound(roundRobin([1, 2, 3, 4, 5, 6])[0], settings()), first);
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});

test('Calendarios completos de tamaños variados cumplen ventanas, descansos y la regla de una cancha', () => {
  for (let count = 2; count <= 14; count++) {
    for (const courts of [1, 2, 3]) {
      const options = settings({ cantidad_canchas: courts, hora_fin: '20:10' });
      const all = [];
      for (const round of roundRobin(Array.from({ length: count }, (_, i) => i + 1), 'Ida y vuelta')) {
        const result = scheduleRound(round, { ...options, previousMatches: all });
        all.push(...result.partidos);
      }
      assert.equal(all.length, count * (count - 1));
      assertValidSchedule(all, options);
      if (courts === 1) for (let index = 1; index < all.length; index++) {
        if (all[index - 1].fecha_hora.slice(0, 10) === all[index].fecha_hora.slice(0, 10)) assert.equal(sameTeam(all[index - 1], all[index]), false);
      }
    }
  }
});

test('Valida equipos, modalidad, ventanas y fechas sin bucles ni calendarios parciales', () => {
  for (const ids of [[], [1], [1, 1], ['1', 1], [-1, 2], [1.5, 2], [null, 2], Array.from({ length: 257 }, (_, i) => i + 1)]) status400(() => roundRobin(ids));
  status400(() => roundRobin([1, 2], 'eliminacion'));
  const round = { partidos: [{ local: 1, visitante: 2 }] };
  for (const change of [
    { hora_fin: '17:00' }, { hora_fin: '18:00' }, { hora_fin: '18:39' }, { hora_fin: '24:00' },
    { hora_inicio: 'abc' }, { duracion_partido_min: 0 }, { descanso_entre_partidos_min: -1 },
    { cantidad_canchas: 0 }, { fecha_inicio: '2026-02-30' }, { minStart: '2026-09-15T24:01' },
    { previousMatches: {} }, { previousMatches: [{ local: 1, visitante: 1, fecha_hora: '2026-09-15T18:00', cancha_numero: 1 }] },
    { previousMatches: [{ local: 1, visitante: 2, fecha_hora: '2026-09-15T18:00', cancha_numero: 2 }] },
  ]) status400(() => scheduleRound(round, settings(change)));
  status400(() => scheduleRound({ partidos: [] }, settings()));
  status400(() => scheduleRound({ partidos: [{ local: 1, visitante: 2 }, { local: 1, visitante: 3 }] }, settings()));
});

test('Una cantidad alta de canchas no provoca una búsqueda proporcional a todas ellas', () => {
  const options = settings({ cantidad_canchas: 1000000, previousMatches: [{ local: 1, visitante: 2, fecha_hora: '2026-09-15T18:00', cancha_numero: 999999 }] });
  const result = scheduleRound({ partidos: [{ local: 2, visitante: 1 }] }, options);
  assert.equal(result.partidos[0].cancha_numero, 1000000);
});

test('La modalidad de solo ida equilibra localías para equipos pares e impares', () => {
  for (let count = 2; count <= 33; count++) {
    const teams = Array.from({ length: count }, (_, i) => i + 1);
    const games = roundRobin(teams).flatMap(round => round.partidos);
    for (const team of teams) {
      const home = games.filter(game => game.local === team).length;
      const away = games.filter(game => game.visitante === team).length;
      assert.ok(Math.abs(home - away) <= 1, `Localía desequilibrada para ${count} equipos`);
    }
  }
});

test('Fechas históricas admitidas se conservan también con varias canchas', () => {
  const result = scheduleRound({ partidos: [{ local: 1, visitante: 2 }] }, settings({ fecha_inicio: '1950-01-01', cantidad_canchas: 2 }));
  assert.equal(result.fecha_inicio, '1950-01-01T18:00');
});
