[CmdletBinding(PositionalBinding = $false)]
param(
  [string]$Origin = "http://127.0.0.1:3300",
  [string]$BasePath = $env:YCT_DEPLOY_BASE_PATH,
  [string]$TaskToken = $env:YCT_INTERNAL_TASK_TOKEN,
  [int]$Days = 3,
  [switch]$SkipPurge,
  [string]$Now = "",
  # 部署根目录：脚本位于部署根时默认就是脚本所在目录，用于读取 .env 与写日志。
  [string]$EnvironmentRoot = "",
  [string]$LogPath = "",
  # 用当前 PowerShell 解释器注册每天执行一次的计划任务，token 仍从 .env 读取。
  [switch]$RegisterDailyTask,
  [string]$TaskName = "YCT Analytics Aggregate",
  [string]$TaskTime = "03:05",
  [switch]$UnregisterTask
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

# 计划任务不会加载 .env，这里显式按键解析，避免把 token 写进任务命令行。
function Get-YctEnvValue {
  param(
    [string]$Root,
    [string]$Key
  )

  if ([string]::IsNullOrWhiteSpace($Root)) {
    return ""
  }

  $envFile = Join-Path $Root ".env"
  if (-not (Test-Path -LiteralPath $envFile)) {
    return ""
  }

  foreach ($line in Get-Content -LiteralPath $envFile -Encoding UTF8) {
    if ($line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*)$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }

  return ""
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

if ([string]::IsNullOrWhiteSpace($EnvironmentRoot)) {
  $EnvironmentRoot = if (Test-Path -LiteralPath (Join-Path $PSScriptRoot ".env")) {
    $PSScriptRoot
  } else {
    (Get-Location).Path
  }
}
$EnvironmentRoot = (Resolve-Path -LiteralPath $EnvironmentRoot).Path

if ($UnregisterTask) {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $existing) {
    Write-Output "计划任务不存在：$TaskName"
    return
  }
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Output "已删除计划任务：$TaskName"
  return
}

if ([string]::IsNullOrWhiteSpace($TaskToken)) {
  $TaskToken = Get-YctEnvValue -Root $EnvironmentRoot -Key "YCT_INTERNAL_TASK_TOKEN"
}
if ([string]::IsNullOrWhiteSpace($TaskToken)) {
  throw "未提供 TaskToken：请设置环境变量 YCT_INTERNAL_TASK_TOKEN，或在 $EnvironmentRoot\.env 中配置。"
}

if ($RegisterDailyTask) {
  $selfPath = $MyInvocation.MyCommand.Path
  if ([string]::IsNullOrWhiteSpace($selfPath)) {
    throw "无法确定脚本自身路径，注册计划任务失败。"
  }

  $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$selfPath`" -EnvironmentRoot `"$EnvironmentRoot`""
  $action = New-ScheduledTaskAction -Execute (Get-Process -Id $PID).Path -Argument $arguments
  $trigger = New-ScheduledTaskTrigger -Daily -At $TaskTime
  $settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
    -MultipleInstances IgnoreNew

  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -User "SYSTEM" `
    -RunLevel Highest `
    -Force | Out-Null

  Write-Output "已注册计划任务：$TaskName（每天 $TaskTime，工作根目录 $EnvironmentRoot）"
  return
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

if ([string]::IsNullOrWhiteSpace($LogPath)) {
  $LogPath = Join-Path $EnvironmentRoot ".yct-data\analytics\aggregate-task.log"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogPath) | Out-Null

try {
  $response = Invoke-RestMethod `
    -Method Post `
    -Uri $targetUrl `
    -Headers @{ Authorization = "Bearer $TaskToken" } `
    -ContentType "application/json; charset=utf-8" `
    -Body ($body | ConvertTo-Json -Depth 5)

  $response | ConvertTo-Json -Depth 8
  "$(Get-Date -Format o) ok $($response | ConvertTo-Json -Compress -Depth 8)" |
    Add-Content -LiteralPath $LogPath -Encoding UTF8
} catch {
  "$(Get-Date -Format o) failed $($_.Exception.Message)" |
    Add-Content -LiteralPath $LogPath -Encoding UTF8
  throw
}
