[CmdletBinding(PositionalBinding = $false)]
param(
  [Parameter(Mandatory = $true)]
  [string]$TargetRoot,
  [string]$SourceRoot = "",
  [string]$BackupRoot = "",
  [string[]]$PersistentPaths = @(
    ".env",
    ".env.production",
    ".env.local",
    ".env.production.local",
    ".yct-data",
    "runtime-assets",
    "apps\\web\\public\\content-assets"
  ),
  [switch]$StartAfterDeploy,
  [int]$Port = 3300,
  [string]$HostName = "127.0.0.1",
  [string]$BasePath = "",
  [string]$NodePath = "",
  [switch]$AllowActiveListener
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

function Copy-YctIfExists {
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

  Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
}

function Get-YctPathSnapshot {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return [pscustomobject]@{
      Exists = $false
      Kind = "missing"
      FileCount = 0
      Bytes = 0L
      Digest = ""
    }
  }

  $item = Get-Item -LiteralPath $Path -Force
  if (-not $item.PSIsContainer) {
    return [pscustomobject]@{
      Exists = $true
      Kind = "file"
      FileCount = 1
      Bytes = [long]$item.Length
      Digest = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash
    }
  }

  $root = $item.FullName.TrimEnd("\")
  $rootPrefix = "$root\"
  $files = @(Get-ChildItem -LiteralPath $root -Recurse -Force -File | Sort-Object FullName)
  $manifest = [System.Text.StringBuilder]::new()
  $bytes = 0L
  foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($rootPrefix.Length).Replace("\", "/")
    $fileHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    $bytes += [long]$file.Length
    [void]$manifest.Append($relativePath).Append("`t").Append($file.Length).Append("`t").Append($fileHash).Append("`n")
  }

  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $digestBytes = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($manifest.ToString()))
    $digest = -join ($digestBytes | ForEach-Object { $_.ToString("X2") })
  } finally {
    $sha256.Dispose()
  }

  return [pscustomobject]@{
    Exists = $true
    Kind = "directory"
    FileCount = $files.Count
    Bytes = $bytes
    Digest = $digest
  }
}

function Assert-YctSnapshotsEqual {
  param(
    [Parameter(Mandatory = $true)]$Expected,
    [Parameter(Mandatory = $true)]$Actual,
    [Parameter(Mandatory = $true)][string]$Label
  )

  foreach ($property in @("Exists", "Kind", "FileCount", "Bytes", "Digest")) {
    if ($Expected.$property -ne $Actual.$property) {
      throw "Persistent data verification failed: $Label has a mismatched $property."
    }
  }
}

$effectiveSourceRoot = $SourceRoot
if ([string]::IsNullOrWhiteSpace($effectiveSourceRoot)) {
  $effectiveSourceRoot = $PSScriptRoot
}
if ([string]::IsNullOrWhiteSpace($effectiveSourceRoot) -and -not [string]::IsNullOrWhiteSpace($MyInvocation.MyCommand.Path)) {
  $effectiveSourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}
if ([string]::IsNullOrWhiteSpace($effectiveSourceRoot)) {
  throw "Cannot determine SourceRoot. Pass the extracted artifact directory explicitly with -SourceRoot."
}

$resolvedSourceRoot = Resolve-YctFullPath -Path $effectiveSourceRoot
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

if (-not $AllowActiveListener) {
  $activeListeners = @(
    [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
      Where-Object { $_.Port -eq $Port }
  )
  if ($activeListeners.Count -gt 0) {
    throw "Port $Port is still listening. Stop the web process and every runtime writer before deploying. Use -AllowActiveListener only when this listener is unrelated to the target."
  }
}

if (-not (Test-Path -LiteralPath $resolvedTargetRoot)) {
  New-Item -ItemType Directory -Force -Path $resolvedTargetRoot | Out-Null
}

if (Test-Path -LiteralPath $resolvedBackupRoot) {
  throw "BackupRoot already exists. Deployment stopped to avoid overwriting a previous backup: $resolvedBackupRoot"
}
New-Item -ItemType Directory -Path $resolvedBackupRoot | Out-Null

$existingDeploymentItems = @(Get-ChildItem -LiteralPath $resolvedTargetRoot -Force)
if ($existingDeploymentItems.Count -gt 0) {
  Copy-YctDirectoryChildren -Source $resolvedTargetRoot -Destination $resolvedBackupRoot
}

$persistentSnapshots = @{}
foreach ($relativePath in $PersistentPaths) {
  $source = Resolve-YctChildPath -Root $resolvedTargetRoot -RelativePath $relativePath
  $backup = Resolve-YctChildPath -Root $resolvedBackupRoot -RelativePath $relativePath
  $sourceSnapshot = Get-YctPathSnapshot -Path $source
  $persistentSnapshots[$relativePath] = $sourceSnapshot
  $backupSnapshot = Get-YctPathSnapshot -Path $backup
  Assert-YctSnapshotsEqual -Expected $sourceSnapshot -Actual $backupSnapshot -Label "$relativePath backup"
}

try {
  Get-ChildItem -LiteralPath $resolvedTargetRoot -Force | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Recurse -Force
  }

  Copy-YctDirectoryChildren -Source $resolvedSourceRoot -Destination $resolvedTargetRoot

  foreach ($relativePath in $PersistentPaths) {
    $backup = Resolve-YctChildPath -Root $resolvedBackupRoot -RelativePath $relativePath
    $destination = Resolve-YctChildPath -Root $resolvedTargetRoot -RelativePath $relativePath
    Copy-YctIfExists -Source $backup -Destination $destination
    $restoredSnapshot = Get-YctPathSnapshot -Path $destination
    Assert-YctSnapshotsEqual -Expected $persistentSnapshots[$relativePath] -Actual $restoredSnapshot -Label "$relativePath restore"
  }
} catch {
  $deploymentError = $_
  Write-Warning "Deployment replacement failed. Restoring the previous release and persistent data from $resolvedBackupRoot."
  try {
    Get-ChildItem -LiteralPath $resolvedTargetRoot -Force | ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }
    Copy-YctDirectoryChildren -Source $resolvedBackupRoot -Destination $resolvedTargetRoot
    foreach ($relativePath in $PersistentPaths) {
      $destination = Resolve-YctChildPath -Root $resolvedTargetRoot -RelativePath $relativePath
      $restoredSnapshot = Get-YctPathSnapshot -Path $destination
      Assert-YctSnapshotsEqual -Expected $persistentSnapshots[$relativePath] -Actual $restoredSnapshot -Label "$relativePath failure recovery"
    }
  } catch {
    Write-Warning "Automatic recovery failed: $($_.Exception.Message). The full backup remains at $resolvedBackupRoot. Stop all writers before restoring it manually."
  }
  throw $deploymentError
}

$envMergeScript = Join-Path $resolvedTargetRoot "merge-yct-env.ps1"
$envExamplePath = Join-Path $resolvedTargetRoot "ENVIRONMENT.example"
$targetEnvPath = Join-Path $resolvedTargetRoot ".env"
if (
  (Test-Path -LiteralPath $targetEnvPath -PathType Leaf) -and
  (Test-Path -LiteralPath $envMergeScript -PathType Leaf) -and
  (Test-Path -LiteralPath $envExamplePath -PathType Leaf)
) {
  & pwsh -NoProfile -ExecutionPolicy Bypass `
    -File $envMergeScript `
    -TargetEnv $targetEnvPath `
    -ExampleEnv $envExamplePath `
    -NoBackup
  if ($LASTEXITCODE -ne 0) {
    throw "Environment merge failed with exit code $LASTEXITCODE"
  }
}

Write-Host "Deployed YCT web artifact to $resolvedTargetRoot"
Write-Host "Persistent data restored and verified. Previous release snapshot retained at $resolvedBackupRoot"

$cliBasePath = if ([string]::IsNullOrWhiteSpace($BasePath)) { "/" } else { $BasePath }
$configCheckScript = Join-Path $resolvedTargetRoot "check-runtime-config.ps1"
if (Test-Path -LiteralPath $configCheckScript) {
  try {
    $configCheckJson = & pwsh -NoProfile -ExecutionPolicy Bypass -File $configCheckScript -BasePath $cliBasePath -Json
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
      Write-Warning "The derived ldpass public URL still points to a local address. Check .env overrides and stale process-manager environment variables before starting production."
    }

    if ($configCheck.warnings.Count -gt 0) {
      Write-Warning "Runtime configuration reported $($configCheck.warnings.Count) warning(s). Run .\\check-runtime-config.ps1 in the deployment root for details."
    }
  } catch {
    Write-Warning "Post-deploy runtime configuration check failed: $($_.Exception.Message)"
  }
}

if ($StartAfterDeploy) {
  $startScript = Join-Path $resolvedTargetRoot "start-yct-web.ps1"
  & pwsh -NoProfile -ExecutionPolicy Bypass -File $startScript -Port $Port -HostName $HostName -BasePath $cliBasePath -NodePath $NodePath
}
