const test = require('node:test');
const assert = require('node:assert/strict');
const { wifiLinks } = require('./red-local.cjs');

const ipv4 = (address, extra = {}) => ({ address, family: 'IPv4', internal: false, ...extra });
const link = (adapter, address) => ({ adapter, address, url: `http://${address}:5173/login` });

test('Solo publica las interfaces Wi-Fi físicas identificadas por Windows', () => {
  const interfaces = {
    'Wi-Fi': [ipv4('192.168.0.21')],
    'VPN': [ipv4('10.8.0.2')],
    'vEthernet (Default Switch)': [ipv4('172.28.32.1')],
    'Ethernet': [ipv4('10.0.0.8')],
    'Loopback Pseudo-Interface 1': [ipv4('127.0.0.1', { internal: true })],
  };
  assert.deepEqual(wifiLinks(interfaces, ['Wi-Fi']), [link('Wi-Fi', '192.168.0.21')]);
});

test('Al pasar de la Wi-Fi de casa al hotspot publica la dirección nueva', () => {
  assert.deepEqual(wifiLinks({ 'Wi-Fi': [ipv4('192.168.0.21')] }, ['Wi-Fi']), [link('Wi-Fi', '192.168.0.21')]);
  assert.deepEqual(wifiLinks({ 'Wi-Fi': [ipv4('192.168.43.124')] }, ['Wi-Fi']), [link('Wi-Fi', '192.168.43.124')]);
});

test('Una dirección Wi-Fi local funciona sin información de Internet ni puerta de enlace', () => {
  const offlineInterfaces = { 'Wi-Fi': [ipv4('172.20.10.2')] };
  assert.deepEqual(wifiLinks(offlineInterfaces, ['Wi-Fi']), [link('Wi-Fi', '172.20.10.2')]);
});

test('Al desconectar Wi-Fi deja de anunciar enlaces aunque continúe una VPN', () => {
  assert.deepEqual(wifiLinks({ VPN: [ipv4('10.8.0.2')] }, ['Wi-Fi']), []);
  assert.deepEqual(wifiLinks({ 'Wi-Fi': [] }, ['Wi-Fi']), []);
  assert.deepEqual(wifiLinks({ 'Wi-Fi': undefined }, ['Wi-Fi']), []);
});

test('Admite un adaptador renombrado cuando aparece en la lista física actual', () => {
  const interfaces = { 'Conexión inalámbrica del torneo': [ipv4('192.168.50.12')] };
  assert.deepEqual(wifiLinks(interfaces, ['Wi-Fi']), []);
  assert.deepEqual(wifiLinks(interfaces, ['Conexión inalámbrica del torneo']), [link('Conexión inalámbrica del torneo', '192.168.50.12')]);
});

test('No anuncia direcciones internas, autoconfiguradas ni valores inválidos', () => {
  const interfaces = { 'Wi-Fi': [
    ipv4('127.0.0.1', { internal: true }),
    ipv4('169.254.22.10'),
    ipv4('invalid'),
    { address: 'fe80::1234', family: 'IPv6', internal: false },
    ipv4('192.168.1.25'),
  ] };
  assert.deepEqual(wifiLinks(interfaces, ['Wi-Fi']), [link('Wi-Fi', '192.168.1.25')]);
  assert.deepEqual(wifiLinks(interfaces, []), []);
});
