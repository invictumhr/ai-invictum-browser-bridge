[CmdletBinding()]
param(
    [switch]$SkipCodex,
    [switch]$SkipCursor,
    [switch]$SkipClaude,
    [switch]$SkipGlobalRules
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$mcpEntry = Join-Path $repoRoot 'apps\mcp\dist\index.js'
$triggerPath = Join-Path $repoRoot 'AGENT_TRIGGER.md'
$globalRulePath = Join-Path $repoRoot 'docs\agent-adapters\GLOBAL_AGENT_RULE.md'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path -LiteralPath $mcpEntry -PathType Leaf)) {
    throw "Built MCP entry is missing: $mcpEntry. Run pnpm build first."
}

if (-not (Test-Path -LiteralPath $triggerPath -PathType Leaf)) {
    throw "Agent trigger contract is missing: $triggerPath"
}

if (-not (Test-Path -LiteralPath $globalRulePath -PathType Leaf)) {
    throw "Global agent rule source is missing: $globalRulePath"
}

function Write-Utf8File {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )

    $directory = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Install-MarkedRule {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Rule
    )

    $startMarker = '<!-- INVICTUM_BROWSER_AGENT_RULE:START -->'
    $endMarker = '<!-- INVICTUM_BROWSER_AGENT_RULE:END -->'
    $block = "$startMarker`r`n$($Rule.Trim())`r`n$endMarker"
    $existing = if (Test-Path -LiteralPath $Path) {
        [System.IO.File]::ReadAllText($Path)
    } else {
        ''
    }

    $pattern = [regex]::Escape($startMarker) + '.*?' + [regex]::Escape($endMarker)
    if ([regex]::IsMatch($existing, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)) {
        $updated = [regex]::Replace(
            $existing,
            $pattern,
            [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $block },
            [System.Text.RegularExpressions.RegexOptions]::Singleline
        )
    } elseif ([string]::IsNullOrWhiteSpace($existing)) {
        $updated = "$block`r`n"
    } else {
        $updated = "$($existing.TrimEnd())`r`n`r`n$block`r`n"
    }

    Write-Utf8File -Path $Path -Content $updated
    Write-Host "Installed trigger rule: $Path"
}

function Set-CursorMcp {
    param([Parameter(Mandatory = $true)][string]$Path)

    $config = if (Test-Path -LiteralPath $Path) {
        $raw = [System.IO.File]::ReadAllText($Path)
        if ([string]::IsNullOrWhiteSpace($raw)) {
            [pscustomobject]@{}
        } else {
            $raw | ConvertFrom-Json
        }
    } else {
        [pscustomobject]@{}
    }

    if ($null -eq $config.mcpServers) {
        $config | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([pscustomobject]@{})
    }

    $server = [pscustomobject]@{
        command = $nodePath
        args = @($mcpEntry)
    }
    $config.mcpServers | Add-Member -NotePropertyName 'invictum-browser' -NotePropertyValue $server -Force
    Write-Utf8File -Path $Path -Content (($config | ConvertTo-Json -Depth 32) + "`r`n")
    Write-Host "Registered Cursor MCP: $Path"
}

function Find-Command {
    param([Parameter(Mandatory = $true)][string[]]$Names)

    foreach ($name in $Names) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($null -ne $command) {
            return $command.Source
        }
    }
    return $null
}

$globalRule = [System.IO.File]::ReadAllText($globalRulePath)
$homePath = [Environment]::GetFolderPath('UserProfile')
$results = [ordered]@{}

if (-not $SkipGlobalRules) {
    Install-MarkedRule -Path (Join-Path $homePath '.codex\AGENTS.md') -Rule $globalRule
    Install-MarkedRule -Path (Join-Path $homePath '.claude\CLAUDE.md') -Rule $globalRule

    $cursorRuleCopy = Join-Path $homePath '.cursor\IBB_USER_RULE.txt'
    Write-Utf8File -Path $cursorRuleCopy -Content ($globalRule.Trim() + "`r`n")
    Write-Host "Prepared Cursor User Rule text: $cursorRuleCopy"

    $pcStart = 'D:\tools\AI_PC_START.md'
    if (Test-Path -LiteralPath $pcStart) {
        Install-MarkedRule -Path $pcStart -Rule $globalRule
    }
}

if (-not $SkipCodex) {
    $codexCommand = Find-Command -Names @('codex.cmd', 'codex.exe', 'codex')
    if ($null -eq $codexCommand) {
        $results['Codex MCP'] = 'skipped: Codex CLI not found'
    } else {
        $codexServers = (& $codexCommand mcp list 2>&1 | Out-String)
        if ($codexServers -notmatch [regex]::Escape('invictum-browser')) {
            & $codexCommand mcp add invictum-browser -- $nodePath $mcpEntry
            if ($LASTEXITCODE -ne 0) {
                throw "Codex MCP registration failed with exit code $LASTEXITCODE"
            }
            $results['Codex MCP'] = 'installed'
        } else {
            $results['Codex MCP'] = 'already registered'
        }
    }
}

if (-not $SkipCursor) {
    Set-CursorMcp -Path (Join-Path $homePath '.cursor\mcp.json')
    $results['Cursor MCP'] = 'installed'
    $results['Cursor User Rule'] = 'prepared; paste IBB_USER_RULE.txt into Cursor Settings > Rules for a redundant global trigger'
}

if (-not $SkipClaude) {
    $claudeCommand = Find-Command -Names @('claude.cmd', 'claude.exe', 'claude')
    if ($null -eq $claudeCommand) {
        $results['Claude MCP'] = 'skipped: Claude Code CLI not found; global trigger and documented CLI fallback are ready'
    } else {
        $claudeServers = (& $claudeCommand mcp list 2>&1 | Out-String)
        if ($claudeServers -notmatch [regex]::Escape('invictum-browser')) {
            & $claudeCommand mcp add --scope user invictum-browser -- $nodePath $mcpEntry
            if ($LASTEXITCODE -ne 0) {
                throw "Claude MCP registration failed with exit code $LASTEXITCODE"
            }
            $results['Claude MCP'] = 'installed'
        } else {
            $results['Claude MCP'] = 'already registered'
        }
    }
}

Write-Host ''
Write-Host 'Invictum Browser agent discovery setup:'
$results.GetEnumerator() | ForEach-Object {
    Write-Host ("- {0}: {1}" -f $_.Key, $_.Value)
}
Write-Host ''
Write-Host "Trigger contract: $triggerPath"
Write-Host 'Start a new Codex/Cursor/Claude task after changing MCP or global rules.'
