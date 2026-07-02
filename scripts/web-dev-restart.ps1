param(
  [int]$Port = 3300,
  [string]$HostName = "127.0.0.1",
  [int]$TimeoutSeconds = 45
)

$stopScript = Join-Path $PSScriptRoot "web-dev-stop.ps1"
$startScript = Join-Path $PSScriptRoot "web-dev-start.ps1"

function Convert-YctScriptOutput {
  param([object[]]$Lines)

  $text = ($Lines | Out-String).Trim()
  if ([string]::IsNullOrWhiteSpace($text)) {
    return $null
  }

  try {
    return $text | ConvertFrom-Json
  } catch {
    return $text
  }
}

$stopResult = Convert-YctScriptOutput -Lines (& $stopScript -Port $Port -HostName $HostName)
$startResult = Convert-YctScriptOutput -Lines (& $startScript -Port $Port -HostName $HostName -TimeoutSeconds $TimeoutSeconds)

$result = [pscustomobject]@{
  Status = "restarted"
  Stop = $stopResult
  Start = $startResult
}

Write-Output ($result | ConvertTo-Json -Depth 6)
