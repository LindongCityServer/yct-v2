param(
  [int]$Port = 3300,
  [string]$HostName = "127.0.0.1",
  [string]$BasePath = "",
  [int]$TimeoutSeconds = 45
)

. (Join-Path $PSScriptRoot "web-dev-common.ps1")

$root = Get-YctRepoRoot
$logs = Get-YctWebDevLogPaths -Root $root -Port $Port
$existing = Get-YctWebDevProcessInfo -Root $root -Port $Port -HostName $HostName

if (@($existing).Count -gt 0) {
  $owned = @($existing | Where-Object { $_.IsYctCandidate })
  if (@($owned).Count -gt 0) {
    throw "Port $Port is already used by the YCT web dev server. Use pnpm web:dev:restart or pnpm web:dev:status."
  }

  throw "Port $Port is already used by another process. Stop that process before starting the YCT web dev server."
}

New-Item -ItemType Directory -Force -Path $logs.Directory | Out-Null
Clear-YctLogFile -Path $logs.Output
Clear-YctLogFile -Path $logs.Error
if (Test-Path -LiteralPath $logs.Meta) {
  Remove-Item -LiteralPath $logs.Meta -Force
}

$pnpm = Get-YctPnpmCommand
$envPrefix = New-YctDevEnvCommandPrefix -BasePath $BasePath
$commandLine = "$envPrefix && `"$pnpm`" --filter @yct/web exec next dev --webpack --hostname $HostName --port $Port > `"$($logs.Output)`" 2> `"$($logs.Error)`""
$cmdArguments = "/d /s /c `"$commandLine`""

$process = Start-Process `
  -FilePath "cmd.exe" `
  -ArgumentList $cmdArguments `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -PassThru

$isReady = Wait-YctWebDevPort -Port $Port -HostName $HostName -TimeoutSeconds $TimeoutSeconds -ExpectOpen
if (-not $isReady) {
  $errorTail = Get-YctLogTail -Path $logs.Error -Lines 30
  $outputTail = Get-YctLogTail -Path $logs.Output -Lines 30
  throw "YCT web dev server startup timed out. stdout: $($outputTail -join ' ') stderr: $($errorTail -join ' ')"
}

$result = [pscustomobject]@{
  Status = "started"
  Url = "http://$HostName`:$Port"
  BasePath = (Normalize-YctBasePath -Value $BasePath)
  LauncherProcessId = $process.Id
  OutputLog = $logs.Output
  ErrorLog = $logs.Error
}

Write-YctWebDevMeta -Path $logs.Meta -Meta ([pscustomobject]@{
  Port = $Port
  HostName = $HostName
  BasePath = (Normalize-YctBasePath -Value $BasePath)
  LauncherProcessId = $process.Id
  StartedAt = (Get-Date).ToString("o")
})

Write-Output ($result | ConvertTo-Json -Depth 4)
