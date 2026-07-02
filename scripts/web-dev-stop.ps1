param(
  [int]$Port = 3300,
  [string]$HostName = "127.0.0.1",
  [int]$TimeoutSeconds = 15
)

. (Join-Path $PSScriptRoot "web-dev-common.ps1")

$root = Get-YctRepoRoot
$processes = Get-YctWebDevProcessInfo -Root $root -Port $Port -HostName $HostName
$candidates = @($processes | Where-Object { $_.IsYctCandidate })
$blocked = @($processes | Where-Object { -not $_.IsYctCandidate })
$stopped = @()

foreach ($candidate in $candidates) {
  Stop-Process -Id $candidate.ProcessId -Force
  $stopped += $candidate
}

if (@($blocked).Count -gt 0) {
  $ids = ($blocked | ForEach-Object { $_.ProcessId }) -join ", "
  throw "Port $Port is used by non-YCT processes. This script will not stop them automatically: $ids"
}

$isClosed = Wait-YctWebDevPort -Port $Port -HostName $HostName -TimeoutSeconds $TimeoutSeconds
if (-not $isClosed) {
  throw "Tried to stop the YCT web dev server, but port $Port is still listening."
}

$result = [pscustomobject]@{
  Status = "stopped"
  Port = $Port
  StoppedProcessIds = @($stopped | ForEach-Object { $_.ProcessId })
}

Write-Output ($result | ConvertTo-Json -Depth 4)
