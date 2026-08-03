[CmdletBinding(PositionalBinding = $false)]
param(
  [AllowEmptyString()]
  [string]$BasePath = $env:YCT_DEPLOY_BASE_PATH,
  [string]$OutputDir = "artifacts",
  [string]$StagingDir = ".deploy\web",
  [ValidateSet("zip", "tar.gz", "tar")]
  [string]$ArchiveFormat = "zip",
  [string]$SevenZipPath = $env:YCT_7Z_PATH,
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

function Normalize-YctBuildId {
  param([string]$Value)

  $trimmed = ([string]$Value).Trim()
  if ([string]::IsNullOrWhiteSpace($trimmed)) {
    return Get-Date -Format "yyyyMMdd-HHmmss"
  }

  $normalized = $trimmed -replace "[^A-Za-z0-9._-]", "-"
  $normalized = $normalized.Trim("-")
  if ([string]::IsNullOrWhiteSpace($normalized)) {
    return Get-Date -Format "yyyyMMdd-HHmmss"
  }

  return $normalized
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

function Resolve-YctSevenZipPath {
  param([string]$Path)

  $candidates = @()
  if (-not [string]::IsNullOrWhiteSpace($Path)) {
    $candidates += $Path
  }

  $command = Get-Command 7z.exe -ErrorAction SilentlyContinue
  if ($command) {
    $candidates += $command.Source
  }

  $programFiles = [Environment]::GetFolderPath("ProgramFiles")
  $programFilesX86 = [Environment]::GetFolderPath("ProgramFilesX86")
  if (-not [string]::IsNullOrWhiteSpace($programFiles)) {
    $candidates += (Join-Path $programFiles "7-Zip\7z.exe")
  }
  if (-not [string]::IsNullOrWhiteSpace($programFilesX86)) {
    $candidates += (Join-Path $programFilesX86 "7-Zip\7z.exe")
  }

  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  return $null
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

function Remove-YctRuntimeEnvironmentFiles {
  param([Parameter(Mandatory = $true)][string]$StageRoot)

  $forbiddenNames = @(".env", ".env.production", ".env.local", ".env.production.local")
  Get-ChildItem -LiteralPath $StageRoot -Recurse -Force -File |
    Where-Object { $_.Name -in $forbiddenNames } |
    ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Force
    }
}

function Assert-YctNoRuntimeEnvironmentFiles {
  param([Parameter(Mandatory = $true)][string]$StageRoot)

  $forbiddenNames = @(".env", ".env.production", ".env.local", ".env.production.local")
  $forbiddenFiles = @(
    Get-ChildItem -LiteralPath $StageRoot -Recurse -Force -File |
      Where-Object { $_.Name -in $forbiddenNames }
  )
  if ($forbiddenFiles.Count -gt 0) {
    $relativePaths = $forbiddenFiles |
      ForEach-Object { [System.IO.Path]::GetRelativePath($StageRoot, $_.FullName) }
    throw "Deployment staging contains runtime environment files: $($relativePaths -join ', ')"
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

function Copy-YctMaterialRendererRuntimeDependencies {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$DestinationNodeModules
  )

  $sourceScope = Join-Path $Root "apps\web\node_modules\@resvg"
  if (-not (Test-Path -LiteralPath $sourceScope)) {
    throw "Cannot find @resvg runtime dependency. Run pnpm install before building the artifact."
  }

  $destinationScope = Join-Path $DestinationNodeModules "@resvg"
  New-Item -ItemType Directory -Force -Path $destinationScope | Out-Null
  Get-ChildItem -LiteralPath $sourceScope -Force | ForEach-Object {
    Copy-YctNodeModuleEntry -Source $_ -Destination (Join-Path $destinationScope $_.Name)
  }

  $sourcePackage = Resolve-YctLinkedPath -Item (Get-Item -LiteralPath (Join-Path $sourceScope "resvg-js"))
  $sourceNativeScope = Split-Path -Parent $sourcePackage
  $nativePackages = Get-ChildItem -LiteralPath $sourceNativeScope -Directory -Filter "resvg-js-*" -ErrorAction SilentlyContinue
  if (-not $nativePackages) {
    throw "Cannot find @resvg native runtime dependency. Run pnpm install before building the artifact."
  }
  $nativePackages | ForEach-Object {
    Copy-YctNodeModuleEntry -Source $_ -Destination (Join-Path $destinationScope $_.Name)
  }
}

function Assert-YctMaterialRendererRuntimeDependency {
  param(
    [Parameter(Mandatory = $true)][string]$NodeCommand,
    [Parameter(Mandatory = $true)][string]$NodeModules
  )

  $resvgEntry = Join-Path $NodeModules "@resvg\resvg-js\index.js"
  if (-not (Test-Path -LiteralPath $resvgEntry)) {
    throw "Staged Resvg entry does not exist: $resvgEntry"
  }

  $validationScript = @'
import(process.argv[1])
  .then(({ Resvg }) => {
    const svg = Buffer.from('PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiPjwvc3ZnPg==', 'base64').toString('utf8');
    const png = new Resvg(svg).render().asPng();
    if (!png.length) process.exit(1);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
'@
  & $NodeCommand -e $validationScript ([System.Uri]::new($resvgEntry).AbsoluteUri)
  if ($LASTEXITCODE -ne 0) {
    throw "Staged Resvg runtime validation failed with exit code $LASTEXITCODE."
  }
}

function Copy-YctTurbopackExternalRuntimeDependencies {
  param(
    [Parameter(Mandatory = $true)][string]$SourceNodeModules,
    [Parameter(Mandatory = $true)][string]$DestinationNodeModules
  )

  if (-not (Test-Path -LiteralPath $SourceNodeModules)) {
    return
  }

  $externalPackages = Get-ChildItem -LiteralPath $SourceNodeModules -Directory -Filter "sharp-*" -Force |
    Where-Object { $_.LinkType -and $_.Name -match "^sharp-[0-9a-f]{16}$" }

  foreach ($externalPackage in $externalPackages) {
    $actualPackagePath = Resolve-YctLinkedPath -Item $externalPackage
    $packageNodeModules = Split-Path -Parent $actualPackagePath
    if (-not (Test-Path -LiteralPath (Join-Path $actualPackagePath "package.json"))) {
      continue
    }

    Get-ChildItem -LiteralPath $packageNodeModules -Force |
      Where-Object { $_.FullName -ne $actualPackagePath } |
      ForEach-Object {
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
}

function Assert-YctTurbopackExternalRuntimeDependencies {
  param(
    [Parameter(Mandatory = $true)][string]$NodeCommand,
    [Parameter(Mandatory = $true)][string]$StagedNextNodeModules
  )

  $sharpPackage = Get-ChildItem -LiteralPath $StagedNextNodeModules -Directory -Filter "sharp-*" -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $sharpPackage) {
    return
  }

  $sharpEntry = Join-Path $sharpPackage.FullName "dist\index.mjs"
  if (-not (Test-Path -LiteralPath $sharpEntry)) {
    throw "Staged Turbopack sharp entry does not exist: $sharpEntry"
  }

  & $NodeCommand -e "import(process.argv[1]).then((module) => module.default({ create: { width: 1, height: 1, channels: 4, background: '#00000000' } }).png().toBuffer()).catch((error) => { console.error(error); process.exit(1); })" ([System.Uri]::new($sharpEntry).AbsoluteUri)
  if ($LASTEXITCODE -ne 0) {
    throw "Staged Turbopack sharp runtime validation failed with exit code $LASTEXITCODE."
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
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$BasePath
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
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$BasePath,
    [string]$BuildId = ""
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

  $serviceWorkerPath = Join-Path $webRoot "public\sw.js"
  if (-not [string]::IsNullOrWhiteSpace($BuildId) -and (Test-Path -LiteralPath $serviceWorkerPath)) {
    $serviceWorker = [System.IO.File]::ReadAllText($serviceWorkerPath, [System.Text.Encoding]::UTF8)
    $expectedVersionLine = "const YCT_SW_VERSION = '$BuildId';"
    if (-not $serviceWorker.Contains($expectedVersionLine)) {
      throw "Staged service worker version does not match the deployment build id. Expected line: $expectedVersionLine"
    }
  }
}

$root = Get-YctRepoRoot
$basePathValue = Normalize-YctBasePath -Value $BasePath
$rawBuildId = if (-not [string]::IsNullOrWhiteSpace($env:YCT_BUILD_ID)) {
  $env:YCT_BUILD_ID
} else {
  $env:NEXT_PUBLIC_YCT_BUILD_ID
}
$buildId = Normalize-YctBuildId -Value $rawBuildId
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
  $previousBuildId = $env:NEXT_PUBLIC_YCT_BUILD_ID
  try {
    $env:NEXT_PUBLIC_YCT_BASE_PATH = $basePathValue
    $env:YCT_BASE_PATH = $basePathValue
    $env:NEXT_PUBLIC_YCT_BUILD_ID = $buildId
    & $pnpm --filter "@yct/web" build
    if ($LASTEXITCODE -ne 0) {
      throw "Next.js build failed with exit code $LASTEXITCODE."
    }
  } finally {
    $env:NEXT_PUBLIC_YCT_BASE_PATH = $previousPublicBasePath
    $env:YCT_BASE_PATH = $previousServerBasePath
    $env:NEXT_PUBLIC_YCT_BUILD_ID = $previousBuildId
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
  $harmonyFontSourceRoot = Join-Path $webRoot "app\fonts\harmonyos-sans"
  $harmonyFontDestinationRoot = Join-Path $standaloneWebRoot "public\fonts\harmonyos-sans"
  New-Item -ItemType Directory -Force -Path $harmonyFontDestinationRoot | Out-Null
  @("HarmonyOS_Sans_SC_Regular.ttf", "HarmonyOS_Sans_SC_Bold.ttf") | ForEach-Object {
    $sourceFontPath = Join-Path $harmonyFontSourceRoot $_
    if (-not (Test-Path -LiteralPath $sourceFontPath)) {
      throw "Required material font does not exist: $sourceFontPath"
    }
    Copy-Item -LiteralPath $sourceFontPath -Destination (Join-Path $harmonyFontDestinationRoot $_) -Force
  }
  $stagedServiceWorkerPath = Join-Path $standaloneWebRoot "public\sw.js"
  if (Test-Path -LiteralPath $stagedServiceWorkerPath) {
    $serviceWorker = [System.IO.File]::ReadAllText(
      $stagedServiceWorkerPath,
      [System.Text.Encoding]::UTF8
    )
    $serviceWorker = $serviceWorker -replace "const YCT_SW_VERSION = '[^']*';", "const YCT_SW_VERSION = '$buildId';"
    Write-YctUtf8File -Path $stagedServiceWorkerPath -Content $serviceWorker
  }
  Copy-YctNextRuntimeDependencies -Root $root -DestinationNodeModules $standaloneWebNodeModules
  Copy-YctMaterialRendererRuntimeDependencies -Root $root -DestinationNodeModules $standaloneWebNodeModules
  $sourceNextNodeModules = Join-Path $nextRoot "node_modules"
  $stagedNextNodeModules = Join-Path $standaloneNextRoot "node_modules"
  Copy-YctTurbopackExternalRuntimeDependencies `
    -SourceNodeModules $sourceNextNodeModules `
    -DestinationNodeModules $stagedNextNodeModules
  $nodeCommand = (Get-Command node.exe -ErrorAction Stop).Source
  Copy-YctMaterialRendererRuntimeDependencies -Root $root -DestinationNodeModules $stagedNextNodeModules
  Assert-YctTurbopackExternalRuntimeDependencies `
    -NodeCommand $nodeCommand `
    -StagedNextNodeModules $stagedNextNodeModules
  Assert-YctMaterialRendererRuntimeDependency `
    -NodeCommand $nodeCommand `
    -NodeModules $standaloneWebNodeModules
  Assert-YctMaterialRendererRuntimeDependency `
    -NodeCommand $nodeCommand `
    -NodeModules $stagedNextNodeModules

  $startScript = @"
param(
  [int]`$Port = 3300,
  [string]`$HostName = "127.0.0.1",
  [string]`$BasePath = "$basePathValue",
  [string]`$NodePath = ""
)

`$ErrorActionPreference = "Stop"

function Import-YctEnvFiles {
  param([Parameter(Mandatory = `$true)][string]`$Root)

  foreach (`$fileName in @(".env", ".env.production", ".env.local", ".env.production.local")) {
    `$filePath = Join-Path `$Root `$fileName
    if (-not (Test-Path -LiteralPath `$filePath)) {
      continue
    }

    foreach (`$rawLine in Get-Content -LiteralPath `$filePath -Encoding UTF8) {
      if (-not `$rawLine) {
        continue
      }

      `$trimmedLine = `$rawLine.Trim()
      if (-not `$trimmedLine -or `$trimmedLine.StartsWith("#")) {
        continue
      }

      `$match = [regex]::Match(`$rawLine, '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$')
      if (-not `$match.Success) {
        continue
      }

      `$key = `$match.Groups[1].Value
      if ([string]::IsNullOrWhiteSpace(`$key)) {
        continue
      }

      `$value = `$match.Groups[2].Value.Trim()
      if (
        (`$value.StartsWith('"') -and `$value.EndsWith('"')) -or
        (`$value.StartsWith("'") -and `$value.EndsWith("'"))
      ) {
        `$value = `$value.Substring(1, `$value.Length - 2)
      }

      [Environment]::SetEnvironmentVariable(`$key, `$value, "Process")
    }
  }
}

function Resolve-YctRuntimePaths {
  param([Parameter(Mandatory = `$true)][string]`$Root)

  foreach (`$key in [Environment]::GetEnvironmentVariables("Process").Keys) {
    if (`$key -notmatch '^YCT_.*_(?:STORE_PATH|UPLOAD_DIR|DATA_DIR|REPORT_PATH)$') {
      continue
    }

    `$value = [Environment]::GetEnvironmentVariable([string]`$key, "Process")
    if ([string]::IsNullOrWhiteSpace(`$value) -or [System.IO.Path]::IsPathRooted(`$value)) {
      continue
    }

    [Environment]::SetEnvironmentVariable(
      [string]`$key,
      [System.IO.Path]::GetFullPath((Join-Path `$Root `$value)),
      "Process"
    )
  }
}

`$serverPath = Join-Path `$PSScriptRoot "apps\web\server.js"
if (-not (Test-Path -LiteralPath `$serverPath)) {
  throw "Cannot find standalone server: `$serverPath"
}

Import-YctEnvFiles -Root `$PSScriptRoot
Resolve-YctRuntimePaths -Root `$PSScriptRoot

`$normalizedBasePath = `$BasePath.Trim().TrimEnd("/")
if (`$normalizedBasePath -eq "/") {
  `$normalizedBasePath = ""
}
if (`$normalizedBasePath -and -not `$normalizedBasePath.StartsWith("/")) {
  `$normalizedBasePath = "/`$normalizedBasePath"
}

`$env:PORT = [string]`$Port
`$env:HOSTNAME = `$HostName
`$env:YCT_RUNTIME_ROOT = `$PSScriptRoot
`$env:YCT_BASE_PATH = `$normalizedBasePath
`$env:NEXT_PUBLIC_YCT_BASE_PATH = `$normalizedBasePath

`$nodeCommand = if (`$NodePath) { `$NodePath } else { "node" }
& `$nodeCommand `$serverPath
"@

  $startBasePathArgument = if ($basePathValue) { $basePathValue.TrimStart("/") } else { "/" }
  $publicPathPrefix = $basePathValue
  $publicHealthPath = "$publicPathPrefix/api/health"
  $publicMapPath = "$publicPathPrefix/map"
  $publicMarkerPath = "$publicPathPrefix/api/map/markers"
  $publicServiceWorkerPath = "$publicPathPrefix/sw.js"
  $publicStaticPath = "$publicPathPrefix/_next/static/..."
  $publicLdpassStartPath = "$publicPathPrefix/api/auth/ldpass/start"
  $publicCallbackPath = "$publicPathPrefix/auth/ldpass/callback"
  $buildMountLabel = if ($basePathValue) { $basePathValue } else { "/ (site root)" }

  $deploymentNotes = @"
Yuchengtong web standalone deployment

Build base path: $buildMountLabel
Build id: $buildId
Required Node.js: >=20.9.0. This server currently uses C:\node-v24\node.exe in the examples below.

Recommended deploy command after extracting this bundle to a separate folder:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-yct-web.ps1 -TargetRoot "C:\wwwroot\yct-v2"

Deploy and start in one step:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-yct-web.ps1 -TargetRoot "C:\wwwroot\yct-v2" -StartAfterDeploy -Port 3300 -HostName 127.0.0.1 -BasePath "$startBasePathArgument" -NodePath "C:\node-v24\node.exe"

Runtime config check example:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\check-runtime-config.ps1 -BasePath "$startBasePathArgument"

Deployment smoke check example:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\check-yct-web-smoke.ps1 -Origin "https://yct.shangxiaoguan.top" -BasePath "$startBasePathArgument"

Unified internal task runner example:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\run-yct-internal-tasks.ps1 -Origin http://127.0.0.1:3300 -BasePath "$startBasePathArgument"

One-time legacy content migration preview:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\migrate-yct-legacy-content.ps1 -Origin http://127.0.0.1:3300 -BasePath "$startBasePathArgument" -EnvironmentRoot "C:\wwwroot\yct-v2"

Continuous player location poller example:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\run-yct-player-location-poller.ps1 -Origin http://127.0.0.1:3300 -BasePath "$startBasePathArgument" -IntervalSeconds 15

Initialize a YCT administrator without pnpm:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\init-yct-admin.ps1 -LdpassUserId "<ldpassUserId>"

Start command example:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\start-yct-web.ps1 -Port 3300 -HostName 127.0.0.1 -BasePath "$startBasePathArgument" -NodePath "C:\node-v24\node.exe"

Notes:
- Do not upload local .env files, .yct-data, or runtime-assets into this bundle.
- ENVIRONMENT.example is a key inventory, not a production environment file. merge-yct-env.ps1 only appends keys that are missing from the existing production .env; it never replaces existing values or secrets.
- Keep real environment files (.env, .env.production, .env.local), server-side runtime stores, runtime-assets, uploaded content assets, logs, and backups outside the deployment bundle. In the extracted deployment directory, place those environment files at the same level as start-yct-web.ps1, .yct-data, and runtime-assets. start-yct-web.ps1 will import them before launching the standalone server.
- start-yct-web.ps1 loads .env -> .env.production -> .env.local -> .env.production.local, and later files override earlier ones. These values also override inherited shell / PM2 environment variables for the same keys so stale localhost settings do not leak into production.
- deploy-yct-web.ps1 will automatically preserve .env, .env.production, .env.local, .env.production.local, .yct-data, runtime-assets, and apps\web\public\content-assets from the old deployment directory before replacing files.
- For ordinary releases after the WordPress and legacy content migrations, follow POST_MIGRATION_DEPLOYMENT.md. Do not rerun either one-time migration during deployment.
- init-yct-admin.ps1 writes .yct-data\admin-memberships.json by default, or YCT_ADMIN_STORE_PATH when that environment variable is set. This file is runtime data and must not be committed.
- run-yct-player-location-poller.ps1 must run as a separate long-lived process with the same YCT_INTERNAL_TASK_TOKEN as the web server. It keeps polling the player provider while no browser is visiting the site, so offline locations are persisted after disconnects.
- If the reverse proxy is mounted at /v2, build and start with BasePath /v2. If it is mounted at the site root later, rebuild with an empty BasePath.
- Stop the old process before deployment and unpack this bundle into an empty deployment directory, or clean the old standalone files first. Do not merge it over an old .next directory: server.js, .next/server, and .next/static must come from the same build.
- When replacing an existing deployment in place, preserve at least .yct-data, runtime-assets, and apps\web\public\content-assets from the old directory before clearing files. Copying only .yct-data is not enough if the site already contains uploaded content assets or POI category icons.
- If returning users still see an older version, check that the old Node process is stopped, the deployment directory does not contain stale .next/static files, and the reverse proxy or browser Service Worker is not serving cached HTML/RSC responses.
- After deployment, $publicHealthPath should return JSON containing buildId '$buildId' and basePath '$basePathValue'. Then $publicMapPath, $publicMarkerPath, $publicServiceWorkerPath, and the $publicStaticPath assets referenced by the page HTML should all return 200. The first line of $publicServiceWorkerPath should contain: const YCT_SW_VERSION = '$buildId';
- If ldpass login still jumps to localhost or 127.0.0.1, inspect $publicLdpassStartPath directly. The redirect Location should contain redirect_uri=https://yct.shangxiaoguan.top$publicCallbackPath and Set-Cookie should include both yct.ldpass_state and yct.ldpass_return_origin.
- For the one-time /v2 to site-root cutover, follow ROOT_PATH_MIGRATION.md and install nginx/yct-root-locations.conf only after reviewing the documented old-static-site compatibility rules.
- For the one-time import of the old content_data.js and content/*.html files, follow LEGACY_CONTENT_MIGRATION.md. Preview first; -Apply only creates missing drafts and never overwrites an existing contentId.
"@

  Write-YctUtf8File -Path (Join-Path $stageRoot "start-yct-web.ps1") -Content $startScript
  Copy-Item -LiteralPath (Join-Path $root "scripts\web-deploy-artifact.ps1") -Destination (Join-Path $stageRoot "deploy-yct-web.ps1") -Force
  Copy-Item -LiteralPath (Join-Path $root "scripts\check-runtime-config.ps1") -Destination (Join-Path $stageRoot "check-runtime-config.ps1") -Force
  Copy-Item -LiteralPath (Join-Path $root "scripts\check-web-deployment-smoke.ps1") -Destination (Join-Path $stageRoot "check-yct-web-smoke.ps1") -Force
  Copy-Item -LiteralPath (Join-Path $root "scripts\run-web-internal-tasks.ps1") -Destination (Join-Path $stageRoot "run-yct-internal-tasks.ps1") -Force
  Copy-Item -LiteralPath (Join-Path $root "scripts\run-yct-legacy-content-migration.ps1") -Destination (Join-Path $stageRoot "migrate-yct-legacy-content.ps1") -Force
  Copy-Item -LiteralPath (Join-Path $root "scripts\run-web-player-location-poller.ps1") -Destination (Join-Path $stageRoot "run-yct-player-location-poller.ps1") -Force
  Copy-Item -LiteralPath (Join-Path $root "scripts\init-admin-membership.ps1") -Destination (Join-Path $stageRoot "init-yct-admin.ps1") -Force
  Copy-Item -LiteralPath (Join-Path $root "scripts\merge-yct-env-example.ps1") -Destination (Join-Path $stageRoot "merge-yct-env.ps1") -Force
  Copy-Item -LiteralPath (Join-Path $root "scripts\prepare-yct-root-migration.ps1") -Destination (Join-Path $stageRoot "prepare-yct-root-migration.ps1") -Force
  Copy-Item -LiteralPath (Join-Path $root ".env.example") -Destination (Join-Path $stageRoot "ENVIRONMENT.example") -Force
  Copy-Item -LiteralPath (Join-Path $root "docs\ROOT_PATH_MIGRATION.md") -Destination (Join-Path $stageRoot "ROOT_PATH_MIGRATION.md") -Force
  Copy-Item -LiteralPath (Join-Path $root "docs\LEGACY_CONTENT_MIGRATION.md") -Destination (Join-Path $stageRoot "LEGACY_CONTENT_MIGRATION.md") -Force
  Copy-Item -LiteralPath (Join-Path $root "docs\POST_MIGRATION_DEPLOYMENT.md") -Destination (Join-Path $stageRoot "POST_MIGRATION_DEPLOYMENT.md") -Force
  $stageNginxRoot = Join-Path $stageRoot "nginx"
  New-Item -ItemType Directory -Force -Path $stageNginxRoot | Out-Null
  Copy-Item -LiteralPath (Join-Path $root "deploy\nginx\yct-root-locations.conf") -Destination (Join-Path $stageNginxRoot "yct-root-locations.conf") -Force
  Write-YctUtf8File -Path (Join-Path $stageRoot "DEPLOYMENT.txt") -Content $deploymentNotes
  Remove-YctRuntimeEnvironmentFiles -StageRoot $stageRoot
}

Assert-YctNoRuntimeEnvironmentFiles -StageRoot $stageRoot
$consistencyBuildId = if ($SkipStaging) { "" } else { $buildId }
Assert-YctStagedWebAssetConsistency -StageRoot $stageRoot -BasePath $basePathValue -BuildId $consistencyBuildId

$reportedBuildId = $buildId
if ($SkipStaging) {
  $stagedServiceWorkerPath = Join-Path $stageRoot "apps\web\public\sw.js"
  $stagedServiceWorkerFirstLine = Get-Content -LiteralPath $stagedServiceWorkerPath -Encoding UTF8 -TotalCount 1
  if ($stagedServiceWorkerFirstLine -match "^const YCT_SW_VERSION = '([^']+)';$") {
    $reportedBuildId = $Matches[1]
  } else {
    throw "Cannot determine the staged build id from apps\web\public\sw.js."
  }
}

if ($ValidateOnly) {
  $result = [pscustomobject]@{
    ValidationOnly = $true
    StagingDirectory = $stageRoot
    SkippedStaging = [bool]$SkipStaging
    BasePath = $basePathValue
    BuildId = $reportedBuildId
    StartScript = "start-yct-web.ps1"
    DeployScript = "deploy-yct-web.ps1"
    ConfigCheckScript = "check-runtime-config.ps1"
    EnvMergeScript = "merge-yct-env.ps1"
    RootMigrationGuide = "ROOT_PATH_MIGRATION.md"
    PostMigrationDeploymentGuide = "POST_MIGRATION_DEPLOYMENT.md"
    LegacyContentMigrationGuide = "LEGACY_CONTENT_MIGRATION.md"
    LegacyContentMigrationScript = "migrate-yct-legacy-content.ps1"
    SmokeCheckScript = "check-yct-web-smoke.ps1"
    InternalTaskScript = "run-yct-internal-tasks.ps1"
    InitAdminScript = "init-yct-admin.ps1"
    NodeRequirement = ">=20.9.0"
  }

  Write-Output ($result | ConvertTo-Json -Depth 4)
  return
}

$sevenZip = Resolve-YctSevenZipPath -Path $SevenZipPath
$tar = Get-Command tar.exe -ErrorAction SilentlyContinue
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$artifactPath = Join-Path $outputRoot "yct-web-$timestamp.$ArchiveFormat"
$temporaryArtifactPath = Join-Path $outputRoot "yct-web-$timestamp.tmp.$ArchiveFormat"
$archiveTool = $null

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
    $archiveTool = $tar.Source
    & $tar.Source -czf $temporaryArtifactPath -C $stageRoot .
    if ($LASTEXITCODE -ne 0) {
      throw "tar.exe failed to create deployment artifact with exit code $LASTEXITCODE."
    }
  } elseif ($ArchiveFormat -eq "tar") {
    if ($null -eq $tar) {
      throw "tar.exe is required to create a tar deployment artifact."
    }
    $archiveTool = $tar.Source
    & $tar.Source -cf $temporaryArtifactPath -C $stageRoot .
    if ($LASTEXITCODE -ne 0) {
      throw "tar.exe failed to create deployment artifact with exit code $LASTEXITCODE."
    }
  } elseif ($null -ne $sevenZip) {
    $archiveTool = $sevenZip
    Push-Location -LiteralPath $stageRoot
    try {
      & $sevenZip a -tzip -mx=5 $temporaryArtifactPath ".\*" | Out-Host
      if ($LASTEXITCODE -ne 0) {
        throw "7-Zip failed to create deployment artifact with exit code $LASTEXITCODE."
      }
    } finally {
      Pop-Location
    }
  } elseif ($null -ne $tar) {
    $archiveTool = $tar.Source
    & $tar.Source -a -cf $temporaryArtifactPath -C $stageRoot .
    if ($LASTEXITCODE -ne 0) {
      throw "tar.exe failed to create deployment artifact with exit code $LASTEXITCODE."
    }
  } else {
    $archiveTool = "Compress-Archive"
    Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $temporaryArtifactPath -CompressionLevel Optimal
  }

  Move-Item -LiteralPath $temporaryArtifactPath -Destination $artifactPath -Force
} catch {
  if (Test-Path -LiteralPath $temporaryArtifactPath) {
    Remove-Item -LiteralPath $temporaryArtifactPath -Force -ErrorAction SilentlyContinue
  }
  throw
}

$artifactSha256 = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash
$checksumPath = "$artifactPath.sha256"
$checksumLine = "$artifactSha256  $([System.IO.Path]::GetFileName($artifactPath))$([Environment]::NewLine)"
Write-YctUtf8File -Path $checksumPath -Content $checksumLine

$result = [pscustomobject]@{
  Artifact = $artifactPath
  ArtifactSha256 = $artifactSha256
  ChecksumFile = $checksumPath
  ArchiveFormat = $ArchiveFormat
  ArchiveTool = $archiveTool
  StagingDirectory = $stageRoot
  SkippedStaging = [bool]$SkipStaging
  BasePath = $basePathValue
  BuildId = $reportedBuildId
  StartScript = "start-yct-web.ps1"
  DeployScript = "deploy-yct-web.ps1"
  ConfigCheckScript = "check-runtime-config.ps1"
  SmokeCheckScript = "check-yct-web-smoke.ps1"
  InternalTaskScript = "run-yct-internal-tasks.ps1"
  LegacyContentMigrationScript = "migrate-yct-legacy-content.ps1"
  InitAdminScript = "init-yct-admin.ps1"
  NodeRequirement = ">=20.9.0"
}

Write-Output ($result | ConvertTo-Json -Depth 4)
