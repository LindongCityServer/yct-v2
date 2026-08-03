[CmdletBinding(PositionalBinding = $false)]
param(
  [string]$Origin = "http://127.0.0.1:3300",
  [AllowEmptyString()]
  [string]$BasePath = "",
  [string]$EnvironmentRoot = $PSScriptRoot,
  [string]$TaskToken = "",
  [string]$ActorId = "legacy_content_migrator",
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

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

function ConvertFrom-YctEnvValue {
  param([string]$Value)

  $trimmed = $Value.Trim()
  if ($trimmed.Length -ge 2) {
    $first = $trimmed[0]
    $last = $trimmed[$trimmed.Length - 1]
    if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
      return $trimmed.Substring(1, $trimmed.Length - 2)
    }
  }

  return $trimmed
}

function Get-YctEffectiveEnvironment {
  param([string]$Root)

  $values = @{}
  if (-not [string]::IsNullOrWhiteSpace($env:YCT_INTERNAL_TASK_TOKEN)) {
    $values["YCT_INTERNAL_TASK_TOKEN"] = $env:YCT_INTERNAL_TASK_TOKEN
  }

  foreach ($fileName in @(".env", ".env.production", ".env.local", ".env.production.local")) {
    $filePath = Join-Path $Root $fileName
    if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
      continue
    }

    foreach ($line in Get-Content -LiteralPath $filePath -Encoding UTF8) {
      if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
        $values[$Matches[1]] = ConvertFrom-YctEnvValue -Value $Matches[2]
      }
    }
  }

  return $values
}

function Resolve-YctConfiguredPath {
  param(
    [string]$Root,
    [string]$Value
  )

  if ([System.IO.Path]::IsPathRooted($Value)) {
    return [System.IO.Path]::GetFullPath($Value)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $Root $Value))
}

$resolvedEnvironmentRoot = [System.IO.Path]::GetFullPath($EnvironmentRoot)
if (-not (Test-Path -LiteralPath $resolvedEnvironmentRoot -PathType Container)) {
  throw "EnvironmentRoot 不存在：$resolvedEnvironmentRoot"
}

$effectiveEnvironment = Get-YctEffectiveEnvironment -Root $resolvedEnvironmentRoot
$resolvedTaskToken = if (-not [string]::IsNullOrWhiteSpace($TaskToken)) {
  $TaskToken
} else {
  [string]$effectiveEnvironment["YCT_INTERNAL_TASK_TOKEN"]
}
if ([string]::IsNullOrWhiteSpace($resolvedTaskToken)) {
  throw "未提供 TaskToken，生产 .env* 中也没有 YCT_INTERNAL_TASK_TOKEN。"
}

$legacySource = ([string]$effectiveEnvironment["YCT_LEGACY_DATA_SOURCE"]).Trim().ToLowerInvariant()
$legacyDataDirValue = ([string]$effectiveEnvironment["YCT_LEGACY_DATA_DIR"]).Trim()
if ($legacySource -eq "remote") {
  throw "当前 YCT_LEGACY_DATA_SOURCE=remote。一次性正式迁移必须改为 local 后重启 Web 进程。"
}
if ([string]::IsNullOrWhiteSpace($legacyDataDirValue)) {
  throw "生产 .env* 缺少 YCT_LEGACY_DATA_DIR。"
}

$legacyDataDir = Resolve-YctConfiguredPath `
  -Root $resolvedEnvironmentRoot `
  -Value $legacyDataDirValue
$contentDataPath = Join-Path $legacyDataDir "content_data.js"
if (-not (Test-Path -LiteralPath $contentDataPath -PathType Leaf)) {
  throw "找不到旧运营消息文件：$contentDataPath"
}

$legacyRoot = if ((Split-Path -Leaf $legacyDataDir).ToLowerInvariant() -eq "data") {
  Split-Path -Parent $legacyDataDir
} else {
  $legacyDataDir
}
$legacyContentRoot = Join-Path $legacyRoot "content"
if (-not (Test-Path -LiteralPath $legacyContentRoot -PathType Container)) {
  throw "找不到旧独立内容页面目录：$legacyContentRoot"
}

$legacyHtmlFiles = @(Get-ChildItem -LiteralPath $legacyContentRoot -File -Filter "*.htm*")
$normalizedOrigin = $Origin.Trim().TrimEnd("/")
if ([string]::IsNullOrWhiteSpace($normalizedOrigin)) {
  throw "Origin 不能为空。"
}
$normalizedBasePath = Normalize-YctBasePath -Value $BasePath
$targetUrl = "$normalizedOrigin$normalizedBasePath/api/internal/operations/legacy-content/migrate"
$body = @{
  apply = $Apply.IsPresent
  actorId = $ActorId
} | ConvertTo-Json -Depth 4

Write-Host "YCT 旧内容一次性迁移"
Write-Host "- 模式：$(if ($Apply) { 'apply' } else { 'preview' })"
Write-Host "- 旧运营消息：$contentDataPath"
Write-Host "- 旧 HTML 目录：$legacyContentRoot（发现 $($legacyHtmlFiles.Count) 个文件）"
Write-Host "- 接口：$targetUrl"

try {
  $response = Invoke-RestMethod `
    -Method Post `
    -Uri $targetUrl `
    -Headers @{ Authorization = "Bearer $resolvedTaskToken" } `
    -ContentType "application/json; charset=utf-8" `
    -Body $body
} catch {
  $detail = $_.ErrorDetails.Message
  if ([string]::IsNullOrWhiteSpace($detail)) {
    $detail = $_.Exception.Message
  }
  throw "旧内容迁移接口调用失败：$detail"
}

$response | ConvertTo-Json -Depth 10
