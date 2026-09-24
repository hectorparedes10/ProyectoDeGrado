$ErrorActionPreference = 'Stop'
$arenaResultPath = Join-Path $PSScriptRoot 'red-local-resultado.json'
try {
    $arenaIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $arenaPrincipal = [Security.Principal.WindowsPrincipal]$arenaIdentity
    if (-not $arenaPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Ejecuta este archivo con permisos de administrador para configurar el firewall.'
    }
    $arenaRuleName = 'ArenaFutsal-WiFi-5173'
    $arenaDisplayName = 'ARENA FUTSAL SYSTEM - acceso Wi-Fi'
    $arenaSettings = @{
        Description = 'Acceso web local sin internet: TCP 5173 desde la subred conectada, solamente por interfaces inalambricas.'
        Direction = 'Inbound'
        Action = 'Allow'
        Enabled = 'True'
        Profile = 'Any'
        Protocol = 'TCP'
        LocalPort = 5173
        LocalAddress = 'Any'
        RemoteAddress = 'LocalSubnet'
        InterfaceAlias = 'Any'
        InterfaceType = 'Wireless'
        EdgeTraversalPolicy = 'Block'
        PolicyStore = 'PersistentStore'
    }
    if (Get-NetFirewallRule -Name $arenaRuleName -ErrorAction SilentlyContinue) {
        Set-NetFirewallRule -Name $arenaRuleName -NewDisplayName $arenaDisplayName @arenaSettings | Out-Null
    } else {
        New-NetFirewallRule -Name $arenaRuleName -DisplayName $arenaDisplayName @arenaSettings | Out-Null
    }
    [pscustomobject]@{
        success = $true
        ruleName = $arenaRuleName
        port = 5173
        remoteAddress = 'LocalSubnet'
        interfaceType = 'Wireless'
        date = (Get-Date).ToString('o')
    } | ConvertTo-Json | Set-Content -LiteralPath $arenaResultPath -Encoding UTF8
} catch {
    [pscustomobject]@{ success = $false; error = $_.Exception.Message; date = (Get-Date).ToString('o') } |
        ConvertTo-Json | Set-Content -LiteralPath $arenaResultPath -Encoding UTF8
    exit 1
}
