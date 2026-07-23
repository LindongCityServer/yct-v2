[CmdletBinding(PositionalBinding = $false)]
param(
  [string]$Origin = "http://127.0.0.1:3300",
  [string]$BasePath = $env:YCT_DEPLOY_BASE_PATH,
  [string]$TaskToken = $env:YCT_INTERNAL_TASK_TOKEN,
  [ValidateRange(5, 3600)]
  [int]$IntervalSeconds = 15,
  [string]$ActorId = "player_location_poller"
)

$ErrorActionPreference = "Continue"
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
  throw "TaskToken is required. Set YCT_INTERNAL_TASK_TOKEN or pass -TaskToken."
}

$normalizedOrigin = $Origin.Trim().TrimEnd("/")
if ([string]::IsNullOrWhiteSpace($normalizedOrigin)) {
  throw "Origin cannot be empty."
}

$normalizedBasePath = Normalize-YctBasePath -Value $BasePath
$targetUrl = "$normalizedOrigin$normalizedBasePath/api/internal/player-locations/sync"
$body = @{ actorId = $ActorId } | ConvertTo-Json -Depth 3

Write-Output "Player location poller started: $targetUrl (every ${IntervalSeconds}s)."
while ($true) {
  try {
    $response = Invoke-RestMethod `
      -Method Post `
      -Uri $targetUrl `
      -Headers @{ Authorization = "Bearer $TaskToken" } `
      -ContentType "application/json; charset=utf-8" `
      -Body $body

    $onlineCount = if ($null -ne $response.onlineCount) { $response.onlineCount } else { 0 }
    Write-Output "[$(Get-Date -Format o)] Player location sync: $($response.status), online $onlineCount."
  } catch {
    Write-Warning "[$(Get-Date -Format o)] Player location sync failed: $($_.Exception.Message)"
  }

  Start-Sleep -Seconds $IntervalSeconds
}
