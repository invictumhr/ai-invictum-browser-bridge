[CmdletBinding()]
param(
    [switch]$Staged
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-RepositoryFiles {
    if ($Staged) {
        $items = @(git diff --cached --name-only --diff-filter=ACMR)
        if ($LASTEXITCODE -ne 0) {
            throw 'Unable to list staged Git files.'
        }
    } else {
        $items = @(git ls-files --cached --others --exclude-standard)
        if ($LASTEXITCODE -ne 0) {
            throw 'Unable to list repository files.'
        }
    }

    return @(
        $items |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
            ForEach-Object { $_.Replace('\', '/') } |
            Sort-Object -Unique
    )
}

function Get-FileLines {
    param([Parameter(Mandatory = $true)][string]$Path)

    if ($Staged) {
        $content = @(git show ":$Path")
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to read staged content for $Path."
        }
        return $content
    }

    return @(Get-Content -LiteralPath $Path -ErrorAction Stop)
}

function Get-Entropy {
    param([Parameter(Mandatory = $true)][string]$Value)

    if ($Value.Length -eq 0) {
        return 0.0
    }

    $entropy = 0.0
    foreach ($group in ($Value.ToCharArray() | Group-Object)) {
        $probability = $group.Count / $Value.Length
        $entropy -= $probability * [Math]::Log($probability, 2)
    }
    return $entropy
}

function Get-ShortDigest {
    param([Parameter(Mandatory = $true)][string]$Value)

    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
        $hash = $algorithm.ComputeHash($bytes)
        return (([BitConverter]::ToString($hash) -replace '-', '').Substring(0, 12))
    } finally {
        $algorithm.Dispose()
    }
}

$binaryExtensions = @(
    '.7z', '.avi', '.bmp', '.dll', '.exe', '.gif', '.ico', '.jpeg', '.jpg',
    '.mov', '.mp3', '.mp4', '.pdf', '.png', '.pyd', '.so', '.ttf', '.webp',
    '.woff', '.woff2', '.zip'
)

$strongPatterns = [ordered]@{
    'private-key' = '-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'
    'github-token' = '\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b'
    'gitlab-token' = '\bglpat-[A-Za-z0-9_-]{20,}\b'
    'openai-token' = '\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b'
    'anthropic-token' = '\bsk-ant-[A-Za-z0-9_-]{20,}\b'
    'slack-token' = '\bxox[baprs]-[A-Za-z0-9-]{10,}\b'
    'google-api-key' = '\bAIza[0-9A-Za-z_-]{30,}\b'
    'aws-access-key' = '\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'
    'npm-token' = '\bnpm_[A-Za-z0-9]{30,}\b'
    'stripe-live-key' = '\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b'
    'jwt' = '\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b'
    'credential-url' = '\b[a-z][a-z0-9+.-]*://[^\s/:]+:[^\s/@]+@[^\s/]+'
}

$genericCredentialPattern = [regex]::new(
    '(?i)\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|private[_-]?key)\b\s*[:=]\s*["''](?<value>[^"'']{8,})["'']'
)
$highEntropyPattern = [regex]::new('(?<![A-Za-z0-9_])[A-Za-z0-9_+\-/]{32,}={0,2}(?![A-Za-z0-9_])')
$nonProductionPath = '(?i)(^|/)(?:tests?|fixtures|docs)(?:/|$)|\.test\.[^/]+$|\.example$'
$placeholderValue = '(?i)^(?:example|placeholder|changeme|change-me|dummy|fixture|redacted|secret|password|test)(?:[-_ ].*)?$'
$findings = [System.Collections.Generic.List[object]]::new()

foreach ($path in (Get-RepositoryFiles)) {
    $extension = [IO.Path]::GetExtension($path).ToLowerInvariant()
    if ($binaryExtensions -contains $extension) {
        continue
    }

    $lineNumber = 0
    foreach ($line in (Get-FileLines -Path $path)) {
        $lineNumber++

        foreach ($entry in $strongPatterns.GetEnumerator()) {
            foreach ($match in [regex]::Matches($line, $entry.Value)) {
                if ($entry.Key -eq 'credential-url' -and
                    $match.Value -match '@(?:[A-Za-z0-9-]+\.)*(?:example\.test|example\.com)(?:[/:]|$)') {
                    continue
                }

                $findings.Add([pscustomobject]@{
                    File = $path
                    Line = $lineNumber
                    Kind = $entry.Key
                    Digest = Get-ShortDigest -Value $match.Value
                })
            }
        }

        if ($path -notmatch $nonProductionPath) {
            foreach ($match in $genericCredentialPattern.Matches($line)) {
                $value = $match.Groups['value'].Value
                if ($value -notmatch $placeholderValue) {
                    $findings.Add([pscustomobject]@{
                        File = $path
                        Line = $lineNumber
                        Kind = 'literal-credential-assignment'
                        Digest = Get-ShortDigest -Value $value
                    })
                }
            }
        }

        if ($path -notmatch '(?i)(?:^|/)pnpm-lock\.yaml$') {
            foreach ($match in $highEntropyPattern.Matches($line)) {
                $value = $match.Value
                if ($value -match '^[A-Fa-f0-9]{32,}$' -or $value -match '^[0-9a-fA-F-]{36}$') {
                    continue
                }
                if ((Get-Entropy -Value $value) -ge 4.3) {
                    $findings.Add([pscustomobject]@{
                        File = $path
                        Line = $lineNumber
                        Kind = 'high-entropy-string'
                        Digest = Get-ShortDigest -Value $value
                    })
                }
            }
        }
    }
}

$uniqueFindings = @($findings | Sort-Object File, Line, Kind, Digest -Unique)
if ($uniqueFindings.Count -gt 0) {
    Write-Host 'Potential secrets detected. Values are intentionally not printed.' -ForegroundColor Red
    $uniqueFindings | Format-Table File, Line, Kind, Digest -AutoSize
    Write-Host 'Remove or replace each value, then run the scan again.' -ForegroundColor Red
    exit 1
}

$scope = if ($Staged) { 'staged content' } else { 'repository candidates' }
Write-Host "Secret scan passed for $scope." -ForegroundColor Green
