$ErrorActionPreference = "Stop"

function Get-YctRepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Get-YctPnpmCommand {
  $command = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    $command = Get-Command pnpm -ErrorAction SilentlyContinue
  }
  if ($null -eq $command) {
    throw "pnpm was not found. Please ensure Node.js and pnpm are installed and available in PATH."
  }
  return $command.Source
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
