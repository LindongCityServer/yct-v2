$ErrorActionPreference = "Stop"

function Get-YctRepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Get-YctPnpmCommand {
  # Resolve pnpm to a command that can be launched *directly*, never through a shell.
  #
  # pnpm ships as a family of launchers — `pnpm`, `pnpm.CMD`, `pnpm.ps1` — and on
  # Windows none of them is a real executable: every one is a thin wrapper that ends up
  # running the bundled `@pnpm/exe/pnpm.exe`. Two traps make the wrappers unusable here:
  #
  #   1. `.CMD` has to be launched through cmd.exe, and cmd.exe is destructive to the
  #      arguments. A workspace filter like `@yct/web` loses its `@` (which cmd treats as
  #      an echo-suppression sigil), so pnpm reports
  #      `No projects matched the filters` and exits 0 without doing any work.
  #   2. `pnpm` (no extension) and `pnpm.ps1` are shell scripts; `Start-Process` cannot
  #      run them at all.
  #
  # So: read whichever wrapper is on PATH, follow its `@pnpm/exe/pnpm.exe` reference, and
  # return that. Falling back to the wrapper keeps things working on installs that vendor
  # pnpm differently (e.g. a global npm install).
  $command = $null
  foreach ($candidate in @("pnpm.exe", "pnpm.cmd", "pnpm")) {
    $command = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($null -ne $command) {
      break
    }
  }
  if ($null -eq $command) {
    throw "pnpm was not found. Please ensure Node.js and pnpm are installed and available in PATH."
  }

  $resolved = Resolve-YctPnpmExecutable -Path $command.Source
  return $resolved
}

function Resolve-YctPnpmExecutable {
  param([Parameter(Mandatory = $true)][string]$Path)

  if ($Path -match "pnpm\.exe$") {
    return $Path
  }

  if (Test-Path -LiteralPath $Path) {
    # Every wrapper points at the bundled executable. Two shapes appear in practice:
    #   - an absolute path:   C:\...\@pnpm\exe\pnpm.exe
    #   - a relative path:    %~dp0\..\global\v11\<hash>\node_modules\@pnpm\exe\pnpm.exe
    #                         (%~dp0 is the wrapper's own directory)
    try {
      $content = [System.IO.File]::ReadAllText($Path)
      $candidate = $null

      $absolute = [regex]::Match($content, '[A-Za-z]:\\[^"''\r\n]*@pnpm[\\/]exe[\\/]pnpm\.exe')
      if ($absolute.Success) {
        $candidate = $absolute.Value
      } else {
        $relative = [regex]::Match($content, '%~dp0([^"''\r\n]*@pnpm[\\/]exe[\\/]pnpm\.exe)')
        if (-not $relative.Success) {
          $relative = [regex]::Match($content, '(?<!%~dp0)([^"''\r\n\s]*@pnpm[\\/]exe[\\/]pnpm\.exe)')
        }
        if ($relative.Success) {
          $suffix = $relative.Groups[1].Value
          $wrapperDir = Split-Path -Parent $Path
          $candidate = [System.IO.Path]::GetFullPath((Join-Path $wrapperDir $suffix))
        }
      }

      if ($candidate -and (Test-Path -LiteralPath $candidate)) {
        return $candidate
      }
    } catch {
      # Unreadable or binary — fall through to the wrapper path.
    }
  }

  return $Path
}

function Normalize-YctBasePath {
  param([string]$Value = "")

  $trimmed = ([string]$Value).Trim().TrimEnd("/")
  if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed -eq "/") {
    return ""
  }

  if ($trimmed.StartsWith("/")) {
    return $trimmed
  }

  return "/$trimmed"
}

function New-YctDevEnvCommandPrefix {
  param([string]$BasePath = "")

  $normalizedBasePath = Normalize-YctBasePath -Value $BasePath
  return @(
    "set `"YCT_BASE_PATH=$normalizedBasePath`"",
    "set `"NEXT_PUBLIC_YCT_BASE_PATH=$normalizedBasePath`""
  ) -join " && "
}

function Get-YctWebDevLogPaths {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [int]$Port = 3300
  )

  $logDir = Join-Path $Root ".next-dev-logs"
  return [pscustomobject]@{
    Directory = $logDir
    Output = Join-Path $logDir "next-$Port.out.log"
    Error = Join-Path $logDir "next-$Port.err.log"
    Meta = Join-Path $logDir "next-$Port.meta.json"
  }
}

function Get-YctWebDevPortOwners {
  param(
    [int]$Port = 3300,
    [string]$HostName = "127.0.0.1"
  )

  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($null -eq $connections) {
    return @()
  }

  $matched = $connections | Where-Object {
    $_.LocalAddress -eq $HostName -or
    $_.LocalAddress -eq "0.0.0.0" -or
    $_.LocalAddress -eq "::" -or
    $_.LocalAddress -eq "::1"
  }

  return @($matched | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Get-YctWebDevProcessInfo {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [int]$Port = 3300,
    [string]$HostName = "127.0.0.1"
  )

  $owners = Get-YctWebDevPortOwners -Port $Port -HostName $HostName
  $items = @()

  foreach ($ownerPid in $owners) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid" -ErrorAction SilentlyContinue
    if ($null -eq $process) {
      continue
    }

    $commandLine = [string]$process.CommandLine
    $isProjectProcess = $commandLine -like "*$Root*"
    $isNextProcess = $commandLine -like "*next*" -or $commandLine -like "*start-server.js*"

    $items += [pscustomobject]@{
      ProcessId = [int]$ownerPid
      Name = [string]$process.Name
      CommandLine = $commandLine
      IsYctCandidate = [bool]($isProjectProcess -and $isNextProcess)
    }
  }

  return @($items)
}

function Wait-YctWebDevPort {
  param(
    [int]$Port = 3300,
    [string]$HostName = "127.0.0.1",
    [int]$TimeoutSeconds = 45,
    [switch]$ExpectOpen
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $owners = Get-YctWebDevPortOwners -Port $Port -HostName $HostName
    $isOpen = @($owners).Count -gt 0

    if ($ExpectOpen -and $isOpen) {
      return $true
    }
    if (-not $ExpectOpen -and -not $isOpen) {
      return $true
    }

    Start-Sleep -Milliseconds 500
  }

  return $false
}

function Get-YctLogTail {
  param(
    [string]$Path,
    [int]$Lines = 40
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return @()
  }

  return @(Get-Content -LiteralPath $Path -Tail $Lines -Encoding UTF8 | ForEach-Object { [string]$_ })
}

function Clear-YctLogFile {
  param(
    [string]$Path,
    [int]$TimeoutSeconds = 10
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      Remove-Item -LiteralPath $Path -Force -ErrorAction Stop
      return
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  throw "Log file is still locked and cannot be cleared: $Path"
}

function Write-YctWebDevMeta {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][psobject]$Meta
  )

  $parent = Split-Path -Parent $Path
  if (-not [string]::IsNullOrWhiteSpace($parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }

  $json = $Meta | ConvertTo-Json -Depth 6
  # 用 `New-Object` 而不是 `[System.Text.UTF8Encoding]::new($false)`：
  # 后者是 PowerShell 7 才支持的「构造函数语法」，Windows PowerShell 5.1 会报
  # 「不支持方法调用」并让整个启动脚本解析失败。
  # 本机已装 Store 版 PowerShell 7.6.6，`web:dev:*` 入口走 `pwsh` 可正常工作；
  # 但 Meta 文件写入是公共路径，保持 5.1 兼容写法可以避免在只有 5.1 的机器上炸掉。
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, $utf8NoBom)
}

function Read-YctWebDevMeta {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  try {
    return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
  } catch {
    return $null
  }
}

function Clear-YctNextDevCache {
  param(
    [Parameter(Mandatory = $true)][string]$Root
  )

  $nextDevCache = Join-Path $Root ".next\dev"
  if (-not (Test-Path -LiteralPath $nextDevCache)) {
    return
  }

  $resolvedRoot = (Resolve-Path -LiteralPath $Root).Path.TrimEnd("\")
  $resolvedCache = (Resolve-Path -LiteralPath $nextDevCache).Path
  if (-not $resolvedCache.StartsWith("$resolvedRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clear Next dev cache outside repo root: $resolvedCache"
  }

  Remove-Item -LiteralPath $resolvedCache -Recurse -Force
}

function Clear-YctNextDevManifestCache {
  param(
    [Parameter(Mandatory = $true)][string]$Root
  )

  $candidatePaths = @(
    (Join-Path $Root ".next\dev\server\app\manifest.webmanifest")
  )

  $chunkDir = Join-Path $Root ".next\dev\server\chunks"
  if (Test-Path -LiteralPath $chunkDir) {
    $candidatePaths += @(
      Get-ChildItem -LiteralPath $chunkDir -Filter "*manifest_webmanifest_route*" -File -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty FullName
    )
  }

  $resolvedRoot = (Resolve-Path -LiteralPath $Root).Path.TrimEnd("\")
  foreach ($candidatePath in $candidatePaths) {
    if (-not (Test-Path -LiteralPath $candidatePath)) {
      continue
    }

    $resolvedPath = (Resolve-Path -LiteralPath $candidatePath).Path
    if (-not $resolvedPath.StartsWith("$resolvedRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to clear Next manifest cache outside repo root: $resolvedPath"
    }

    Remove-Item -LiteralPath $resolvedPath -Recurse -Force
  }
}
