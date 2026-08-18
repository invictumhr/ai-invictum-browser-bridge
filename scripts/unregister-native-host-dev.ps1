[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$registryPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.invictum.browser_bridge'

if (Test-Path -LiteralPath $registryPath) {
    Remove-Item -LiteralPath $registryPath -Recurse -Force
    Write-Host 'Removed the per-user Invictum Native Messaging host registration.'
} else {
    Write-Host 'The per-user Invictum Native Messaging host registration was not present.'
}
