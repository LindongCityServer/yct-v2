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
  # Stop after the staging assertions and emit the staging inventory instead of writing
  # an archive. Used to verify a staging tree without paying for a full ~270 MB archive
  # (and without leaving a half-good artifact in `artifacts/` for someone to deploy).
  [switch]$SkipArchive,
  [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "web-dev-common.ps1")

# Normalise `ComSpec` for this process as well as for every child we spawn.
#
# pnpm runs `apps/web`'s build script through a shell, because it is a `&&` chain:
#
#   node ../../scripts/ui-controls-inventory.mjs --check && ... && next build
#
# When `ComSpec` is unset, pnpm does not find `cmd.exe` and falls back to the first `sh`
# on PATH — which here is PortableGit's `usr\bin\sh.exe`. That shell cannot run the
# composite script, and the build dies with the very unhelpful
# `'sh' is not recognized as an internal or external command`, which this script then
# reports as `Next.js build failed with exit code 1`.
#
# The tooling environment that launches this script leaves `ComSpec` empty, so repair it
# here. `Invoke-YctCommand` additionally sets it on each child directly, because
# `Start-Process`-style inheritance rebuilds the environment from the original block and
# would otherwise drop this assignment.
if (-not $env:ComSpec -or -not (Test-Path -LiteralPath $env:ComSpec)) {
  $env:ComSpec = Join-Path $env:SystemRoot "System32\cmd.exe"
}

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

function Get-YctFileSha256 {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Cannot calculate SHA-256 for missing file: $Path"
  }

  $stream = $null
  $sha256 = $null
  try {
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $hashBytes = $sha256.ComputeHash($stream)
    return ([System.BitConverter]::ToString($hashBytes)).Replace("-", "")
  } finally {
    if ($null -ne $sha256) {
      $sha256.Dispose()
    }
    if ($null -ne $stream) {
      $stream.Dispose()
    }
  }
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
    # `Remove-Item -Recurse` is slow on deep trees (per-item overhead), so route through
    # the robocopy-backed helper which handles 10k+ files without thrashing.
    Remove-YctDirectoryTree -Path $Path
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
  # Materialise the listing before iterating. `Copy-YctDirectoryTree` shells out to
  # robocopy, and PowerShell 7.6 rejects running that native command "in the middle of
  # a pipeline" — which it would be if we piped `Get-ChildItem` straight into this
  # ForEach-Object. Collecting into an array first keeps each iteration at the top
  # level of the pipeline.
  $children = @(Get-ChildItem -LiteralPath $Source -Force)
  foreach ($child in $children) {
    if ($child.PSIsContainer) {
      Copy-YctDirectoryTree -Source $child.FullName -Destination (Join-Path $Destination $child.Name)
      continue
    }

    # robocopy 以目录语义处理单个文件源时会返回 16（文件名语法不正确）；
    # webpack 的 standalone 根目录会多出 package.json，这里必须按文件复制。
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Copy-Item -LiteralPath $child.FullName -Destination (Join-Path $Destination $child.Name) -Force
  }
}

# Run robocopy synchronously and return its exit code.
#
# Getting a *synchronous* native invocation out of PowerShell 7.6 is surprisingly
# awkward, and the obvious forms are all wrong:
#
#   `& robocopy ... | Out-Null`  -> PowerShell 7.6 refuses to run a native command
#                                   "in the middle of a pipeline": the call returns at
#                                   once and nothing is copied.
#   `& robocopy ... > $null`     -> accepted, but ALSO does not wait. Measured: it
#                                   returned in 202 ms with 205 files pending,
#                                   `$LASTEXITCODE` unset, and 4 robocopy processes
#                                   still running.
#
# Because the redirection form returned before the copy finished, the staging
# assertions ran against half-populated directories and failed at random (most often
# on the `@resvg` native package), while orphaned robocopy processes kept rewriting
# the tree. `Invoke-YctCommand` is the form that actually blocks until completion and
# exposes a real exit code.
function Invoke-YctRobocopy {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  return Invoke-YctCommand `
    -FilePath "robocopy.exe" `
    -Arguments (@($Source, $Destination) + $Arguments)
}

# Run an external command to completion and return its exit code.
#
# Three separate Windows/PowerShell hazards are handled here, each of which produces a
# confusing failure on its own:
#
# 1. Waiting. PowerShell 7.6 will not reliably block on a native command when its output
#    is redirected or piped:
#      `& tool ... | Out-Null`  -> rejected: "cannot run a document in the middle of a
#                                  pipeline", and nothing actually runs.
#      `& tool ... > $null`     -> accepted but returns immediately. Measured on
#                                  robocopy: back in 202 ms with 205 files still pending
#                                  and 4 robocopy processes alive, so later assertions
#                                  ran against half-populated directories.
#
# 2. Argument integrity. Never hand a command line to a shell on the caller's behalf:
#    cmd.exe treats `@` as an echo-suppression sigil, so a workspace filter like
#    `@yct/web` silently loses its leading `@`, pnpm reports
#    `No projects matched the filters`, and the build exits 0 having done nothing.
#
# 3. Environment inheritance. `Start-Process` builds the child environment from the
#    process's *original* block, so assigning `$env:ComSpec` in-session never reaches the
#    child. pnpm needs `ComSpec` to run a `&&`-chained npm script; without it pnpm falls
#    back to the first `sh` on PATH (PortableGit's) and the build dies with
#    `'sh' is not recognized as an internal or external command`. `ProcessStartInfo` is
#    used instead of `Start-Process` precisely because it lets us set that variable on the
#    child directly.
function Invoke-YctCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [string]$WorkingDirectory
  )

  if ($FilePath -match "\.(cmd|bat)$") {
    # Fallback for genuine batch shims — see hazard 2 above. `cmd /c` takes the command
    # plus its arguments as one command line, so quoting has to be built by hand:
    #   - leave the head token unquoted when it has no spaces, otherwise cmd.exe treats it
    #     as a program *name* and cannot resolve the `.CMD` extension
    #   - do not escape inner quotes as `\"`; that is a C-runtime convention cmd.exe does
    #     not understand
    $commandShell = if ($env:ComSpec) { $env:ComSpec } else { Join-Path $env:SystemRoot "System32\cmd.exe" }
    $head = if ($FilePath -match '\s') { "`"$FilePath`"" } else { $FilePath }
    $quoted = ($Arguments | ForEach-Object {
      if ($_ -match '[\s"]') { '"' + $_ + '"' } else { $_ }
    }) -join " "
    $FilePath = $commandShell
    $Arguments = @("/c", "$head $quoted")
  } elseif ($FilePath -match "\.ps1$") {
    $Arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $FilePath) + $Arguments
    $FilePath = (Get-Process -Id $PID).Path
  }

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $FilePath
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  if ($WorkingDirectory) {
    $startInfo.WorkingDirectory = $WorkingDirectory
  }
  foreach ($argument in $Arguments) {
    # `ArgumentList` (rather than the `Arguments` string) keeps each element intact, so
    # nothing needs shell-style escaping and `@` survives.
    $startInfo.ArgumentList.Add($argument)
  }

  # Hazard 3: guarantee the child can find the Windows shell for npm scripts.
  $commandProcessor = if ($env:ComSpec -and (Test-Path -LiteralPath $env:ComSpec)) {
    $env:ComSpec
  } else {
    Join-Path $env:SystemRoot "System32\cmd.exe"
  }
  $startInfo.Environment["ComSpec"] = $commandProcessor
  # PortableGit's sh must not win the fallback race if pnpm ever looks for a shell.
  $startInfo.Environment["npm_config_script_shell"] = $commandProcessor

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  [void]$process.Start()

  # Drain both pipes concurrently. Reading them one after the other can deadlock once the
  # unread stream fills its OS buffer, so both reads are started before waiting.
  #
  # Note the deliberate absence of BeginOutputReadLine / DataReceived handlers: those fire
  # on thread-pool threads that have no PowerShell runspace, and any scriptblock they
  # invoke aborts the whole host with
  # `PSInvalidOperationException: no runspace available to run scripts in this thread`.
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.WaitForExit()
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  $exitCode = $process.ExitCode
  $process.Dispose()

  # Surface the child's output so a failed step is diagnosable from the build log.
  if (-not [string]::IsNullOrWhiteSpace($stdout)) {
    Write-Host $stdout.TrimEnd()
  }
  if (-not [string]::IsNullOrWhiteSpace($stderr)) {
    Write-Host $stderr.TrimEnd()
  }

  return $exitCode
}

# Fast recursive copy. PowerShell's Copy-Item -Recurse recreates every directory and file
# object individually and is roughly an order of magnitude slower than robocopy on Windows;
# the staging step moves well over 10k files, so the difference is minutes per launch.
function Copy-YctDirectoryTree {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  if (Get-Command robocopy.exe -ErrorAction SilentlyContinue) {
    $destinationParent = Split-Path -Parent $Destination
    New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
    # /E copies subdirectories including empty ones, /DCOPY:DAT preserves directory
    # timestamps, and the log switches keep the output silent.
    $copyExitCode = Invoke-YctRobocopy -Source $Source -Destination $Destination -Arguments @(
      "/E", "/DCOPY:DAT", "/R:2", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS", "/NP"
    )
    if ($copyExitCode -ge 8) {
      throw "robocopy failed to stage $Source into $Destination with exit code $copyExitCode."
    }
    return
  }

  Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
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

function Clear-YctExistingDestination {
  param([Parameter(Mandatory = $true)][string]$Destination)

  if (-not (Test-Path -LiteralPath $Destination)) {
    return
  }

  # Empty directories (Next's standalone output leaves empty placeholder folders such as
  # apps/web/node_modules/next) do not need a recursive delete. Removing the directory
  # entry alone is cheap and avoids a bulk recursive delete of the whole subtree.
  $item = Get-Item -LiteralPath $Destination -Force
  if ($item.PSIsContainer -and (@(Get-ChildItem -LiteralPath $Destination -Force).Count -eq 0)) {
    Remove-Item -LiteralPath $Destination -Force
    return
  }

  Remove-YctDirectoryTree -Path $Destination
}

# Fast recursive delete. `Remove-Item -Recurse` on a deep tree (the staged `next` package is
# ~8k files) spends minutes of CPU on per-item overhead. robocopy mirrors an empty directory
# over the target with /MIR, then we drop the emptied shell.
function Remove-YctDirectoryTree {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  if (Get-Command robocopy.exe -ErrorAction SilentlyContinue) {
    $emptySource = Join-Path ([System.IO.Path]::GetTempPath()) "yct-empty-$PID"
    New-Item -ItemType Directory -Force -Path $emptySource | Out-Null
    try {
      # Must go through `Invoke-YctRobocopy`: a bare `& robocopy ... > $null` returns
      # before the purge finishes, so the `Remove-Item` right below would race a still
      # running mirror and the emptied shell would be re-created mid-delete.
      $purgeExitCode = Invoke-YctRobocopy -Source $emptySource -Destination $Path -Arguments @(
        "/MIR", "/R:2", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS", "/NP"
      )
      if ($purgeExitCode -ge 8) {
        throw "robocopy failed to clear $Path with exit code $purgeExitCode."
      }
    } finally {
      Remove-Item -LiteralPath $emptySource -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
    return
  }

  Remove-Item -LiteralPath $Path -Recurse -Force
}

function Copy-YctNodeModuleEntry {
  param(
    [Parameter(Mandatory = $true)][System.IO.FileSystemInfo]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  $actualSource = Resolve-YctLinkedPath -Item $Source

  # Copy straight over the destination instead of deleting it first.
  #
  # The old code called `Clear-YctExistingDestination` (a recursive delete) before every
  # copy. That turned any interruption into data loss: robocopy /E overwrites files one by
  # one, so if the process is killed mid-copy the destination is left holding a *partial*
  # tree, with no previous copy intact to fall back on. Building `next` (~8k files) is slow
  # enough that this happened in practice.
  #
  # `robocopy /E` already refreshes changed files and adds new ones without needing the
  # destination emptied first, so the delete is pure downside. Stale files that no longer
  # exist in the source are not a concern here: the destination is either brand new or was
  # itself populated by an earlier run of this same function.
  Copy-YctDirectoryTree -Source $actualSource -Destination $Destination
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
  # Same "no native command mid-pipeline" constraint as Copy-YctDirectoryChildren:
  # Copy-YctNodeModuleEntry runs robocopy, so iterate a materialised array.
  foreach ($entry in @(Get-ChildItem -LiteralPath $nextNodeModules -Force)) {
    if ($entry.Name.StartsWith("@")) {
      $scopeDestination = Join-Path $DestinationNodeModules $entry.Name
      New-Item -ItemType Directory -Force -Path $scopeDestination | Out-Null
      foreach ($scoped in @(Get-ChildItem -LiteralPath $entry.FullName -Force)) {
        Copy-YctNodeModuleEntry -Source $scoped -Destination (Join-Path $scopeDestination $scoped.Name)
      }
    } else {
      Copy-YctNodeModuleEntry -Source $entry -Destination (Join-Path $DestinationNodeModules $entry.Name)
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
  foreach ($entry in @(Get-ChildItem -LiteralPath $sourceScope -Force)) {
    Copy-YctNodeModuleEntry -Source $entry -Destination (Join-Path $destinationScope $entry.Name)
  }

  # Copy every platform-specific `resvg-js-*` package that backs the native binding.
  #
  # Do NOT look for these beside the `resvg-js` package: pnpm gives each optional
  # dependency its own `.pnpm/<name>@<ver>` entry, so the native package lives in a
  # *separate* store directory and is linked into `resvg-js`'s scope as a symlink.
  # Searching `resvg-js`'s parent therefore finds nothing, which used to fail the build
  # outright (`Cannot find @resvg native runtime dependency`). Scan the pnpm store root
  # instead, which holds the real directory regardless of how the link is materialised.
  $pnpmRoot = Join-Path $Root "node_modules\.pnpm"
  $nativePackages = @()
  $nativeLinkScope = Split-Path -Parent (Resolve-YctLinkedPath -Item (Get-Item -LiteralPath (Join-Path $sourceScope "resvg-js")))
  if (Test-Path -LiteralPath $nativeLinkScope) {
    $nativePackages += Get-ChildItem -LiteralPath $nativeLinkScope -Directory -Filter "resvg-js-*" -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $pnpmRoot) {
    $nativePackages += Get-ChildItem -LiteralPath $pnpmRoot -Directory -Filter "@resvg+resvg-js-*" -ErrorAction SilentlyContinue |
      ForEach-Object { Get-Item -LiteralPath (Join-Path $_.FullName "node_modules\@resvg\resvg-js-*") -ErrorAction SilentlyContinue }
  }
  $nativePackages = @($nativePackages | Where-Object { $_ } | Sort-Object FullName -Unique)

  if ($nativePackages.Count -eq 0) {
    throw "Cannot find @resvg native runtime dependency. Run pnpm install before building the artifact."
  }
  foreach ($nativePackage in $nativePackages) {
    Copy-YctNodeModuleEntry -Source $nativePackage -Destination (Join-Path $destinationScope $nativePackage.Name)
  }
}

function Assert-YctNextRuntimeDependency {
  param(
    [Parameter(Mandatory = $true)][string]$NodeCommand,
    [Parameter(Mandatory = $true)][string]$NodeModules
  )

  # `server.js` calls require('next') and require('next/dist/server/lib/start-server')
  # from apps/web. Next's own standalone output only ships the pnpm store copy of the
  # package (dist + package.json), so the runtime needs a resolvable `next` entry here.
  $nextPackageJson = Join-Path $NodeModules "next\package.json"
  if (-not (Test-Path -LiteralPath $nextPackageJson)) {
    throw "Staged Next runtime dependency is missing: $nextPackageJson"
  }

  $nextMain = Join-Path $NodeModules "next\dist\server\next.js"
  if (-not (Test-Path -LiteralPath $nextMain)) {
    throw "Staged Next runtime entry is missing: $nextMain"
  }

  $serverJsPath = Join-Path (Split-Path -Parent $NodeModules) "server.js"
  $serverJsFull = [System.IO.Path]::GetFullPath($serverJsPath)
  if (-not (Test-Path -LiteralPath $serverJsFull)) {
    throw "Staged standalone server entry is missing: $serverJsFull"
  }

  $validationScriptPath = Join-Path ([System.IO.Path]::GetTempPath()) "yct-next-runtime-probe-$PID.cjs"
  $validationScript = @'
const moduleApi = require('node:module');
const createRequire = moduleApi.createRequire;

const serverPath = process.argv[2];
if (!serverPath) {
  console.error('missing server.js path argument');
  process.exit(1);
}

let probe;
try {
  probe = createRequire(serverPath);
} catch (error) {
  console.error('cannot create require from ' + serverPath + ': ' + error.message);
  process.exit(1);
}

const ids = ['next', 'next/dist/server/lib/start-server'];
for (const id of ids) {
  try {
    probe.resolve(id);
  } catch (error) {
    console.error('cannot resolve ' + id + ' from ' + serverPath + ': ' + error.message);
    process.exit(1);
  }
}
'@
  Write-YctUtf8File -Path $validationScriptPath -Content $validationScript
  try {
    $validationExitCode = Invoke-YctCommand `
      -FilePath $NodeCommand `
      -Arguments @($validationScriptPath, $serverJsFull)
    if ($validationExitCode -ne 0) {
      throw "Staged Next runtime validation failed with exit code $validationExitCode."
    }
  } finally {
    Remove-Item -LiteralPath $validationScriptPath -Force -ErrorAction SilentlyContinue
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

  # `system-material-templates.ts` reads these SVGs from `process.cwd()` at module
  # load, so a missing bus-stop template makes the whole template list 500 and both
  # material workbenches lose their template library. Node's standalone runtime sets
  # cwd to `apps/web`, so verify the copy that will actually be resolved.
  #
  # This function is called with two different `$NodeModules` values — `apps\web\node_modules`
  # and `apps\web\.next\node_modules` — which sit at *different* depths below `apps\web`.
  # A hardcoded relative hop therefore only ever resolves for one of them (the old
  # `..\..\public` broke the first call site outright). Walk up from the node_modules
  # directory until the template is found, so any future layout change keeps working.
  $busStopTemplate = $null
  $searchRoot = Get-Item -LiteralPath $NodeModules -ErrorAction SilentlyContinue
  while ($searchRoot -and -not $busStopTemplate) {
    $candidate = Join-Path $searchRoot.FullName "public\material-templates\bus-stop\overview.svg"
    if (Test-Path -LiteralPath $candidate) {
      $busStopTemplate = $candidate
      break
    }
    $searchRoot = $searchRoot.Parent
  }
  if (-not $busStopTemplate) {
    throw "Staged bus-stop template is missing under any parent of: $NodeModules"
  }

  # Any directory whose name carries a pnpm 16-hex suffix must contain real files;
  # an empty one means a symlink was copied without being resolved.
  $hashedDirs = Get-ChildItem -LiteralPath $NodeModules -Directory -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "-[0-9a-f]{16}$" }
  foreach ($hashedDir in $hashedDirs) {
    $childCount = @(Get-ChildItem -LiteralPath $hashedDir.FullName -Force -ErrorAction SilentlyContinue).Count
    if ($childCount -eq 0) {
      throw "Staged hashed runtime dependency is empty (symlink not resolved): $($hashedDir.FullName)"
    }
  }

  $validationScriptPath = Join-Path ([System.IO.Path]::GetTempPath()) "yct-resvg-probe-$PID.cjs"
  # `import()` on Windows requires a file:// URL; a bare `C:\...` path fails with
  # ERR_UNSUPPORTED_ESM_URL_SCHEME. Convert inside the probe so no caller has to remember.
  $validationScript = @'
const { pathToFileURL } = require('node:url');
import(pathToFileURL(process.argv[2]).href)
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
  Write-YctUtf8File -Path $validationScriptPath -Content $validationScript
  try {
    $resvgExitCode = Invoke-YctCommand `
      -FilePath $NodeCommand `
      -Arguments @($validationScriptPath, $resvgEntry)
    if ($resvgExitCode -ne 0) {
      throw "Staged Resvg runtime validation failed with exit code $resvgExitCode."
    }
  } finally {
    Remove-Item -LiteralPath $validationScriptPath -Force -ErrorAction SilentlyContinue
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

  # Turbopack/Next materialise externalised native packages as pnpm symlinks whose
  # directory name carries a 16-hex suffix (e.g. `sharp-9d8ba623b6c23f88`,
  # `resvg-js-d068a6f52ea80d5a`). The suffix is a pnpm content key, not a real
  # directory name, so a plain recursive copy would record an EMPTY directory and
  # the runtime `require()` would fail after deployment — this happened before, so
  # every such symlink (not just sharp) must be resolved and its backing package
  # staged under the hashed name the bundler recorded.
  $externalPackages = Get-ChildItem -LiteralPath $SourceNodeModules -Directory -Force |
    Where-Object { $_.LinkType -and $_.Name -match "-[0-9a-f]{16}$" }

  foreach ($externalPackage in $externalPackages) {
    $actualPackagePath = Resolve-YctLinkedPath -Item $externalPackage
    $packageNodeModules = Split-Path -Parent $actualPackagePath
    if (-not (Test-Path -LiteralPath (Join-Path $actualPackagePath "package.json"))) {
      continue
    }

    # Materialise the sibling listing before copying: Copy-YctNodeModuleEntry runs
    # robocopy, which PowerShell 7.6 refuses to start from inside a pipeline.
    $siblings = @(
      Get-ChildItem -LiteralPath $packageNodeModules -Force |
        Where-Object { $_.FullName -ne $actualPackagePath }
    )
    foreach ($sibling in $siblings) {
      if ($sibling.Name.StartsWith("@")) {
        $scopeDestination = Join-Path $DestinationNodeModules $sibling.Name
        New-Item -ItemType Directory -Force -Path $scopeDestination | Out-Null
        foreach ($scoped in @(Get-ChildItem -LiteralPath $sibling.FullName -Force)) {
          Copy-YctNodeModuleEntry -Source $scoped -Destination (Join-Path $scopeDestination $scoped.Name)
        }
      } else {
        Copy-YctNodeModuleEntry -Source $sibling -Destination (Join-Path $DestinationNodeModules $sibling.Name)
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

  $validationScriptPath = Join-Path ([System.IO.Path]::GetTempPath()) "yct-sharp-probe-$PID.cjs"
  # See the Resvg probe: `import()` needs a file:// URL on Windows.
  $validationScript = @'
const { pathToFileURL } = require('node:url');
import(pathToFileURL(process.argv[2]).href)
  .then((module) => module.default({ create: { width: 1, height: 1, channels: 4, background: '#00000000' } }).png().toBuffer())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
'@
  Write-YctUtf8File -Path $validationScriptPath -Content $validationScript
  try {
    $sharpExitCode = Invoke-YctCommand `
      -FilePath $NodeCommand `
      -Arguments @($validationScriptPath, $sharpEntry)
    if ($sharpExitCode -ne 0) {
      throw "Staged Turbopack sharp runtime validation failed with exit code $sharpExitCode."
    }
  } finally {
    Remove-Item -LiteralPath $validationScriptPath -Force -ErrorAction SilentlyContinue
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
  $previousRequirePreparedRelease = $env:YCT_REQUIRE_PREPARED_RELEASE
  try {
    $env:NEXT_PUBLIC_YCT_BASE_PATH = $basePathValue
    $env:YCT_BASE_PATH = $basePathValue
    $env:NEXT_PUBLIC_YCT_BUILD_ID = $buildId
    $env:YCT_REQUIRE_PREPARED_RELEASE = "true"
    # Run to completion (not `& $pnpm ...`) so the staging step cannot start reading
    # `.next` while Next.js is still writing it. `Invoke-YctCommand` also handles the
    # `.CMD` shim pnpm installs on Windows.
    $buildExitCode = Invoke-YctCommand `
      -FilePath $pnpm `
      -Arguments @("--filter", "@yct/web", "build") `
      -WorkingDirectory $root
    if ($buildExitCode -ne 0) {
      throw "Next.js build failed with exit code $buildExitCode."
    }
  } finally {
    $env:NEXT_PUBLIC_YCT_BASE_PATH = $previousPublicBasePath
    $env:YCT_BASE_PATH = $previousServerBasePath
    $env:NEXT_PUBLIC_YCT_BUILD_ID = $previousBuildId
    $env:YCT_REQUIRE_PREPARED_RELEASE = $previousRequirePreparedRelease
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

  # `Remove-YctRuntimeEnvironmentFiles` runs inside the staging branch below, so a
  # `-SkipStaging` run reused whatever the previous staging left behind. Next.js copies
  # `apps/web/.env` into `.next/standalone/apps/web/.env`, that file then rides along
  # through `Copy-YctDirectoryChildren`, and the hard assertion below aborts the build
  # with "Deployment staging contains runtime environment files: apps\web\.env" — after
  # the whole expensive build and staging pass had already succeeded. Re-running the
  # cleanup here makes the skip path idempotent instead of dependent on branch history.
  Remove-YctRuntimeEnvironmentFiles -StageRoot $stageRoot
} else {
  if (-not (Test-Path -LiteralPath $standaloneRoot)) {
    throw "Standalone output is missing. Check apps/web/next.config.mjs output: 'standalone'."
  }
  if (-not (Test-Path -LiteralPath $staticRoot)) {
    throw "Next static output is missing: $staticRoot"
  }

  # Clear the previous staging tree. The staging directory is 500 MB+ across ~13k
  # files, so this must use the robocopy-backed helper: a plain recursive delete is
  # slow enough to dominate the build.
  #
  # An earlier revision snapshotted the old tree into `.deploy/web-prev-*` first, to
  # make an interrupted build recoverable. That was a net loss: the snapshot itself
  # costs a full 500 MB copy plus a 500 MB delete on *every* run, and a kill during
  # the snapshot leaves a partial stash that looks like a corrupt stage. Rebuilding
  # from `.next/standalone` is cheap compared to that, so just delete and re-stage.
  if (Test-Path -LiteralPath $stageRoot) {
    Remove-YctDirectoryTree -Path $stageRoot
  }
  $stashRoot = Join-Path $root ".deploy"
  if (Test-Path -LiteralPath $stashRoot) {
    foreach ($staleStash in @(
      Get-ChildItem -LiteralPath $stashRoot -Directory -Filter "web-prev-*" -ErrorAction SilentlyContinue
    )) {
      Remove-YctDirectoryTree -Path $staleStash.FullName
    }
  }
  New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null

  Copy-YctDirectoryChildren -Source $standaloneRoot -Destination $stageRoot

  $standaloneWebRoot = Join-Path $stageRoot "apps\web"
  $standaloneNextRoot = Join-Path $standaloneWebRoot ".next"
  $standaloneWebNodeModules = Join-Path $standaloneWebRoot "node_modules"
  New-Item -ItemType Directory -Force -Path $standaloneNextRoot | Out-Null
  Copy-YctDirectoryTree -Source $staticRoot -Destination (Join-Path $standaloneNextRoot "static")
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
  Assert-YctNextRuntimeDependency `
    -NodeCommand $nodeCommand `
    -NodeModules $standaloneWebNodeModules

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
`$env:NODE_ENV = "production"
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
  $publicRobotsPath = "$publicPathPrefix/robots.txt"
  $publicSitemapPath = "$publicPathPrefix/sitemap.xml"
  $publicLlmsPath = "$publicPathPrefix/llms.txt"
  $publicApiPath = "$publicPathPrefix/api/v1/public"
  $publicOpenApiPath = "$publicPathPrefix/api/v1/public/openapi"
  $buildMountLabel = if ($basePathValue) { $basePathValue } else { "/ (site root)" }

  $deploymentNotes = @"
Yuchengtong web standalone deployment

Build base path: $buildMountLabel
Build id: $buildId
Required Node.js: >=20.9.0. This server currently uses C:\node-v24\node.exe in the examples below.

Recommended deploy command after extracting this bundle to a separate folder:
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\deploy-yct-web.ps1 -TargetRoot "C:\wwwroot\yct-v2"

Deploy and start in one step:
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\deploy-yct-web.ps1 -TargetRoot "C:\wwwroot\yct-v2" -StartAfterDeploy -Port 3300 -HostName 127.0.0.1 -BasePath "$startBasePathArgument" -NodePath "C:\node-v24\node.exe"

Runtime config check example:
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\check-runtime-config.ps1 -BasePath "$startBasePathArgument"

Deployment smoke check example:
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\check-yct-web-smoke.ps1 -Origin "https://yct.shangxiaoguan.top" -BasePath "$startBasePathArgument"

AI/public-data smoke check (included in the deployment smoke check):
  $publicRobotsPath
  $publicSitemapPath
  $publicLlmsPath
  $publicApiPath
  $publicOpenApiPath

Unified internal task runner example:
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\run-yct-internal-tasks.ps1 -Origin http://127.0.0.1:3300 -BasePath "$startBasePathArgument"

One-time legacy content migration preview:
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\migrate-yct-legacy-content.ps1 -Origin http://127.0.0.1:3300 -BasePath "$startBasePathArgument" -EnvironmentRoot "C:\wwwroot\yct-v2"

Continuous player location poller example:
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\run-yct-player-location-poller.ps1 -Origin http://127.0.0.1:3300 -BasePath "$startBasePathArgument" -IntervalSeconds 15

Initialize a YCT administrator without pnpm:
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\init-yct-admin.ps1 -LdpassUserId "<ldpassUserId>"

Start command example:
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\start-yct-web.ps1 -Port 3300 -HostName 127.0.0.1 -BasePath "$startBasePathArgument" -NodePath "C:\node-v24\node.exe"

Notes:
- Do not upload local .env files, .yct-data, or runtime-assets into this bundle.
- ENVIRONMENT.example is a key inventory, not a production environment file. merge-yct-env.ps1 only appends keys that are missing from the existing production .env; it never replaces existing values or secrets.
- Keep real environment files (.env, .env.production, .env.local), server-side runtime stores, runtime-assets, uploaded content assets, logs, and backups outside the deployment bundle. In the extracted deployment directory, place those environment files at the same level as start-yct-web.ps1, .yct-data, and runtime-assets. start-yct-web.ps1 will import them before launching the standalone server.
- start-yct-web.ps1 loads .env -> .env.production -> .env.local -> .env.production.local, and later files override earlier ones. These values also override inherited shell / PM2 environment variables for the same keys so stale localhost settings do not leak into production.
- start-yct-web.ps1 forces NODE_ENV=production. Keep YCT_LOCAL_ADMIN_AUTH_ENABLED=0 in the deployment environment; the local administrator login is only for loopback development.
- check-runtime-config.ps1 reports YCT_LOCAL_ADMIN_AUTH_ENABLED=true as a production warning.
- deploy-yct-web.ps1 will automatically preserve .env, .env.production, .env.local, .env.production.local, .yct-data, runtime-assets, and apps\web\public\content-assets from the old deployment directory before replacing files.
- Dynamic Material Symbols metadata (.yct-data\material-symbol-asset-store.json) and SVG files (runtime-assets\material-symbols) form one persistent dataset. Stop all writers and back up or restore both paths together.
- Admin preview and first-time promotion of a new Material Symbol require outbound HTTPS access from the server to fonts.googleapis.com:443 and fonts.gstatic.com:443. Public rendering uses local assets and must not require visitor access to Google Fonts.
- The current JSON plus filesystem Material Symbols store is single-writer only. Do not run multiple Web writers against separate local disks or concurrently write the same JSON file; migrate to shared database/object storage before horizontal scaling.
- For ordinary releases after the WordPress and legacy content migrations, follow POST_MIGRATION_DEPLOYMENT.md. Do not rerun either one-time migration during deployment.
- For the A+B public-data surface and future MCP boundary, read AI_ACCESS.md before changing public routes, caching, CORS, or canonical URLs.
- Before any server-side configuration or release operation, read SERVER_PRODUCTION_CONFIG_RUNBOOK.md and follow its secret, single-instance, push, ldpass, and data-preservation rules.
- init-yct-admin.ps1 writes .yct-data\admin-memberships.json by default, or YCT_ADMIN_STORE_PATH when that environment variable is set. This file is runtime data and must not be committed.
- run-yct-player-location-poller.ps1 must run as a separate long-lived process with the same YCT_INTERNAL_TASK_TOKEN as the web server. It keeps polling the player provider while no browser is visiting the site, so offline locations are persisted after disconnects.
- If the reverse proxy is mounted at /v2, build and start with BasePath /v2. If it is mounted at the site root later, rebuild with an empty BasePath.
- Stop the old process before deployment and unpack this bundle into an empty deployment directory, or clean the old standalone files first. Do not merge it over an old .next directory: server.js, .next/server, and .next/static must come from the same build.
- When replacing an existing deployment in place, preserve at least .yct-data, runtime-assets, and apps\web\public\content-assets from the old directory before clearing files. Copying only .yct-data is not enough if the site already contains uploaded content assets or POI category icons.
- If returning users still see an older version, check that the old Node process is stopped, the deployment directory does not contain stale .next/static files, and the reverse proxy or browser Service Worker is not serving cached HTML/RSC responses.
- After deployment, $publicHealthPath should return JSON containing buildId '$buildId' and basePath '$basePathValue'. Then $publicMapPath, $publicMarkerPath, $publicServiceWorkerPath, and the $publicStaticPath assets referenced by the page HTML should all return 200. The first line of $publicServiceWorkerPath should contain: const YCT_SW_VERSION = '$buildId';
- The A+B public-data surface must remain on the same public origin and BasePath: $publicRobotsPath, $publicSitemapPath, $publicLlmsPath, $publicApiPath, and $publicOpenApiPath. Do not route these paths to the legacy static site or an internal API.
- YCT_PUBLIC_SITE_URL must be the public origin only (for example, https://yct.shangxiaoguan.top), while BasePath is supplied separately. The public API catalog must not return localhost, 127.0.0.1, 0.0.0.0, or an internal port in canonicalUrl/documentationUrl.
- The public API is read-only and returns only published data. Preserve its Access-Control-Allow-Origin, Cache-Control, and X-Robots-Tag response headers; do not replace them with a blanket no-store or authenticated-only reverse-proxy rule.
- If the reverse proxy applies rate limits, access logs, or caching to $publicApiPath, configure those rules at the proxy layer without changing query strings or the JSON response envelope. Do not invent a rate limit value without checking expected traffic and the server capacity.
- llms.txt is a navigation document, not a source of time-sensitive facts. AI clients should follow $publicOpenApiPath and inspect sourceStatus, generatedAt, asOf, timezone, and canonicalUrl before presenting data.
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
  Copy-Item -LiteralPath (Join-Path $root "docs\SERVER_PRODUCTION_CONFIG_RUNBOOK.md") -Destination (Join-Path $stageRoot "SERVER_PRODUCTION_CONFIG_RUNBOOK.md") -Force
  Copy-Item -LiteralPath (Join-Path $root "docs\DEPLOYMENT.md") -Destination (Join-Path $stageRoot "DEPLOYMENT.md") -Force
  Copy-Item -LiteralPath (Join-Path $root "docs\AI_ACCESS.md") -Destination (Join-Path $stageRoot "AI_ACCESS.md") -Force
  Copy-Item -LiteralPath (Join-Path $root "docs\DATA_MIGRATION.md") -Destination (Join-Path $stageRoot "DATA_MIGRATION.md") -Force
  Copy-Item -LiteralPath (Join-Path $root "docs\LDPASS_INTEGRATION.md") -Destination (Join-Path $stageRoot "LDPASS_INTEGRATION.md") -Force
  Copy-Item -LiteralPath (Join-Path $root "docs\RIDE_CODE_GATEWAY.md") -Destination (Join-Path $stageRoot "RIDE_CODE_GATEWAY.md") -Force
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

if ($ValidateOnly -or $SkipArchive) {
  # Count the staged tree so a skipped archive still reports something checkable.
  # `Get-ChildItem -Recurse` over ~13k files is the honest source of truth here; the
  # numbers are compared against the 0829 baseline (25590 entries / 272.8 MiB) whenever
  # a release candidate is cut.
  $stagedFiles = @(Get-ChildItem -LiteralPath $stageRoot -Recurse -Force -File -ErrorAction SilentlyContinue)
  $stagedBytes = ($stagedFiles | Measure-Object -Property Length -Sum).Sum
  $result = [pscustomobject]@{
    ValidationOnly = [bool]$ValidateOnly
    ArchiveSkipped = [bool]$SkipArchive
    StagingDirectory = $stageRoot
    SkippedStaging = [bool]$SkipStaging
    BasePath = $basePathValue
    BuildId = $reportedBuildId
    StagedFileCount = $stagedFiles.Count
    StagedTotalBytes = [long]$stagedBytes
    StagedTotalMiB = [math]::Round($stagedBytes / 1MB, 2)
    StartScript = "start-yct-web.ps1"
    DeployScript = "deploy-yct-web.ps1"
    ConfigCheckScript = "check-runtime-config.ps1"
    EnvMergeScript = "merge-yct-env.ps1"
    RootMigrationGuide = "ROOT_PATH_MIGRATION.md"
    PostMigrationDeploymentGuide = "POST_MIGRATION_DEPLOYMENT.md"
    LegacyContentMigrationGuide = "LEGACY_CONTENT_MIGRATION.md"
    ServerProductionConfigRunbook = "SERVER_PRODUCTION_CONFIG_RUNBOOK.md"
    AiAccessGuide = "AI_ACCESS.md"
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
$checksumPath = "$artifactPath.sha256"
$temporaryChecksumPath = "$checksumPath.tmp"
$archiveTool = $null

# Guard against the failure that shipped four broken bundles: a staging tree that looks
# fine by exit code but is missing its runtime dependency closure. The tell is bulk —
# `node_modules/.pnpm/**` carries the whole Next/React/sharp/@resvg payload for
# `server.js`. A healthy bundle is ~25590 entries; the broken ones came in around 1300
# root-module files against a 11732-file baseline.
#
# These floors are deliberately far below the observed values so they only trip on real
# loss, not on normal dependency churn.
$stagedPackageRoot = Join-Path $stageRoot "node_modules"
$minimumStagedNodeModulesFiles = 8000
$minimumPnpmEntryCount = 12

$stagedNodeModulesFiles = @(
  Get-ChildItem -LiteralPath $stagedPackageRoot -Recurse -Force -File -ErrorAction SilentlyContinue
)
$stagedPnpmEntries = @(
  Get-ChildItem -LiteralPath (Join-Path $stagedPackageRoot ".pnpm") -Force -Directory -ErrorAction SilentlyContinue
)

Write-Host "Staged node_modules: $($stagedNodeModulesFiles.Count) files, $($stagedPnpmEntries.Count) .pnpm entries."

if ($stagedNodeModulesFiles.Count -lt $minimumStagedNodeModulesFiles) {
  throw "Deployment staging looks truncated: node_modules holds $($stagedNodeModulesFiles.Count) files, expected at least $minimumStagedNodeModulesFiles. The runtime dependency closure (next/react/@swc/helpers/sharp/@resvg) is probably missing, which produces 500s and 404s after deployment."
}
if ($stagedPnpmEntries.Count -lt $minimumPnpmEntryCount) {
  throw "Deployment staging looks truncated: node_modules/.pnpm holds $($stagedPnpmEntries.Count) package entries, expected at least $minimumPnpmEntryCount."
}

if (Test-Path -LiteralPath $artifactPath) {
  Remove-Item -LiteralPath $artifactPath -Force
}
if (Test-Path -LiteralPath $temporaryArtifactPath) {
  Remove-Item -LiteralPath $temporaryArtifactPath -Force
}
if (Test-Path -LiteralPath $checksumPath) {
  Remove-Item -LiteralPath $checksumPath -Force
}
if (Test-Path -LiteralPath $temporaryChecksumPath) {
  Remove-Item -LiteralPath $temporaryChecksumPath -Force
}

try {
  if ($ArchiveFormat -eq "tar.gz") {
    if ($null -eq $tar) {
      throw "tar.exe is required to create a tar.gz deployment artifact."
    }
    $archiveTool = $tar.Source
    # Blocking invocation (rather than `& tar ...`) so the checksum step below cannot
    # hash a half-written archive. See `Invoke-YctCommand` for the details.
    $tarExitCode = Invoke-YctCommand `
      -FilePath $tar.Source `
      -Arguments @("-czf", $temporaryArtifactPath, "-C", $stageRoot, ".")
    if ($tarExitCode -ne 0) {
      throw "tar.exe failed to create deployment artifact with exit code $tarExitCode."
    }
  } elseif ($ArchiveFormat -eq "tar") {
    if ($null -eq $tar) {
      throw "tar.exe is required to create a tar deployment artifact."
    }
    $archiveTool = $tar.Source
    $tarExitCode = Invoke-YctCommand `
      -FilePath $tar.Source `
      -Arguments @("-cf", $temporaryArtifactPath, "-C", $stageRoot, ".")
    if ($tarExitCode -ne 0) {
      throw "tar.exe failed to create deployment artifact with exit code $tarExitCode."
    }
  } elseif ($null -ne $sevenZip) {
    $archiveTool = $sevenZip
    $sevenZipExitCode = Invoke-YctCommand `
      -FilePath $sevenZip `
      -Arguments @("a", "-tzip", "-mx=5", $temporaryArtifactPath, ".\*") `
      -WorkingDirectory $stageRoot
    if ($sevenZipExitCode -ne 0) {
      throw "7-Zip failed to create deployment artifact with exit code $sevenZipExitCode."
    }
  } elseif ($null -ne $tar) {
    $archiveTool = $tar.Source
    $tarExitCode = Invoke-YctCommand `
      -FilePath $tar.Source `
      -Arguments @("-a", "-cf", $temporaryArtifactPath, "-C", $stageRoot, ".")
    if ($tarExitCode -ne 0) {
      throw "tar.exe failed to create deployment artifact with exit code $tarExitCode."
    }
  } else {
    $archiveTool = "Compress-Archive"
    Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $temporaryArtifactPath -CompressionLevel Optimal
  }

  $artifactSha256 = Get-YctFileSha256 -Path $temporaryArtifactPath
  $checksumLine = "$artifactSha256  $([System.IO.Path]::GetFileName($artifactPath))$([Environment]::NewLine)"
  Write-YctUtf8File -Path $temporaryChecksumPath -Content $checksumLine

  Move-Item -LiteralPath $temporaryArtifactPath -Destination $artifactPath -Force
  Move-Item -LiteralPath $temporaryChecksumPath -Destination $checksumPath -Force
} catch {
  if (Test-Path -LiteralPath $temporaryArtifactPath) {
    Remove-Item -LiteralPath $temporaryArtifactPath -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $temporaryChecksumPath) {
    Remove-Item -LiteralPath $temporaryChecksumPath -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $artifactPath) {
    Remove-Item -LiteralPath $artifactPath -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $checksumPath) {
    Remove-Item -LiteralPath $checksumPath -Force -ErrorAction SilentlyContinue
  }
  throw
}

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
  ServerProductionConfigRunbook = "SERVER_PRODUCTION_CONFIG_RUNBOOK.md"
  AiAccessGuide = "AI_ACCESS.md"
  InitAdminScript = "init-yct-admin.ps1"
  NodeRequirement = ">=20.9.0"
}

Write-Output ($result | ConvertTo-Json -Depth 4)
