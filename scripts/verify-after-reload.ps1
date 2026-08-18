$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$fixtureProcess = $null
$expectedDesktopEntry = [System.IO.Path]::GetFullPath(
    (Join-Path $repositoryRoot "apps\desktop\dist\index.js")
)

function Test-LoopbackPortAvailable {
    param([int]$Port)
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    try {
        $listener.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        $listener.Stop()
    }
}

function Invoke-BridgeCapabilities {
    param([hashtable]$Context)
    $request = @{
        action = "system.capabilities"
        parameters = @{}
        context = $Context
    } | ConvertTo-Json -Depth 8 -Compress
    return Invoke-RestMethod `
        -Uri "http://127.0.0.1:47820/v1/call" `
        -Method Post `
        -ContentType "application/json" `
        -Body $request `
        -TimeoutSec 15
}

function Get-LoopbackListenerProcessId {
    param([int]$Port)
    $connection = Get-NetTCPConnection `
        -LocalAddress "127.0.0.1" `
        -LocalPort $Port `
        -State Listen `
        -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -ne $connection) {
        return [int]$connection.OwningProcess
    }

    foreach ($line in (& netstat -ano -p tcp)) {
        $columns = @($line.Trim() -split "\s+")
        if (
            $columns.Count -ge 5 -and
            $columns[1] -eq "127.0.0.1:$Port" -and
            $columns[3] -eq "LISTENING" -and
            $columns[4] -match "^\d+$"
        ) {
            return [int]$columns[4]
        }
    }
    return $null
}

function Test-ProjectAuthorityRuntimeIsNewer {
    $authorityProcessId = Get-LoopbackListenerProcessId -Port 47820
    if ($null -eq $authorityProcessId) {
        return $false
    }

    $authorityProcess = Get-Process -Id $authorityProcessId -ErrorAction SilentlyContinue
    if ($null -eq $authorityProcess) {
        return $false
    }

    $runtimeDirectories = @(
        "apps\desktop\dist",
        "packages\audit-log\dist",
        "packages\policy-engine\dist",
        "packages\protocol\dist",
        "packages\shared-types\dist"
    ) | ForEach-Object { Join-Path $repositoryRoot $_ }
    $latestRuntimeArtifact = $runtimeDirectories |
        Where-Object { Test-Path -LiteralPath $_ } |
        ForEach-Object { Get-ChildItem -LiteralPath $_ -File -Recurse } |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if ($null -eq $latestRuntimeArtifact) {
        return $false
    }

    return $authorityProcess.StartTime.ToUniversalTime() -lt $latestRuntimeArtifact.LastWriteTimeUtc
}

function Restart-StaleProjectAuthority {
    $authorityProcessId = Get-LoopbackListenerProcessId -Port 47820
    if ($null -eq $authorityProcessId) {
        return $false
    }

    $nativeListenerProcessId = Get-LoopbackListenerProcessId -Port 47821
    $health = Invoke-RestMethod `
        -Uri "http://127.0.0.1:47820/v1/health" `
        -TimeoutSec 3
    $authorityProcess = Get-Process -Id $authorityProcessId -ErrorAction SilentlyContinue
    try {
        $authorityProcessDetails = Get-CimInstance `
            -ClassName Win32_Process `
            -Filter "ProcessId = $authorityProcessId" `
            -ErrorAction Stop
    }
    catch {
        $authorityProcessDetails = $null
    }
    $normalizedCommandLine = "$($authorityProcessDetails.CommandLine)".Replace("/", "\").ToLowerInvariant()
    $normalizedExpectedEntry = $expectedDesktopEntry.Replace("/", "\").ToLowerInvariant()
    $healthMatchesProject = (
        $health.ok -eq $true -and
        $health.component -eq "desktop-authority" -and
        $health.nativeUrl -eq "ws://127.0.0.1:47821/native" -and
        $health.controlUrl -eq "http://127.0.0.1:47820"
    )
    $commandMatchesProject = (
        $null -ne $authorityProcessDetails -and
        $normalizedCommandLine.Contains($normalizedExpectedEntry)
    )
    if (
        $null -eq $authorityProcess -or
        $authorityProcess.ProcessName -ne "node" -or
        $nativeListenerProcessId -ne $authorityProcessId -or
        -not $healthMatchesProject -or
        ($null -ne $authorityProcessDetails -and -not $commandMatchesProject)
    ) {
        throw "Port 47820 is owned by a non-project process; refusing to stop it automatically"
    }

    Write-Host "Restarting stale project-owned Desktop Authority (PID $authorityProcessId)..."
    Stop-Process -Id $authorityProcessId -Force
    $deadline = [DateTime]::UtcNow.AddSeconds(5)
    do {
        Start-Sleep -Milliseconds 100
        $stillListening = Get-NetTCPConnection `
            -LocalPort 47820 `
            -State Listen `
            -ErrorAction SilentlyContinue
    } while ($null -ne $stillListening -and [DateTime]::UtcNow -lt $deadline)
    if ($null -ne $stillListening) {
        throw "Stale Desktop Authority did not release port 47820"
    }
    return $true
}

Push-Location $repositoryRoot
try {
    # Agent shells are non-interactive. Warn about a pnpm dependency-layout mismatch
    # instead of attempting an interactive node_modules purge/install.
    $env:CI = "true"
    $env:pnpm_config_verify_deps_before_run = "warn"

    & pnpm browser ping | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "Invictum browser ping failed"
    }
    if (Test-ProjectAuthorityRuntimeIsNewer) {
        if (-not (Restart-StaleProjectAuthority)) {
            throw "The Desktop Authority runtime is stale but no listener was available to restart"
        }
        & pnpm browser ping | Out-Host
        if ($LASTEXITCODE -ne 0) {
            throw "Invictum browser ping failed after refreshing the Desktop Authority runtime"
        }
    }

    $context = @{
        sessionId = "post-reload-verification"
        agentId = "verification-script"
        clientId = "verify-after-reload.ps1"
        sessionAuthorized = $true
    }
    try {
        $capabilityResponse = Invoke-BridgeCapabilities -Context $context
    }
    catch {
        if (-not (Restart-StaleProjectAuthority)) {
            throw
        }
        & pnpm browser ping | Out-Host
        if ($LASTEXITCODE -ne 0) {
            throw "Invictum browser ping failed after restarting the stale authority"
        }
        $capabilityResponse = Invoke-BridgeCapabilities -Context $context
    }

    $actions = @($capabilityResponse.data.actions.action)
    $requiredActions = @(
        "browser.get_figma_document",
        "browser.get_figma_layers",
        "browser.get_figma_properties",
        "browser.figma_select",
        "browser.figma_healthcheck",
        "browser.close_tab",
        "browser.set_file_input_files",
        "browser.get_wordpress_menu",
        "browser.edit_wordpress_menu",
        "browser.get_wordpress_admin",
        "browser.wordpress_list_table_action",
        "browser.get_wordpress_editor",
        "browser.edit_wordpress_editor",
        "browser.mutate_dom",
        "browser.inspect_element",
        "browser.manage_css",
        "browser.observe_events",
        "browser.execute_javascript",
        "browser.console",
        "browser.network",
        "browser.emulate_device",
        "browser.perform_gesture",
        "browser.get_terminals",
        "browser.read_terminal",
        "browser.terminal_input",
        "browser.print_to_pdf",
        "browser.get_page_text",
        "browser.find_natural_language",
        "browser.go_back",
        "browser.go_forward",
        "browser.activate_tab",
        "browser.page_api_request",
        "browser.set_control_identity"
    )
    $missingActions = @($requiredActions | Where-Object { $actions -notcontains $_ })
    if ($actions.Count -ne 54 -or $missingActions.Count -gt 0) {
        if (Restart-StaleProjectAuthority) {
            & pnpm browser ping | Out-Host
            if ($LASTEXITCODE -ne 0) {
                throw "Invictum browser ping failed after restarting the stale authority"
            }
            $capabilityResponse = Invoke-BridgeCapabilities -Context $context
            $actions = @($capabilityResponse.data.actions.action)
            $missingActions = @($requiredActions | Where-Object { $actions -notcontains $_ })
        }
        if ($actions.Count -ne 54 -or $missingActions.Count -gt 0) {
            throw "Reloaded extension does not expose the expected 54 actions. Missing: $($missingActions -join ', ')"
        }
    }
    if ($capabilityResponse.data.features.localFileUpload -ne $true) {
        throw "Reloaded extension does not advertise localFileUpload"
    }
    if ($capabilityResponse.data.features.wordpressMenuEditing -ne $true) {
        throw "Reloaded extension does not advertise wordpressMenuEditing"
    }
    if ($capabilityResponse.data.features.wordpressAdminTools -ne $true) {
        throw "Reloaded extension does not advertise wordpressAdminTools"
    }
    if ($capabilityResponse.data.features.wordpressPostEditing -ne $true) {
        throw "Reloaded extension does not advertise wordpressPostEditing"
    }
    foreach ($feature in @("elementInspection", "domMutation", "cssInjection", "eventCapture", "browserConsole", "networkCapture", "deviceEmulation", "advancedGestures", "pageText", "naturalLanguageFind", "historyNavigation", "explicitTabActivation", "sameOriginPageApi", "agentBatching", "pdfExport", "rawJavaScript", "terminalAutomation", "trustedTerminalInput", "terminalBufferReadback", "terminalTransportReadback")) {
        if ($capabilityResponse.data.features.$feature -ne $true) {
            throw "Reloaded extension does not advertise $feature"
        }
    }
    if ($capabilityResponse.data.features.customControlIdentity -ne $true) {
        throw "Reloaded extension does not advertise customControlIdentity"
    }
    if ($capabilityResponse.data.features.configurableTabActivation -ne $true) {
        throw "Reloaded extension does not advertise configurableTabActivation"
    }
    foreach ($popupArtifact in @("popup.html", "popup.css", "popup.js")) {
        if (-not (Test-Path -LiteralPath (Join-Path $repositoryRoot "apps\extension\dist\$popupArtifact"))) {
            throw "Built extension popup artifact is missing: $popupArtifact"
        }
    }
    $mcpEntry = Join-Path $repositoryRoot "apps\mcp\dist\index.js"
    if (-not (Test-Path -LiteralPath $mcpEntry)) {
        throw "Built MCP entry is missing: $mcpEntry"
    }
    $mcpSource = Get-Content -LiteralPath $mcpEntry -Raw
    $mcpToolMatches = [regex]::Matches($mcpSource, 'name:\s*"invictum_[a-z_]+"')
    $requiredMcpTools = @(
        "invictum_get_figma_document",
        "invictum_get_figma_layers",
        "invictum_get_figma_properties",
        "invictum_figma_select",
        "invictum_figma_healthcheck",
        "invictum_network",
        "invictum_perform_gesture",
        "invictum_print_to_pdf",
        "invictum_get_page_text",
        "invictum_find_natural_language",
        "invictum_go_back",
        "invictum_go_forward",
        "invictum_activate_tab",
        "invictum_page_api_request",
        "invictum_detect_terminals",
        "invictum_read_terminal",
        "invictum_wait_for_terminal",
        "invictum_type_terminal",
        "invictum_execute_terminal",
        "invictum_send_terminal_key",
        "invictum_batch"
    )
    $missingMcpTools = @($requiredMcpTools | Where-Object { $mcpSource -notmatch [regex]::Escape("name: `"$_`"") })
    if ($mcpToolMatches.Count -ne 61 -or $missingMcpTools.Count -gt 0) {
        throw "Built MCP server does not expose the expected 61 tools. Missing: $($missingMcpTools -join ', ')"
    }

    $fixturePort = 47822
    $fixtureReady = $false
    try {
        $fixture = Invoke-WebRequest `
            -Uri "http://127.0.0.1:$fixturePort/kitchen-sink" `
            -UseBasicParsing `
            -TimeoutSec 3
        $fixtureReady = $fixture.StatusCode -eq 200 -and
            $fixture.Content.Contains("multi-file-input") -and
            $fixture.Content.Contains("handleFixtureDropdownClick") -and
            $fixture.Content.Contains("update-nav-menu") -and
            $fixture.Content.Contains("posts-list") -and
            $fixture.Content.Contains("wordpressEditorState")
        if ($fixtureReady) {
            $terminalFixture = Invoke-WebRequest `
                -Uri "http://127.0.0.1:$fixturePort/xterm-terminal" `
                -UseBasicParsing `
                -TimeoutSec 3
            $fixtureReady = $terminalFixture.StatusCode -eq 200 -and
                $terminalFixture.Content.Contains("xterm-helper-textarea") -and
                $terminalFixture.Content.Contains("fixtureTerminal")
        }
    }
    catch {
        $fixtureReady = $false
    }
    if (-not $fixtureReady) {
        $fixturePort = @(47822..47832 | Where-Object { Test-LoopbackPortAvailable -Port $_ } | Select-Object -First 1)[0]
        if ($null -eq $fixturePort) {
            throw "No free loopback fixture port is available from 47822 through 47832"
        }
        $env:INVICTUM_FIXTURE_PORT = "$fixturePort"
        $nodeExecutable = (Get-Command node -ErrorAction Stop).Source
        $fixtureProcess = Start-Process `
            -FilePath $nodeExecutable `
            -ArgumentList @("tests/fixtures/server.mjs") `
            -WorkingDirectory $repositoryRoot `
            -PassThru `
            -WindowStyle Hidden
        $deadline = [DateTime]::UtcNow.AddSeconds(10)
        do {
            Start-Sleep -Milliseconds 200
            try {
                $fixture = Invoke-WebRequest `
                    -Uri "http://127.0.0.1:$fixturePort/kitchen-sink" `
                    -UseBasicParsing `
                    -TimeoutSec 2
                $fixtureReady = $fixture.StatusCode -eq 200 -and
                    $fixture.Content.Contains("multi-file-input") -and
                    $fixture.Content.Contains("handleFixtureDropdownClick") -and
                    $fixture.Content.Contains("posts-list") -and
                    $fixture.Content.Contains("wordpressEditorState")
                if ($fixtureReady) {
                    $terminalFixture = Invoke-WebRequest `
                        -Uri "http://127.0.0.1:$fixturePort/xterm-terminal" `
                        -UseBasicParsing `
                        -TimeoutSec 2
                    $fixtureReady = $terminalFixture.StatusCode -eq 200 -and
                        $terminalFixture.Content.Contains("xterm-helper-textarea") -and
                        $terminalFixture.Content.Contains("fixtureTerminal")
                }
            }
            catch {
                $fixtureReady = $false
            }
        } while (-not $fixtureReady -and [DateTime]::UtcNow -lt $deadline)
        if (-not $fixtureReady) {
            if (-not $fixtureProcess.HasExited) {
                Stop-Process -Id $fixtureProcess.Id -Force
            }
            throw "Current kitchen-sink fixture did not start on 127.0.0.1:$fixturePort"
        }
    }

    $env:INVICTUM_FIXTURE_URL = "http://127.0.0.1:$fixturePort/kitchen-sink"
    & pnpm --filter "@invictum/integration-tests" smoke:chrome:kitchen-sink
    if ($LASTEXITCODE -ne 0) {
        throw "Real-Chrome kitchen-sink smoke failed"
    }
    $env:INVICTUM_TERMINAL_FIXTURE_URL = "http://127.0.0.1:$fixturePort/xterm-terminal"
    & pnpm --filter "@invictum/integration-tests" smoke:chrome:terminal
    if ($LASTEXITCODE -ne 0) {
        throw "Real-Chrome terminal smoke failed"
    }
}
finally {
    if ($null -ne $fixtureProcess -and -not $fixtureProcess.HasExited) {
        Stop-Process -Id $fixtureProcess.Id -Force -ErrorAction SilentlyContinue
    }
    Pop-Location
}
