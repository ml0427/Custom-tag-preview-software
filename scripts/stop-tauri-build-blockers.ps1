$ErrorActionPreference = "Stop"

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..")).TrimEnd('\', '/')
$targetRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "src-tauri\target")).TrimEnd('\', '/')
$stopped = New-Object System.Collections.Generic.List[string]
$seen = @{}

function Test-IsUnderPath {
    param(
        [string] $Candidate,
        [string] $Root
    )

    if ([string]::IsNullOrWhiteSpace($Candidate) -or [string]::IsNullOrWhiteSpace($Root)) {
        return $false
    }

    try {
        $candidatePath = [System.IO.Path]::GetFullPath($Candidate).TrimEnd('\', '/')
        $rootPath = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    } catch {
        return $false
    }

    return $candidatePath.Equals($rootPath, [System.StringComparison]::OrdinalIgnoreCase) -or
        $candidatePath.StartsWith($rootPath + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}

function Test-CommandMentionsRepo {
    param([string] $CommandLine)

    if ([string]::IsNullOrWhiteSpace($CommandLine)) {
        return $false
    }

    $repoA = $repoRoot.ToLowerInvariant()
    $repoB = $repoA.Replace('\', '/')
    $command = $CommandLine.ToLowerInvariant()
    return $command.Contains($repoA) -or $command.Contains($repoB)
}

function Test-LooksLikeRepoViteDevServer {
    param([string] $CommandLine)

    if (-not (Test-CommandMentionsRepo $CommandLine)) {
        return $false
    }

    $command = $CommandLine.ToLowerInvariant()
    if ($command.Contains("vitest") -or $command.Contains("vite build") -or $command.Contains("vite preview")) {
        return $false
    }

    return $command.Contains("vite --host") -or
        $command.Contains("vite.js --host") -or
        $command.Contains("vite --strictport") -or
        $command.Contains("npm run dev") -or
        ($command.Contains("node") -and $command.Contains("vite") -and $command.Contains("5173"))
}

function Stop-BlockingProcess {
    param(
        [object] $Process,
        [string] $Reason
    )

    $processId = [int] $Process.ProcessId
    if ($processId -eq $PID -or $seen.ContainsKey($processId)) {
        return
    }

    $seen[$processId] = $true
    $label = "$($Process.Name)#$processId"
    Write-Host "[pretauri:build] Stopping $label ($Reason)"

    try {
        Stop-Process -Id $processId -Force -ErrorAction Stop
        $stopped.Add("$label ($Reason)") | Out-Null
    } catch {
        Write-Warning "[pretauri:build] Failed to stop $label`: $($_.Exception.Message)"
    }
}

$processes = @(Get-CimInstance Win32_Process)

foreach ($process in $processes) {
    $name = [string] $process.Name
    $commandLine = [string] $process.CommandLine
    $exePath = [string] $process.ExecutablePath
    $lowerCommand = $commandLine.ToLowerInvariant()
    $lowerName = $name.ToLowerInvariant()

    if ((Test-IsUnderPath $exePath $targetRoot) -and $lowerName -in @("app.exe", "comic-manager.exe")) {
        Stop-BlockingProcess $process "running Tauri app under src-tauri\target"
        continue
    }

    if ($lowerName -eq "node.exe" -and (Test-LooksLikeRepoViteDevServer $commandLine)) {
        Stop-BlockingProcess $process "repo Vite dev server"
        continue
    }

    if ((Test-CommandMentionsRepo $commandLine) -and $lowerCommand.Contains("tauri") -and $lowerCommand.Contains(" dev")) {
        Stop-BlockingProcess $process "repo Tauri dev process"
        continue
    }
}

$listeners = @(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($processId in $listeners) {
    if (-not $processId -or $seen.ContainsKey([int] $processId)) {
        continue
    }

    $listener = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if (-not $listener) {
        continue
    }

    $listenerCommand = [string] $listener.CommandLine
    $listenerName = ([string] $listener.Name).ToLowerInvariant()
    $listenerLooksLikeRepoVite = Test-LooksLikeRepoViteDevServer $listenerCommand

    if ($listenerLooksLikeRepoVite) {
        Stop-BlockingProcess $listener "port 5173 listener"
    } else {
        Write-Host "[pretauri:build] Port 5173 is held by $($listener.Name)#$processId outside this repo; leaving it running."
    }
}

if ($stopped.Count -eq 0) {
    Write-Host "[pretauri:build] No running Tauri app or repo dev server found."
} else {
    Write-Host "[pretauri:build] Stopped $($stopped.Count) blocker(s)."
}
