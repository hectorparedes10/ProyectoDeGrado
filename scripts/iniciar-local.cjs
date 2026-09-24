const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { wifiLinks, wifiAdapterNames } = require('./red-local.cjs');
const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend');
const frontend = path.join(root, 'frontend');
const vite = path.join(frontend, 'node_modules', 'vite', 'bin', 'vite.js');
const children = new Set();
let closing = false;
let monitor;

function checkRunning() {
  if (closing) throw Object.assign(new Error('Arranque cancelado.'), { code: 'ARENA_CANCELLED' });
}

async function healthy(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2500) });
    const data = await response.json();
    if (!response.ok || data.ok !== true || data.accessControl !== true) return false;
    if (port === 5173) {
      const page = await fetch('http://127.0.0.1:5173/login', { signal: AbortSignal.timeout(2500) });
      return page.ok && (await page.text()).includes('ARENA FUTSAL SYSTEM');
    }
    return true;
  } catch { return false; }
}

function occupied(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let done = false;
    const finish = value => { if (!done) { done = true; socket.destroy(); resolve(value); } };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(1500, () => finish(true));
  });
}

function launch(args, cwd, label) {
  checkRunning();
  const child = spawn(process.execPath, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  child.stdout.on('data', chunk => process.stdout.write(chunk));
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  child.on('error', error => console.error(`${label}: ${error.message}`));
  child.on('exit', () => children.delete(child));
  return child;
}

async function waitReady(port, child, label) {
  for (let attempt = 0; attempt < 30; attempt++) {
    checkRunning();
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`${label} se detuvo al iniciar. Revisa el mensaje anterior.`);
    if (await healthy(port)) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`${label} no responde. Comprueba que PostgreSQL esté iniciado y que el puerto ${port} esté disponible.`);
}

function stop(code = 0) {
  if (closing) return;
  closing = true;
  if (monitor) clearInterval(monitor);
  for (const child of children) child.kill();
  process.exitCode = code;
}

async function main() {
  console.log('\nARENA FUTSAL SYSTEM - red local sin internet\n');
  let adapterNames = [];
  async function findAdapters() {
    try { adapterNames = await wifiAdapterNames(); }
    catch { console.log('No se pudo leer el adaptador Wi-Fi de Windows. Volveremos a intentar.'); }
  }
  await findAdapters();
  checkRunning();
  let signature;
  function showLinks() {
    const links = wifiLinks(os.networkInterfaces(), adapterNames);
    const next = JSON.stringify(links);
    if (next === signature) return;
    signature = next;
    console.log('\nDirección para los dispositivos de la misma red:');
    if (links.length) for (const link of links) console.log(`  ${link.adapter}: ${link.url}`);
    else console.log('  Conecta esta computadora a una Wi-Fi o al punto de acceso del celular.');
    if (links.length) console.log('Comparte este enlace. No hace falta conexión a internet.');
  }
  if (process.argv.includes('--comprobar')) {
    showLinks();
    const [api, web] = await Promise.all([healthy(5000), healthy(5173)]);
    console.log(`\nAPI: ${api ? 'lista' : 'no responde'} | Web: ${web ? 'lista' : 'no responde'}`);
    process.exitCode = api && web ? 0 : 1;
    return;
  }
  if (!fs.existsSync(vite) || !fs.existsSync(path.join(backend, 'node_modules', 'express'))) {
    throw new Error('Faltan dependencias del proyecto. Deben instalarse una vez antes de utilizar el sistema sin internet.');
  }
  if (!await healthy(5000)) {
    if (await occupied(5000)) throw new Error('El puerto 5000 está ocupado, pero la API no está lista. Revisa el servidor existente y PostgreSQL.');
    console.log('Iniciando el servidor de datos...');
    await waitReady(5000, launch(['server.js'], backend, 'API'), 'La API');
  } else console.log('El servidor de datos ya está funcionando.');
  if (!await healthy(5173)) {
    if (await occupied(5173)) throw new Error('El puerto 5173 está ocupado por un servicio que no responde como ARENA. Revisa esa ventana antes de volver a iniciar.');
    console.log('Preparando la web con los archivos instalados en la computadora...');
    const build = launch([vite, 'build'], frontend, 'Compilación');
    await new Promise((resolve, reject) => {
      build.once('error', reject);
      build.once('exit', code => code === 0 ? resolve() : reject(new Error('No se pudo preparar la web. Revisa el mensaje anterior.')));
    });
    await waitReady(5173, launch([vite, 'preview'], frontend, 'Web'), 'La web');
  } else console.log('La web ya está funcionando.');
  checkRunning();
  showLinks();
  console.log('\nMantén esta ventana abierta. Ctrl+C termina los servidores iniciados aquí.');
  console.log('Si cambias de Wi-Fi, el enlace se actualizará automáticamente en esta ventana.');
  let checks = 0;
  let checking = false;
  let wasHealthy = true;
  monitor = setInterval(async () => {
    if (closing || checking) return;
    checking = true;
    try {
      if (++checks % 6 === 0 || adapterNames.length === 0) await findAdapters();
      if (closing) return;
      showLinks();
      const ready = await healthy(5173);
      if (!ready && wasHealthy) console.log('\nEl sistema dejó de responder. Revisa PostgreSQL y los servidores antes de usar el enlace.');
      if (ready && !wasHealthy) console.log('\nEl sistema vuelve a responder.');
      wasHealthy = ready;
    } finally { checking = false; }
  }, 5000);
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
process.on('exit', () => { for (const child of children) child.kill(); });
if (require.main === module) main().catch(error => {
  if (closing || error.code === 'ARENA_CANCELLED') return;
  console.error('\n' + error.message); stop(1);
});
