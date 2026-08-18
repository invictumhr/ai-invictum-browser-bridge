[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-p]{32}$')]
    [string]$ExtensionId,

    [ValidatePattern('^ws://127\.0\.0\.1:\d{1,5}/[A-Za-z0-9/_-]+$')]
    [string]$DesktopUrl = 'ws://127.0.0.1:47821/native'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$hostEntry = Join-Path $repoRoot 'apps\native-host\dist\index.js'
$launcherSource = Join-Path $repoRoot 'apps\native-host\launcher\InvictumNativeHostLauncher.cs'
$nodePath = (Get-Command node -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $hostEntry -PathType Leaf)) {
    throw "Native host build not found at $hostEntry. Run pnpm build first."
}

$developmentDirectory = Join-Path $repoRoot '.development'
New-Item -ItemType Directory -Path $developmentDirectory -Force | Out-Null
$launcherSourceHash = (Get-FileHash -LiteralPath $launcherSource -Algorithm SHA256).Hash.Substring(0, 12).ToLowerInvariant()
# Chrome keeps the native-host executable open while the extension is connected.
# A content-addressed name lets development registration publish a rebuilt
# launcher without trying to overwrite the running executable.
$launcherPath = Join-Path $developmentDirectory "invictum-native-host-$launcherSourceHash.exe"
$nodePathFile = Join-Path $developmentDirectory 'node-path.txt'
$hostEntryPathFile = Join-Path $developmentDirectory 'host-entry-path.txt'
$desktopUrlFile = Join-Path $developmentDirectory 'desktop-url.txt'
$manifestPath = Join-Path $developmentDirectory 'com.invictum.browser_bridge.json'

$compilerCandidates = @(
    'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe',
    'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe'
)
$compilerPath = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $compilerPath) {
    throw 'The Windows C# compiler required for the development native-host launcher was not found.'
}

& $compilerPath /nologo /target:exe /optimize+ "/out:$launcherPath" $launcherSource
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $launcherPath -PathType Leaf)) {
    throw 'Failed to compile the development native-host launcher.'
}

$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($nodePathFile, $nodePath, $utf8WithoutBom)
[System.IO.File]::WriteAllText($hostEntryPathFile, $hostEntry, $utf8WithoutBom)
[System.IO.File]::WriteAllText($desktopUrlFile, $DesktopUrl, $utf8WithoutBom)

$manifest = [ordered]@{
    name = 'com.invictum.browser_bridge'
    description = 'Invictum Browser Bridge Native Messaging Host (development)'
    path = $launcherPath
    type = 'stdio'
    allowed_origins = @("chrome-extension://$ExtensionId/")
}
$manifestJson = $manifest | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($manifestPath, $manifestJson, $utf8WithoutBom)

$registryPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.invictum.browser_bridge'
New-Item -Path $registryPath -Force | Out-Null
Set-Item -Path $registryPath -Value $manifestPath

Write-Host "Registered com.invictum.browser_bridge for extension $ExtensionId"
Write-Host "Manifest: $manifestPath"
