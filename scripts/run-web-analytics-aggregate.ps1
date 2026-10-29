[CmdletBinding(PositionalBinding = $false)]
param(
  [string]$Origin = "http://127.0.0.1:3300",
  [string]$BasePath = $env:YCT_DEPLOY_BASE_PATH,
  [string]$TaskToken = $env:YCT_INTERNAL_TASK_TOKEN,
  [int]$Days = 3,
  [switch]$SkipPurge,
  [string]$Now = ""
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

if ([string]::IsNullOrWhiteSpace($TaskToken)) {
  throw "未提供 TaskToken，也未配置环境变量 YCT_INTERNAL_TASK_TOKEN。"
}

$normalizedOrigin = $Origin.Trim().TrimEnd("/")
if ([string]::IsNullOrWhiteSpace($normalizedOrigin)) {
  throw "Origin 不能为空。"
}

$normalizedBasePath = Normalize-YctBasePath -Value $BasePath
$targetUrl = "$normalizedOrigin$normalizedBasePath/api/internal/analytics/aggregate"

$body = @{
  days = $Days
  purge = -not $SkipPurge.IsPresent
}

if (-not [string]::IsNullOrWhiteSpace($Now)) {
  $body.now = $Now
}

$response = Invoke-RestMethod `
  -Method Post `
  -Uri $targetUrl `
  -Headers @{ Authorization = "Bearer $TaskToken" } `
  -ContentType "application/json; charset=utf-8" `
  -Body ($body | ConvertTo-Json -Depth 5)

$response | ConvertTo-Json -Depth 8
