const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const source = fs.readFileSync(path.join(__dirname, 'iniciar-local.cjs'), 'utf8');
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const healthyResponse = () => ({ ok: true, json: async () => ({ ok: true, accessControl: true }), text: async () => 'ARENA FUTSAL SYSTEM' });

function launcher({ adapters = Promise.resolve(['Wi-Fi']), fetchResponse = async () => healthyResponse(), onSpawn = () => {} } = {}) {
  const signals = new Map();
  const calls = { spawn: [], monitor: [], fetch: [] };
  const modules = {
    'node:fs': { existsSync: () => true },
    'node:path': path,
    'node:os': { networkInterfaces: () => ({}) },
    'node:net': {
      createConnection() {
        const socket = new EventEmitter();
        socket.destroy = () => {};
        socket.setTimeout = () => {};
        queueMicrotask(() => socket.emit('error', new Error('Simulated unused port')));
        return socket;
      },
    },
    'node:child_process': {
      spawn(executable, args, options) {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.exitCode = null;
        child.signalCode = null;
        child.killed = false;
        child.kill = () => { child.killed = true; return true; };
        calls.spawn.push({ executable, args, options, child });
        onSpawn(child);
        return child;
      },
    },
    './red-local.cjs': { wifiAdapterNames: () => adapters, wifiLinks: () => [] },
  };
  const simulatedRequire = id => {
    assert.ok(Object.hasOwn(modules, id), 'Unexpected real dependency: ' + id);
    return modules[id];
  };
  const context = vm.createContext({
    require: simulatedRequire,
    module: {},
    __dirname,
    console: { log() {}, error() {} },
    process: { argv: [], execPath: 'simulated-node', on: (event, listener) => signals.set(event, listener), stdout: { write() {} }, stderr: { write() {} } },
    AbortSignal: { timeout: () => ({}) },
    fetch: async url => { calls.fetch.push(url); return fetchResponse(url); },
    setTimeout: callback => queueMicrotask(callback),
    setInterval: callback => { calls.monitor.push(callback); return calls.monitor.length; },
    clearInterval() {},
  });
  vm.runInContext(source, context, { filename: 'iniciar-local.cjs' });
  return { calls, start: () => vm.runInContext('main()', context), cancel: () => signals.get('SIGINT')() };
}

test('SIGINT mientras descubre Wi-Fi no inicia servidores ni monitor después de resolver', async () => {
  const adapters = deferred();
  const app = launcher({ adapters: adapters.promise });
  const cancelled = assert.rejects(app.start(), { code: 'ARENA_CANCELLED' });
  app.cancel();
  adapters.resolve(['Wi-Fi']);
  await cancelled;
  assert.equal(app.calls.spawn.length, 0);
  assert.equal(app.calls.monitor.length, 0);
  assert.equal(app.calls.fetch.length, 0);
});

test('SIGINT durante una comprobación de salud evita arrancar procesos o monitor', async () => {
  const entered = deferred();
  const response = deferred();
  const app = launcher({ fetchResponse: url => {
    if (url.includes(':5000/')) { entered.resolve(); return response.promise; }
    return healthyResponse();
  } });
  const cancelled = assert.rejects(app.start(), { code: 'ARENA_CANCELLED' });
  await entered.promise;
  app.cancel();
  response.resolve(healthyResponse());
  await cancelled;
  assert.equal(app.calls.spawn.length, 0);
  assert.equal(app.calls.monitor.length, 0);
});

test('SIGINT durante build detiene su hijo y no abre preview aunque build termine con éxito', async () => {
  const started = deferred();
  const app = launcher({
    fetchResponse: url => url.includes(':5000/') ? healthyResponse() : { ok: false, json: async () => ({}) },
    onSpawn: child => started.resolve(child),
  });
  const cancelled = assert.rejects(app.start(), { code: 'ARENA_CANCELLED' });
  const build = await started.promise;
  app.cancel();
  build.exitCode = 0;
  build.emit('exit', 0);
  await cancelled;
  assert.equal(build.killed, true);
  assert.equal(app.calls.spawn.length, 1);
  assert.equal(app.calls.spawn[0].args[1], 'build');
  assert.equal(app.calls.monitor.length, 0);
});
