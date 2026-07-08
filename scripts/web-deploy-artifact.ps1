[CmdletBinding(PositionalBinding = $false)]
param(
  [Parameter(Mandatory = $true)]
  [string]$TargetRoot,
  [string]$SourceRoot = $PSScriptRoot,
  [string]$BackupRoot = "",
  [string[]]$PersistentPaths = @(
    ".env",
    ".env.production",
    ".env.local",
    ".env.production.local",
    ".yct-data",
    "apps\\web\\public\\content-assets"
  ),
  [switch]$StartAfterDeploy,
  [int]$Port = 3300,
  [string]$HostName = "127.0.0.1",
  [string]$BasePath = "",
  [string]$NodePath = ""
)

$ErrorActionPreference = "Stop"

function Resolve-YctFullPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  return [System.IO.Path]::GetFullPath($Path)
}

function Convert-YctPathKey {
  param([Parameter(Mandatory = $true)][string]$Path)

  return (Resolve-YctFullPath -Path $Path).TrimEnd("\").ToUpperInvariant()
}

function Test-YctSamePath {
  param(
    [Parameter(Mandatory = $true)][string]$Left,
    [Parameter(Mandatory = $true)][string]$Right
  )

  return (Convert-YctPathKey -Path $Left) -eq (Convert-YctPathKey -Path $Right)
}

function Test-YctPathInside {
  param(
    [Parameter(Mandatory = $true)][string]$Parent,
    [Parameter(Mandatory = $true)][string]$Child
  )

  $parentKey = (Convert-YctPathKey -Path $Parent).TrimEnd("\")
  $childKey = (Convert-YctPathKey -Path $Child).TrimEnd("\")
  return $childKey.StartsWith("$parentKey\")
}

function Assert-YctSafeDeploymentRoot {
  param([Parameter(Mandatory = $true)][string]$Path)

  $fullPath = Resolve-YctFullPath -Path $Path
  $trimmed = $fullPath.TrimEnd("\")
  $root = [System.IO.Path]::GetPathRoot($trimmed).TrimEnd("\")
  $dangerousPaths = @(
    $root,
    (Join-Path $root "Users").TrimEnd("\"),
    (Join-Path $root "Windows").TrimEnd("\"),
    (Join-Path $root "Program Files").TrimEnd("\"),
    (Join-Path $root "Program Files (x86)").TrimEnd("\"),
    (Join-Path $root "wwwroot").TrimEnd("\")
  ) | Select-Object -Unique

  if ($dangerousPaths -contains $trimmed) {
    throw "Refusing to operate on a dangerous root path: $trimmed"
  }
}

function Assert-YctRelativePersistentPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path)) {
    throw "PersistentPaths cannot contain an empty entry."
  }
  if ([System.IO.Path]::IsPathRooted($Path)) {
    throw "PersistentPaths must be relative paths: $Path"
  }

  $normalized = $Path.Replace("/", "\")
  foreach ($segment in ($normalized -split "\\")) {
    if ($segment -eq "..") {
      throw "PersistentPaths cannot escape the deployment root: $Path"
    }
  }
}

function Resolve-YctChildPath {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$RelativePath
  )

  Assert-YctRelativePersistentPath -Path $RelativePath
  $combined = Resolve-YctFullPath -Path (Join-Path $Root $RelativePath)
  if (-not (Test-YctSamePath -Left $combined -Right $Root) -and -not (Test-YctPathInside -Parent $Root -Child $combined)) {
    throw "Resolved path escapes the root: $RelativePath -> $combined"
  }
  return $combined
}

function Copy-YctDirectoryChildren {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
  }
}

function Move-YctIfExists {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  if (-not (Test-Path -LiteralPath $Source)) {
    return
  }

  $destinationParent = Split-Path -Parent $Destination
  if (-not [string]::IsNullOrWhiteSpace($destinationParent)) {
    New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
  }

  if (Test-Path -LiteralPath $Destination) {
    Remove-Item -LiteralPath $Destination -Recurse -Force
  }

  Move-Item -LiteralPath $Source -Destination $Destination -Force
}

$resolvedSourceRoot = Resolve-YctFullPath -Path $SourceRoot
$resolvedTargetRoot = Resolve-YctFullPath -Path $TargetRoot

Assert-YctSafeDeploymentRoot -Path $resolvedTargetRoot

if (Test-YctSamePath -Left $resolvedSourceRoot -Right $resolvedTargetRoot) {
  throw "SourceRoot and TargetRoot must be different. Extract the new artifact to a separate folder before running deploy-yct-web.ps1."
}
if (Test-YctPathInside -Parent $resolvedSourceRoot -Child $resolvedTargetRoot) {
  throw "TargetRoot cannot be inside SourceRoot. Use a sibling deployment directory instead."
}
if (Test-YctPathInside -Parent $resolvedTargetRoot -Child $resolvedSourceRoot) {
  throw "SourceRoot cannot be inside TargetRoot. Extract the new artifact outside the live deployment directory."
}

$sourceStartScript = Join-Path $resolvedSourceRoot "start-yct-web.ps1"
$sourceServer = Join-Path $resolvedSourceRoot "apps\\web\\server.js"
if (-not (Test-Path -LiteralPath $sourceStartScript) -or -not (Test-Path -LiteralPath $sourceServer)) {
  throw "SourceRoot does not look like an extracted YCT web artifact: $resolvedSourceRoot"
}

if ([string]::IsNullOrWhiteSpace($BackupRoot)) {
  $resolvedBackupRoot = "$resolvedTargetRoot-backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
} else {
  $resolvedBackupRoot = Resolve-YctFullPath -Path $BackupRoot
}

Assert-YctSafeDeploymentRoot -Path $resolvedBackupRoot

if (
  (Test-YctSamePath -Left $resolvedBackupRoot -Right $resolvedSourceRoot) -or
  (Test-YctSamePath -Left $resolvedBackupRoot -Right $resolvedTargetRoot)
) {
  throw "BackupRoot must be different from both SourceRoot and TargetRoot."
}
if (Test-YctPathInside -Parent $resolvedTargetRoot -Child $resolvedBackupRoot) {
  throw "BackupRoot cannot be placed inside TargetRoot, otherwise it would be deleted during deployment."
}
if (Test-YctPathInside -Parent $resolvedSourceRoot -Child $resolvedBackupRoot) {
  throw "BackupRoot cannot be placed inside SourceRoot."
}

if (-not (Test-Path -LiteralPath $resolvedTargetRoot)) {
  New-Item -ItemType Directory -Force -Path $resolvedTargetRoot | Out-Null
}

New-Item -ItemType Directory -Force -Path $resolvedBackupRoot | Out-Null

foreach ($relativePath in $PersistentPaths) {
  $source = Resolve-YctChildPath -Root $resolvedTargetRoot -RelativePath $relativePath
  $backup = Resolve-YctChildPath -Root $resolvedBackupRoot -RelativePath $relativePath
  Move-YctIfExists -Source $source -Destination $backup
}

Get-ChildItem -LiteralPath $resolvedTargetRoot -Force | ForEach-Object {
  Remove-Item -LiteralPath $_.FullName -Recurse -Force
}

Copy-YctDirectoryChildren -Source $resolvedSourceRoot -Destination $resolvedTargetRoot

foreach ($relativePath in $PersistentPaths) {
  $backup = Resolve-YctChildPath -Root $resolvedBackupRoot -RelativePath $relativePath
  $destination = Resolve-YctChildPath -Root $resolvedTargetRoot -RelativePath $relativePath
  Move-YctIfExists -Source $backup -Destination $destination
}

Write-Host "Deployed YCT web artifact to $resolvedTargetRoot"
Write-Host "Persistent data restored from $resolvedBackupRoot"

$configCheckScript = Join-Path $resolvedTargetRoot "check-runtime-config.ps1"
if (Test-Path -LiteralPath $configCheckScript) {
  try {
    $configCheckJson = & powershell -NoProfile -ExecutionPolicy Bypass -File $configCheckScript -BasePath $BasePath -Json
    if ($LASTEXITCODE -ne 0) {
      throw "check-runtime-config.ps1 exited with code $LASTEXITCODE."
    }

    $configCheck = $configCheckJson | ConvertFrom-Json
    $derivedCallbackUrl = [string]$configCheck.derived.callbackUrl
    $siteUrlSource = [string]$configCheck.resolvedKeys.YCT_PUBLIC_SITE_URL.source
    $siteUrlValue = [string]$configCheck.resolvedKeys.YCT_PUBLIC_SITE_URL.value

    Write-Host ""
    Write-Host "Post-deploy runtime summary:"
    Write-Host "- BasePath: $($configCheck.derived.basePath)"
    Write-Host "- Site URL: $siteUrlValue (source: $siteUrlSource)"
    Write-Host "- Callback URL: $derivedCallbackUrl"

    if (
      $derivedCallbackUrl -match '^https?://(?:localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0)(?::\\d+)?(?:/|$)' -or
      $siteUrlValue -match '^https?://(?:localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0)(?::\\d+)?(?:/|$)'
    ) {
      Write-Warning "当前部署目录推导出的 ldpass 公开地址仍指向本机地址。登录后回跳很可能继续落到 localhost/127.0.0.1。请优先检查目标目录内的 .env / .env.local / .env.production.local，以及进程管理器是否仍残留旧环境变量。"
    }

    if ($configCheck.warnings.Count -gt 0) {
      Write-Warning "检测到 $($configCheck.warnings.Count) 条运行时配置警告，可在部署目录手动运行 .\\check-runtime-config.ps1 查看详情。"
    }
  } catch {
    Write-Warning "无法完成部署后运行时配置自检：$($_.Exception.Message)"
  }
}

if ($StartAfterDeploy) {
  $startScript = Join-Path $resolvedTargetRoot "start-yct-web.ps1"
  & powershell -NoProfile -ExecutionPolicy Bypass -File $startScript -Port $Port -HostName $HostName -BasePath $BasePath -NodePath $NodePath
}
