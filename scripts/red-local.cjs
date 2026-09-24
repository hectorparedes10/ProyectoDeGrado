const { isIP } = require('node:net');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const execute = promisify(execFile);

function wifiLinks(interfaces, adapterNames, port = 5173) {
  const names = new Set(adapterNames);
  return Object.entries(interfaces).flatMap(([name, addresses]) => names.has(name)
    ? (addresses || []).filter(address => !address.internal && isIP(address.address) === 4 && !address.address.startsWith('169.254.'))
      .map(address => ({ adapter: name, address: address.address, url: `http://${address.address}:${port}/login` }))
    : []).sort((a, b) => a.adapter.localeCompare(b.adapter) || a.address.localeCompare(b.address));
}

async function wifiAdapterNames() {
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const command = "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); $ErrorActionPreference='Stop'; $names=@(Get-NetAdapter -Physical | Where-Object { $_.InterfaceType -eq 71 } | Select-Object -ExpandProperty Name); ConvertTo-Json -InputObject $names -Compress";
  const { stdout } = await execute(powershell, ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 15000, maxBuffer: 65536 });
  const names = JSON.parse(stdout.trim().replace(/^\uFEFF/, ''));
  return Array.isArray(names) ? names : [names];
}

module.exports = { wifiLinks, wifiAdapterNames };
