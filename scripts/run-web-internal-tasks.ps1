[CmdletBinding(PositionalBinding = $false)]
param(
  [string]$Origin = "http://127.0.0.1:3300",
  [string]$BasePath = $env:YCT_DEPLOY_BASE_PATH,
  [string]$TaskToken = $env:YCT_INTERNAL_TASK_TOKEN,
  [int]$Limit,
  [int]$EventLimit,
  [int]$PushLimit,
  [string]$Now = "",
  [string]$ActorId = "task_runner",
  [switch]$SkipOperationsReminderSync,
  [switch]$ForceOperationsReminderRefresh
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
$targetUrl = "$normalizedOrigin$normalizedBasePath/api/internal/tasks/run"

$body = @{
  actorId = $ActorId
  syncOperationsReminders = -not $SkipOperationsReminderSync.IsPresent
  forceOperationsReminderRefresh = $ForceOperationsReminderRefresh.IsPresent
}

if ($PSBoundParameters.ContainsKey("Limit")) {
  $body.limit = $Limit
}
if ($PSBoundParameters.ContainsKey("EventLimit")) {
  $body.eventLimit = $EventLimit
}
if ($PSBoundParameters.ContainsKey("PushLimit")) {
  $body.pushLimit = $PushLimit
}
if (-not [string]::IsNullOrWhiteSpace($Now)) {
  $body.now = $Now
}

$jsonBody = $body | ConvertTo-Json -Depth 5
$response = Invoke-RestMethod `
  -Method Post `
  -Uri $targetUrl `
  -Headers @{ Authorization = "Bearer $TaskToken" } `
  -ContentType "application/json; charset=utf-8" `
  -Body $jsonBody

# 由内部任务在后台刷新公开地图快照，避免 AI 请求承担外部地图源的冷启动耗时。
$mapMarkerUrl = "$normalizedOrigin$normalizedBasePath/api/map/markers"
$mapMarkerResponse = Invoke-WebRequest `
  -Uri $mapMarkerUrl `
  -Headers @{ "Cache-Control" = "no-cache" } `
  -SkipHttpErrorCheck
$mapMarkerJson = $mapMarkerResponse.Content | ConvertFrom-Json
$response | Add-Member -NotePropertyName mapMarkerSnapshot -NotePropertyValue ([pscustomobject]@{
  url = $mapMarkerUrl
  statusCode = [int]$mapMarkerResponse.StatusCode
  sourceStatus = [string]$mapMarkerJson.meta.sourceStatus
  fetchedAt = [string]$mapMarkerJson.snapshot.fetchedAt
}) -Force

$response | ConvertTo-Json -Depth 8
