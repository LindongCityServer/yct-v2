[CmdletBinding(PositionalBinding = $false)]
param(
  [string]$LiveRoot = "C:\wwwroot\yct-v2",
  [string]$CurrentReleaseRoot = "C:\wwwroot\yct-v2\yct-web-20260801-220810",
  [string]$RuntimeAssetRoot = "C:\wwwroot\yct-runtime\content-assets",
  [string]$BackupRoot = "",
  [string]$PublicSiteUrl = "https://yct.shangxiaoguan.top",
  [int]$WebPort = 3300,
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$expectedContentStoreHash = "ADB66A8213BF2557FED8D0F8650058416F7EE21670D57B0532E34CF973CD4E56"
$expectedAssetStoreHash = "FBA25357C4D977E64382D0D9433EDBDB665C8B5608F33424C67F17868F297FDA"
$expectedAssetFileCount = 1291
$expectedAssetBytes = 751117609L

function Resolve-YctFullPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  return [System.IO.Path]::GetFullPath($Path)
}

function Assert-YctMigrationPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  $resolved = Resolve-YctFullPath -Path $Path
  $trimmed = $resolved.TrimEnd("\")
  $root = [System.IO.Path]::GetPathRoot($trimmed).TrimEnd("\")
  if ($trimmed -in @($root, (Join-Path $root "wwwroot").TrimEnd("\"))) {
    throw "Refusing to use a broad migration path: $trimmed"
  }
}

function Assert-YctFileHash {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$ExpectedHash
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Required file does not exist: $Path"
  }

  $actualHash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
  if ($actualHash -ne $ExpectedHash) {
    throw "SHA256 mismatch: $Path`nExpected: $ExpectedHash`nActual:   $actualHash"
  }
}

function Get-YctDirectoryStats {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    return [pscustomobject]@{ Files = 0; Bytes = 0L }
  }

  $files = @(Get-ChildItem -LiteralPath $Path -Recurse -File)
  $bytes = if ($files.Count -gt 0) {
    [long](($files | Measure-Object -Property Length -Sum).Sum)
  } else {
    0L
  }

  return [pscustomobject]@{
    Files = $files.Count
    Bytes = $bytes
  }
}

function Assert-YctAssetStats {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)]$Stats
  )

  if ($Stats.Files -ne $expectedAssetFileCount -or $Stats.Bytes -ne $expectedAssetBytes) {
    throw "Content asset snapshot mismatch: $Path`nExpected: $expectedAssetFileCount files / $expectedAssetBytes bytes`nActual:   $($Stats.Files) files / $($Stats.Bytes) bytes"
  }
}

function Set-YctEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Key,
    [AllowEmptyString()][Parameter(Mandatory = $true)][string]$Value
  )

  $lines = @(
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
      Get-Content -LiteralPath $Path -Encoding UTF8
    }
  )
  $pattern = "^\s*$([regex]::Escape($Key))\s*="
  $found = $false
  $updated = foreach ($line in $lines) {
    if ($line -match $pattern) {
      if (-not $found) {
        "$Key=$Value"
        $found = $true
      }
      continue
    }
    $line
  }
  if (-not $found) {
    $updated = @($updated) + "$Key=$Value"
  }

  [System.IO.File]::WriteAllLines(
    $Path,
    [string[]]$updated,
    [System.Text.UTF8Encoding]::new($false)
  )
}

$resolvedLiveRoot = Resolve-YctFullPath -Path $LiveRoot
$resolvedReleaseRoot = Resolve-YctFullPath -Path $CurrentReleaseRoot
$resolvedAssetRoot = Resolve-YctFullPath -Path $RuntimeAssetRoot
$resolvedBackupRoot = if ([string]::IsNullOrWhiteSpace($BackupRoot)) {
  Join-Path (Split-Path -Parent $resolvedLiveRoot) "yct-migration-backup\$(Get-Date -Format yyyyMMdd-HHmmss)"
} else {
  Resolve-YctFullPath -Path $BackupRoot
}

foreach ($path in @($resolvedLiveRoot, $resolvedReleaseRoot, $resolvedAssetRoot, $resolvedBackupRoot)) {
  Assert-YctMigrationPath -Path $path
}

$envPath = Join-Path $resolvedLiveRoot ".env"
$contentStorePath = Join-Path $resolvedLiveRoot ".yct-data\content-store.json"
$assetStorePath = Join-Path $resolvedLiveRoot ".yct-data\content-asset-store.json"
$assetSourcePath = Join-Path $resolvedReleaseRoot "apps\web\public\content-assets"

Assert-YctFileHash -Path $contentStorePath -ExpectedHash $expectedContentStoreHash
Assert-YctFileHash -Path $assetStorePath -ExpectedHash $expectedAssetStoreHash

$contentSnapshot = Get-Content -LiteralPath $contentStorePath -Raw -Encoding UTF8 | ConvertFrom-Json
$statusSummary = @($contentSnapshot.records) |
  Group-Object { $_.revision.status } |
  Sort-Object Name |
  ForEach-Object { "$($_.Name)=$($_.Count)" }
$sourceAssetStats = Get-YctDirectoryStats -Path $assetSourcePath
$runtimeAssetStats = Get-YctDirectoryStats -Path $resolvedAssetRoot
$releaseStats = Get-YctDirectoryStats -Path $resolvedReleaseRoot
$liveDataStats = Get-YctDirectoryStats -Path (Join-Path $resolvedLiveRoot ".yct-data")
$runtimeSupportStats = Get-YctDirectoryStats -Path (Join-Path $resolvedLiveRoot "runtime-assets")

if ($sourceAssetStats.Files -gt 0) {
  Assert-YctAssetStats -Path $assetSourcePath -Stats $sourceAssetStats
} elseif ($runtimeAssetStats.Files -eq 0) {
  throw "Neither source nor runtime content assets are available. Checked: $assetSourcePath and $resolvedAssetRoot"
}
$runtimeAssetSnapshotReady =
  $runtimeAssetStats.Files -eq $expectedAssetFileCount -and
  $runtimeAssetStats.Bytes -eq $expectedAssetBytes
if ($runtimeAssetStats.Files -gt 0 -and -not $runtimeAssetSnapshotReady) {
  if ($sourceAssetStats.Files -eq 0) {
    throw "Runtime content assets are incomplete and the verified source is unavailable: $resolvedAssetRoot"
  }
  Write-Warning "Runtime content assets are incomplete. -Apply will resume copying from the verified source."
}

$releaseBackupBytes = [Math]::Max(0L, [long]$releaseStats.Bytes - [long]$sourceAssetStats.Bytes)
$assetCopyBytes = if ($runtimeAssetSnapshotReady) { 0L } else { [long]$sourceAssetStats.Bytes }
$estimatedBackupBytes =
  $releaseBackupBytes +
  [long]$liveDataStats.Bytes +
  [long]$runtimeSupportStats.Bytes +
  256MB
$estimatedAssetBytes = $assetCopyBytes + 256MB
$backupDrive = [System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot($resolvedBackupRoot))
$assetDrive = [System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot($resolvedAssetRoot))

Write-Output "YCT root migration preflight"
Write-Output "Live root: $resolvedLiveRoot"
Write-Output "Current release: $resolvedReleaseRoot"
Write-Output "Runtime content assets: $resolvedAssetRoot"
Write-Output "Content records: $(@($contentSnapshot.records).Count) ($($statusSummary -join ', '))"
Write-Output "Source assets: $($sourceAssetStats.Files) files / $($sourceAssetStats.Bytes) bytes"
Write-Output "Runtime assets: $($runtimeAssetStats.Files) files / $($runtimeAssetStats.Bytes) bytes"
Write-Output "Current release backup size: $($releaseStats.Files) files / $($releaseStats.Bytes) bytes"
if ($backupDrive.Name -eq $assetDrive.Name) {
  $estimatedRequiredBytes = $estimatedBackupBytes + $estimatedAssetBytes
  Write-Output "Estimated free space required on $($backupDrive.Name): $([Math]::Round($estimatedRequiredBytes / 1GB, 2)) GiB"
  Write-Output "Available on $($backupDrive.Name): $([Math]::Round($backupDrive.AvailableFreeSpace / 1GB, 2)) GiB"

  if ($backupDrive.AvailableFreeSpace -lt $estimatedRequiredBytes) {
    throw "Insufficient free space on $($backupDrive.Name). Free at least $([Math]::Round($estimatedRequiredBytes / 1GB, 2)) GiB before applying the migration."
  }
} else {
  Write-Output "Estimated backup space on $($backupDrive.Name): $([Math]::Round($estimatedBackupBytes / 1GB, 2)) GiB"
  Write-Output "Available on $($backupDrive.Name): $([Math]::Round($backupDrive.AvailableFreeSpace / 1GB, 2)) GiB"
  Write-Output "Estimated asset space on $($assetDrive.Name): $([Math]::Round($estimatedAssetBytes / 1GB, 2)) GiB"
  Write-Output "Available on $($assetDrive.Name): $([Math]::Round($assetDrive.AvailableFreeSpace / 1GB, 2)) GiB"

  if ($backupDrive.AvailableFreeSpace -lt $estimatedBackupBytes) {
    throw "Insufficient backup space on $($backupDrive.Name). Free at least $([Math]::Round($estimatedBackupBytes / 1GB, 2)) GiB before applying the migration."
  }
  if ($assetDrive.AvailableFreeSpace -lt $estimatedAssetBytes) {
    throw "Insufficient content asset space on $($assetDrive.Name). Free at least $([Math]::Round($estimatedAssetBytes / 1GB, 2)) GiB before applying the migration."
  }
}

if (-not $Apply) {
  Write-Output ""
  Write-Output "Preflight passed. No files were changed. Run again with -Apply to create the backup, copy assets, and update non-secret runtime paths."
  return
}

$activeListener = Get-NetTCPConnection -LocalPort $WebPort -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($activeListener) {
  throw "Port $WebPort is still listening (PID $($activeListener.OwningProcess)). Stop the YCT web process and all runtime-data writers before applying the migration."
}

if (Test-Path -LiteralPath $resolvedBackupRoot) {
  throw "Backup directory already exists: $resolvedBackupRoot"
}

New-Item -ItemType Directory -Force -Path $resolvedBackupRoot | Out-Null
foreach ($envFile in Get-ChildItem -LiteralPath $resolvedLiveRoot -Force -File | Where-Object { $_.Name -like ".env*" }) {
  Copy-Item -LiteralPath $envFile.FullName -Destination $resolvedBackupRoot -Force
}
foreach ($liveFile in Get-ChildItem -LiteralPath $resolvedLiveRoot -Force -File | Where-Object { $_.Name -notlike ".env*" }) {
  Copy-Item -LiteralPath $liveFile.FullName -Destination $resolvedBackupRoot -Force
}
Copy-Item -LiteralPath (Join-Path $resolvedLiveRoot ".yct-data") -Destination $resolvedBackupRoot -Recurse -Force
$runtimeAssetsPath = Join-Path $resolvedLiveRoot "runtime-assets"
if (Test-Path -LiteralPath $runtimeAssetsPath -PathType Container) {
  Copy-Item -LiteralPath $runtimeAssetsPath -Destination $resolvedBackupRoot -Recurse -Force
}

$releaseBackupPath = Join-Path $resolvedBackupRoot "previous-release\$([System.IO.Path]::GetFileName($resolvedReleaseRoot))"
New-Item -ItemType Directory -Force -Path $releaseBackupPath | Out-Null
& robocopy.exe $resolvedReleaseRoot $releaseBackupPath /E /COPY:DAT /DCOPY:DAT /R:2 /W:2 /XD $assetSourcePath /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -gt 7) {
  throw "Current release backup failed with robocopy exit code $LASTEXITCODE"
}

$nginxBackupRoot = Join-Path $resolvedBackupRoot "nginx"
$nginxVhostPath = "C:\BtSoft\nginx\conf\vhost\yct.shangxiaoguan.top.conf"
$nginxProxyRoot = "C:\BtSoft\nginx\conf\proxy\yct.shangxiaoguan.top"
New-Item -ItemType Directory -Force -Path $nginxBackupRoot | Out-Null
if (Test-Path -LiteralPath $nginxVhostPath -PathType Leaf) {
  Copy-Item -LiteralPath $nginxVhostPath -Destination $nginxBackupRoot -Force
}
if (Test-Path -LiteralPath $nginxProxyRoot -PathType Container) {
  Copy-Item -LiteralPath $nginxProxyRoot -Destination $nginxBackupRoot -Recurse -Force
}

if (-not $runtimeAssetSnapshotReady) {
  New-Item -ItemType Directory -Force -Path $resolvedAssetRoot | Out-Null
  & robocopy.exe $assetSourcePath $resolvedAssetRoot /E /COPY:DAT /DCOPY:DAT /R:2 /W:2 /NFL /NDL /NJH /NJS /NP
  if ($LASTEXITCODE -gt 7) {
    throw "robocopy failed with exit code $LASTEXITCODE"
  }
}

if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
  throw "Runtime environment file does not exist: $envPath"
}

$envMergeScript = Join-Path $PSScriptRoot "merge-yct-env.ps1"
if (-not (Test-Path -LiteralPath $envMergeScript -PathType Leaf)) {
  $envMergeScript = Join-Path $PSScriptRoot "merge-yct-env-example.ps1"
}
$envExamplePath = Join-Path $PSScriptRoot "ENVIRONMENT.example"
if (-not (Test-Path -LiteralPath $envExamplePath -PathType Leaf)) {
  $envExamplePath = Join-Path (Split-Path -Parent $PSScriptRoot) ".env.example"
}
if (
  (Test-Path -LiteralPath $envMergeScript -PathType Leaf) -and
  (Test-Path -LiteralPath $envExamplePath -PathType Leaf)
) {
  & powershell -NoProfile -ExecutionPolicy Bypass `
    -File $envMergeScript `
    -TargetEnv $envPath `
    -ExampleEnv $envExamplePath `
    -NoBackup
  if ($LASTEXITCODE -ne 0) {
    throw "Environment merge failed with exit code $LASTEXITCODE"
  }
}

Set-YctEnvValue -Path $envPath -Key "YCT_PUBLIC_SITE_URL" -Value $PublicSiteUrl.TrimEnd("/")
Set-YctEnvValue -Path $envPath -Key "YCT_BASE_PATH" -Value ""
Set-YctEnvValue -Path $envPath -Key "NEXT_PUBLIC_YCT_BASE_PATH" -Value ""
Set-YctEnvValue -Path $envPath -Key "YCT_CONTENT_STORE_PATH" -Value $contentStorePath
Set-YctEnvValue -Path $envPath -Key "YCT_CONTENT_ASSET_STORE_PATH" -Value $assetStorePath
Set-YctEnvValue -Path $envPath -Key "YCT_CONTENT_ASSET_UPLOAD_DIR" -Value $resolvedAssetRoot

$finalAssetStats = Get-YctDirectoryStats -Path $resolvedAssetRoot
Assert-YctAssetStats -Path $resolvedAssetRoot -Stats $finalAssetStats
Assert-YctFileHash -Path $contentStorePath -ExpectedHash $expectedContentStoreHash
Assert-YctFileHash -Path $assetStorePath -ExpectedHash $expectedAssetStoreHash

Write-Output ""
Write-Output "Preparation completed."
Write-Output "Backup: $resolvedBackupRoot"
Write-Output "Runtime content assets: $($finalAssetStats.Files) files / $($finalAssetStats.Bytes) bytes"
Write-Output "The ldpass secrets were not changed. The current release was copied to the backup directory for rollback."
