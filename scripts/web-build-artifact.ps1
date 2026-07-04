[CmdletBinding(PositionalBinding = $false)]
param(
  [string]$BasePath = $env:YCT_DEPLOY_BASE_PATH,
  [string]$OutputDir = "artifacts",
  [string]$StagingDir = ".deploy\web",
  [ValidateSet("zip", "tar.gz", "tar")]
  [string]$ArchiveFormat = "zip",
  [switch]$SkipBuild,
  [switch]$SkipStaging,
  [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "web-dev-common.ps1")

function Normalize-YctBasePath {
  param([string]$Value)

  $trimmed = ([string]$Value).Trim().TrimEnd("/")
  if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed -eq "/") {
    return ""
  }
  if ($trimmed.StartsWith("/")) {
    return $trimmed
  }
  return "/$trimmed"
}

function Resolve-YctOutputPath {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Path
  )

  if ([System.IO.Path]::IsPathRooted($Path)) {
    return [System.IO.Path]::GetFullPath($Path)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $Root $Path))
}

function Assert-YctPathInsideRoot {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Path,
    [switch]$AllowEqual
  )

  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd("\")
  $pathFull = [System.IO.Path]::GetFullPath($Path).TrimEnd("\")
  if ($AllowEqual -and $pathFull.Equals($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    return
  }
  if (-not $pathFull.StartsWith("$rootFull\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to operate outside repo root: $pathFull"
  }
}

function Remove-YctDirectoryInsideRoot {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Path
  )

  Assert-YctPathInsideRoot -Root $Root -Path $Path
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
}

function Copy-YctDirectoryChildren {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  if (-not (Test-Path -LiteralPath $Source)) {
    throw "Required deployment source does not exist: $Source"
  }

  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
  }
}

function Copy-YctPublicAssets {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  if (-not (Test-Path -LiteralPath $Source)) {
    return
  }

  $sourceFull = (Resolve-Path -LiteralPath $Source).Path.TrimEnd("\")
  $sourcePrefix = "$sourceFull\"
  Get-ChildItem -LiteralPath $sourceFull -Recurse -Force | ForEach-Object {
    $relativePath = $_.FullName.Substring($sourcePrefix.Length)
    if (-not ($relativePath -eq "content-assets" -or $relativePath.StartsWith("content-assets\"))) {
      $targetPath = Join-Path $Destination $relativePath
      if ($_.PSIsContainer) {
        New-Item -ItemType Directory -Force -Path $targetPath | Out-Null
      } else {
        $targetParent = Split-Path -Parent $targetPath
        New-Item -ItemType Directory -Force -Path $targetParent | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $targetPath -Force
      }
    }
  }
}

function Resolve-YctLinkedPath {
  param(
    [Parameter(Mandatory = $true)][System.IO.FileSystemInfo]$Item
  )

  if ($Item.LinkType -and $Item.Target) {
    $target = @($Item.Target)[0]
    if (-not [System.IO.Path]::IsPathRooted($target)) {
      $target = Join-Path $Item.DirectoryName $target
    }
    return (Resolve-Path -LiteralPath $target).Path
  }

  return $Item.FullName
}

function Copy-YctNodeModuleEntry {
  param(
    [Parameter(Mandatory = $true)][System.IO.FileSystemInfo]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  $actualSource = Resolve-YctLinkedPath -Item $Source
  if (Test-Path -LiteralPath $Destination) {
    Remove-Item -LiteralPath $Destination -Recurse -Force
  }
  $destinationParent = Split-Path -Parent $Destination
  New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
  Copy-Item -LiteralPath $actualSource -Destination $Destination -Recurse -Force
}

function Copy-YctNextRuntimeDependencies {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$DestinationNodeModules
  )

  $pnpmRoot = Join-Path $Root "node_modules\.pnpm"
  $nextNodeModules = $null
  if (Test-Path -LiteralPath $pnpmRoot) {
    $nextNodeModules = Get-ChildItem -LiteralPath $pnpmRoot -Directory -Filter "next@*" -ErrorAction SilentlyContinue |
      ForEach-Object { Join-Path $_.FullName "node_modules" } |
      Where-Object { Test-Path -LiteralPath (Join-Path $_ "next\package.json") } |
      Select-Object -First 1
  }

  if (-not $nextNodeModules) {
    throw "Cannot find pnpm next package node_modules. Run pnpm install before building the artifact."
  }

  New-Item -ItemType Directory -Force -Path $DestinationNodeModules | Out-Null
  Get-ChildItem -LiteralPath $nextNodeModules -Force | Where-Object { $_.Name -ne "next" } | ForEach-Object {
    if ($_.Name.StartsWith("@")) {
      $scopeDestination = Join-Path $DestinationNodeModules $_.Name
      New-Item -ItemType Directory -Force -Path $scopeDestination | Out-Null
      Get-ChildItem -LiteralPath $_.FullName -Force | ForEach-Object {
        Copy-YctNodeModuleEntry -Source $_ -Destination (Join-Path $scopeDestination $_.Name)
      }
    } else {
      Copy-YctNodeModuleEntry -Source $_ -Destination (Join-Path $DestinationNodeModules $_.Name)
    }
  }
}

function Write-YctUtf8File {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Get-YctCleanUrlPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  return ($Path -split "[?#]", 2)[0]
}

function Test-YctPathStartsWith {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Prefix
  )

  return $Path.Equals($Prefix, [System.StringComparison]::OrdinalIgnoreCase) -or
    $Path.StartsWith("$Prefix/", [System.StringComparison]::OrdinalIgnoreCase)
}

function Convert-YctUrlPathToStagedPath {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$WebRoot,
    [Parameter(Mandatory = $true)][string]$BasePath
  )

  $cleanPath = Get-YctCleanUrlPath -Path $Path
  $pathWithoutBase = $cleanPath
  if ($BasePath -and (Test-YctPathStartsWith -Path $cleanPath -Prefix $BasePath)) {
    $pathWithoutBase = $cleanPath.Substring($BasePath.Length)
    if (-not $pathWithoutBase) {
      $pathWithoutBase = "/"
    }
  }

  if ($pathWithoutBase.StartsWith("/_next/static/", [System.StringComparison]::OrdinalIgnoreCase)) {
    $relativePath = $pathWithoutBase.Substring("/_next/static/".Length).Replace("/", "\")
    return Join-Path (Join-Path $WebRoot ".next\static") $relativePath
  }

  if (
    $pathWithoutBase.StartsWith("/icons/", [System.StringComparison]::OrdinalIgnoreCase) -or
    $pathWithoutBase -eq "/manifest.webmanifest" -or
    $pathWithoutBase -eq "/sw.js"
  ) {
    $relativePath = $pathWithoutBase.TrimStart("/").Replace("/", "\")
    return Join-Path (Join-Path $WebRoot "public") $relativePath
  }

  return $null
}

function Assert-YctStagedWebAssetConsistency {
  param(
    [Parameter(Mandatory = $true)][string]$StageRoot,
    [Parameter(Mandatory = $true)][string]$BasePath
  )

  $webRoot = Join-Path $StageRoot "apps\web"
  $serverRoot = Join-Path $webRoot ".next\server"
  if (-not (Test-Path -LiteralPath $serverRoot)) {
    throw "Staged Next server output is missing: $serverRoot"
  }

  $referencePattern = [regex]'(?<path>/(?:[A-Za-z0-9._~!$&''()*+,;=:@%/-]+))'
  $serverFiles = Get-ChildItem -LiteralPath $serverRoot -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in @(".html", ".rsc") }
  $referencedPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  $basePathViolations = [System.Collections.Generic.List[string]]::new()
  $missingAssets = [System.Collections.Generic.List[string]]::new()

  foreach ($file in $serverFiles) {
    $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
    foreach ($match in $referencePattern.Matches($content)) {
      $rawPath = $match.Groups["path"].Value
      $cleanPath = Get-YctCleanUrlPath -Path $rawPath
      $isStaticOrPublicAsset =
        $cleanPath.StartsWith("/_next/static/", [System.StringComparison]::OrdinalIgnoreCase) -or
        $cleanPath.StartsWith("/icons/", [System.StringComparison]::OrdinalIgnoreCase) -or
        $cleanPath -eq "/manifest.webmanifest" -or
        $cleanPath -eq "/sw.js" -or
        ($BasePath -and (Test-YctPathStartsWith -Path $cleanPath -Prefix $BasePath))

      if (-not $isStaticOrPublicAsset) {
        continue
      }

      if ($BasePath) {
        $hasBasePath = Test-YctPathStartsWith -Path $cleanPath -Prefix $BasePath
        $isRootMountedAsset =
          $cleanPath.StartsWith("/_next/static/", [System.StringComparison]::OrdinalIgnoreCase) -or
          $cleanPath.StartsWith("/icons/", [System.StringComparison]::OrdinalIgnoreCase) -or
          $cleanPath -eq "/manifest.webmanifest" -or
          $cleanPath -eq "/sw.js"
        if ($isRootMountedAsset -and -not $hasBasePath) {
          $basePathViolations.Add("$cleanPath in $($file.FullName)") | Out-Null
          continue
        }
      }

      [void]$referencedPaths.Add($cleanPath)
    }
  }

  foreach ($path in $referencedPaths) {
    $assetPath = Convert-YctUrlPathToStagedPath -Path $path -WebRoot $webRoot -BasePath $BasePath
    if ($assetPath -and -not (Test-Path -LiteralPath $assetPath)) {
      $missingAssets.Add("$path -> $assetPath") | Out-Null
    }
  }

  if ($basePathViolations.Count -gt 0) {
    $sample = ($basePathViolations | Select-Object -First 8) -join [Environment]::NewLine
    throw "Staged output contains root-mounted asset links while BasePath is '$BasePath':$([Environment]::NewLine)$sample"
  }

  if ($missingAssets.Count -gt 0) {
    $sample = ($missingAssets | Select-Object -First 12) -join [Environment]::NewLine
    throw "Staged output references assets that are not included in the deployment bundle:$([Environment]::NewLine)$sample"
  }
}

$root = Get-YctRepoRoot
$basePathValue = Normalize-YctBasePath -Value $BasePath
$webRoot = Join-Path $root "apps\web"
$nextRoot = Join-Path $webRoot ".next"
$standaloneRoot = Join-Path $nextRoot "standalone"
$staticRoot = Join-Path $nextRoot "static"
$publicRoot = Join-Path $webRoot "public"
$stageRoot = Resolve-YctOutputPath -Root $root -Path $StagingDir
$outputRoot = Resolve-YctOutputPath -Root $root -Path $OutputDir

Assert-YctPathInsideRoot -Root $root -Path $stageRoot
Assert-YctPathInsideRoot -Root $root -Path $outputRoot

if (-not $SkipBuild) {
  $pnpm = Get-YctPnpmCommand
  $previousPublicBasePath = $env:NEXT_PUBLIC_YCT_BASE_PATH
  $previousServerBasePath = $env:YCT_BASE_PATH
  try {
    $env:NEXT_PUBLIC_YCT_BASE_PATH = $basePathValue
    $env:YCT_BASE_PATH = $basePathValue
    & $pnpm --filter "@yct/web" build
    if ($LASTEXITCODE -ne 0) {
      throw "Next.js build failed with exit code $LASTEXITCODE."
    }
  } finally {
    $env:NEXT_PUBLIC_YCT_BASE_PATH = $previousPublicBasePath
    $env:YCT_BASE_PATH = $previousServerBasePath
  }
}

if ($SkipStaging -and -not $SkipBuild) {
  throw "-SkipStaging requires -SkipBuild so the artifact cannot accidentally package stale staging after a fresh build."
}

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

if ($SkipStaging) {
  $stagedServerPath = Join-Path $stageRoot "apps\web\server.js"
  if (-not (Test-Path -LiteralPath $stagedServerPath)) {
    throw "Staging directory is missing or incomplete: $stageRoot"
  }
} else {
  if (-not (Test-Path -LiteralPath $standaloneRoot)) {
    throw "Standalone output is missing. Check apps/web/next.config.mjs output: 'standalone'."
  }
  if (-not (Test-Path -LiteralPath $staticRoot)) {
    throw "Next static output is missing: $staticRoot"
  }

  Remove-YctDirectoryInsideRoot -Root $root -Path $stageRoot
  New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null

  Copy-YctDirectoryChildren -Source $standaloneRoot -Destination $stageRoot

  $standaloneWebRoot = Join-Path $stageRoot "apps\web"
  $standaloneNextRoot = Join-Path $standaloneWebRoot ".next"
  $standaloneWebNodeModules = Join-Path $standaloneWebRoot "node_modules"
  New-Item -ItemType Directory -Force -Path $standaloneNextRoot | Out-Null
  Copy-Item -LiteralPath $staticRoot -Destination $standaloneNextRoot -Recurse -Force
  Copy-YctPublicAssets -Source $publicRoot -Destination (Join-Path $standaloneWebRoot "public")
  Copy-YctNextRuntimeDependencies -Root $root -DestinationNodeModules $standaloneWebNodeModules

  $startScript = @"
param(
  [int]`$Port = 3300,
  [string]`$HostName = "127.0.0.1",
  [string]`$BasePath = "$basePathValue",
  [string]`$NodePath = ""
)

`$ErrorActionPreference = "Stop"

`$serverPath = Join-Path `$PSScriptRoot "apps\web\server.js"
if (-not (Test-Path -LiteralPath `$serverPath)) {
  throw "Cannot find standalone server: `$serverPath"
}

`$normalizedBasePath = `$BasePath.Trim().TrimEnd("/")
if (`$normalizedBasePath -eq "/") {
  `$normalizedBasePath = ""
}
if (`$normalizedBasePath -and -not `$normalizedBasePath.StartsWith("/")) {
  `$normalizedBasePath = "/`$normalizedBasePath"
}

`$env:PORT = [string]`$Port
`$env:HOSTNAME = `$HostName
`$env:YCT_BASE_PATH = `$normalizedBasePath
`$env:NEXT_PUBLIC_YCT_BASE_PATH = `$normalizedBasePath

`$nodeCommand = if (`$NodePath) { `$NodePath } else { "node" }
& `$nodeCommand `$serverPath
"@

  $startBasePathArgument = $basePathValue.TrimStart("/")

  $deploymentNotes = @"
Yuchengtong web standalone deployment

Build base path: $basePathValue
Required Node.js: >=20.9.0. The current repository uses Next.js 16, so Node.js 18.6.0 on the server should be upgraded before running this bundle.

Start command example:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\start-yct-web.ps1 -Port 3300 -HostName 127.0.0.1 -BasePath "$startBasePathArgument" -NodePath "C:\node-v22\node.exe"

Notes:
- Do not upload local .env files or .yct-data into this bundle.
- Keep server-side runtime stores, uploaded content assets, logs, and backups outside the deployment directory.
- If the reverse proxy is mounted at /v2, build and start with BasePath /v2. If it is mounted at the site root later, rebuild with an empty BasePath.
- Stop the old process before deployment and unpack this bundle into an empty deployment directory, or clean the old standalone files first. Do not merge it over an old .next directory: server.js, .next/server, and .next/static must come from the same build.
- After deployment, /v2/map, /v2/api/map/markers, and the /v2/_next/static assets referenced by the page HTML should all return 200.
"@

  Write-YctUtf8File -Path (Join-Path $stageRoot "start-yct-web.ps1") -Content $startScript
  Write-YctUtf8File -Path (Join-Path $stageRoot "DEPLOYMENT.txt") -Content $deploymentNotes
}

Assert-YctStagedWebAssetConsistency -StageRoot $stageRoot -BasePath $basePathValue

if ($ValidateOnly) {
  $result = [pscustomobject]@{
    ValidationOnly = $true
    StagingDirectory = $stageRoot
    SkippedStaging = [bool]$SkipStaging
    BasePath = $basePathValue
    StartScript = "start-yct-web.ps1"
    NodeRequirement = ">=20.9.0"
  }

  Write-Output ($result | ConvertTo-Json -Depth 4)
  return
}

$tar = Get-Command tar.exe -ErrorAction SilentlyContinue
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$artifactPath = Join-Path $outputRoot "yct-web-$timestamp.$ArchiveFormat"
$temporaryArtifactPath = Join-Path $outputRoot "yct-web-$timestamp.tmp.$ArchiveFormat"

if (Test-Path -LiteralPath $artifactPath) {
  Remove-Item -LiteralPath $artifactPath -Force
}
if (Test-Path -LiteralPath $temporaryArtifactPath) {
  Remove-Item -LiteralPath $temporaryArtifactPath -Force
}

try {
  if ($ArchiveFormat -eq "tar.gz") {
    if ($null -eq $tar) {
      throw "tar.exe is required to create a tar.gz deployment artifact."
    }
    & $tar.Source -czf $temporaryArtifactPath -C $stageRoot .
    if ($LASTEXITCODE -ne 0) {
      throw "tar.exe failed to create deployment artifact with exit code $LASTEXITCODE."
    }
  } elseif ($ArchiveFormat -eq "tar") {
    if ($null -eq $tar) {
      throw "tar.exe is required to create a tar deployment artifact."
    }
    & $tar.Source -cf $temporaryArtifactPath -C $stageRoot .
    if ($LASTEXITCODE -ne 0) {
      throw "tar.exe failed to create deployment artifact with exit code $LASTEXITCODE."
    }
  } elseif ($null -ne $tar) {
    & $tar.Source -a -cf $temporaryArtifactPath -C $stageRoot .
    if ($LASTEXITCODE -ne 0) {
      throw "tar.exe failed to create deployment artifact with exit code $LASTEXITCODE."
    }
  } else {
    Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $temporaryArtifactPath -CompressionLevel Optimal
  }

  Move-Item -LiteralPath $temporaryArtifactPath -Destination $artifactPath -Force
} catch {
  if (Test-Path -LiteralPath $temporaryArtifactPath) {
    Remove-Item -LiteralPath $temporaryArtifactPath -Force -ErrorAction SilentlyContinue
  }
  throw
}

$result = [pscustomobject]@{
  Artifact = $artifactPath
  ArchiveFormat = $ArchiveFormat
  StagingDirectory = $stageRoot
  SkippedStaging = [bool]$SkipStaging
  BasePath = $basePathValue
  StartScript = "start-yct-web.ps1"
  NodeRequirement = ">=20.9.0"
}

Write-Output ($result | ConvertTo-Json -Depth 4)
