[CmdletBinding(PositionalBinding = $false)]
param(
  [Parameter(Mandatory = $true)][string]$TargetEnv,
  [Parameter(Mandatory = $true)][string]$ExampleEnv,
  [switch]$NoBackup,
  [switch]$CreateIfMissing
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Get-YctEnvKey {
  param([string]$Line)

  $match = [regex]::Match([string]$Line, '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=')
  if ($match.Success) {
    return $match.Groups[1].Value
  }
  return $null
}

$resolvedTargetEnv = [System.IO.Path]::GetFullPath($TargetEnv)
$resolvedExampleEnv = [System.IO.Path]::GetFullPath($ExampleEnv)

if (-not (Test-Path -LiteralPath $resolvedExampleEnv -PathType Leaf)) {
  throw "Environment example does not exist: $resolvedExampleEnv"
}
if (-not (Test-Path -LiteralPath $resolvedTargetEnv -PathType Leaf)) {
  if (-not $CreateIfMissing) {
    throw "Production environment file does not exist: $resolvedTargetEnv. Create it explicitly or rerun with -CreateIfMissing."
  }

  $targetParent = Split-Path -Parent $resolvedTargetEnv
  New-Item -ItemType Directory -Force -Path $targetParent | Out-Null
  Copy-Item -LiteralPath $resolvedExampleEnv -Destination $resolvedTargetEnv -Force
  Write-Output "Created environment file from example: $resolvedTargetEnv"
  Write-Warning "The new environment file contains example defaults. Fill all required production secrets before starting YCT."
  return
}

$targetLines = @(Get-Content -LiteralPath $resolvedTargetEnv -Encoding UTF8)
$exampleLines = @(Get-Content -LiteralPath $resolvedExampleEnv -Encoding UTF8)
$existingKeys = [System.Collections.Generic.HashSet[string]]::new(
  [System.StringComparer]::OrdinalIgnoreCase
)
$duplicateKeys = [System.Collections.Generic.List[string]]::new()

foreach ($line in $targetLines) {
  $key = Get-YctEnvKey -Line $line
  if ($key -and -not $existingKeys.Add($key)) {
    $duplicateKeys.Add($key)
  }
}

$addedLines = [System.Collections.Generic.List[string]]::new()
$addedKeys = [System.Collections.Generic.List[string]]::new()
foreach ($line in $exampleLines) {
  $key = Get-YctEnvKey -Line $line
  if (-not $key -or $existingKeys.Contains($key)) {
    continue
  }

  $addedLines.Add($line)
  $addedKeys.Add($key)
  [void]$existingKeys.Add($key)
}

if ($duplicateKeys.Count -gt 0) {
  Write-Warning "Duplicate keys already exist in the target file: $((@($duplicateKeys) | Sort-Object -Unique) -join ', '). The merge did not change their values."
}
if ($addedLines.Count -eq 0) {
  Write-Output "Environment merge: no missing keys. Existing values were not changed."
  return
}

if (-not $NoBackup) {
  $backupPath = "$resolvedTargetEnv.before-merge-$(Get-Date -Format yyyyMMdd-HHmmss)"
  Copy-Item -LiteralPath $resolvedTargetEnv -Destination $backupPath -Force
  Write-Output "Environment backup: $backupPath"
}

$outputLines = [System.Collections.Generic.List[string]]::new()
foreach ($line in $targetLines) {
  $outputLines.Add($line)
}
if ($outputLines.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace($outputLines[$outputLines.Count - 1])) {
  $outputLines.Add("")
}
$outputLines.Add("# Added from the deployment package on $(Get-Date -Format yyyy-MM-dd)")
foreach ($line in $addedLines) {
  $outputLines.Add($line)
}

[System.IO.File]::WriteAllLines(
  $resolvedTargetEnv,
  [string[]]$outputLines,
  [System.Text.UTF8Encoding]::new($false)
)

Write-Output "Environment merge added $($addedKeys.Count) key(s): $($addedKeys -join ', ')"
Write-Output "Existing values and secrets were not changed. Review newly added blank values before starting YCT."
