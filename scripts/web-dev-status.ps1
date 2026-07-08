param(
  [int]$Port = 3300,
  [string]$HostName = "127.0.0.1",
  [int]$LogTail = 20
)

. (Join-Path $PSScriptRoot "web-dev-common.ps1")

$root = Get-YctRepoRoot
$logs = Get-YctWebDevLogPaths -Root $root -Port $Port
$processes = Get-YctWebDevProcessInfo -Root $root -Port $Port -HostName $HostName
$meta = Read-YctWebDevMeta -Path $logs.Meta

$result = [pscustomobject]@{
  Status = if (@($processes).Count -gt 0) { "listening" } else { "stopped" }
  Url = "http://$HostName`:$Port"
  BasePath = if ($null -ne $meta -and $null -ne $meta.BasePath) { [string]$meta.BasePath } else { "" }
  Processes = $processes
  OutputLog = $logs.Output
  ErrorLog = $logs.Error
  OutputTail = Get-YctLogTail -Path $logs.Output -Lines $LogTail
  ErrorTail = Get-YctLogTail -Path $logs.Error -Lines $LogTail
}

Write-Output ($result | ConvertTo-Json -Depth 6)
