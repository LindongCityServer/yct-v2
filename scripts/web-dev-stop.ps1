param(
  [int]$Port = 3300,
  [string]$HostName = "127.0.0.1",
  [int]$TimeoutSeconds = 15
)

. (Join-Path $PSScriptRoot "web-dev-common.ps1")

$root = Get-YctRepoRoot
$logs = Get-YctWebDevLogPaths -Root $root -Port $Port
$processes = Get-YctWebDevProcessInfo -Root $root -Port $Port -HostName $HostName
$candidates = @($processes | Where-Object { $_.IsYctCandidate })
$blocked = @($processes | Where-Object { -not $_.IsYctCandidate })
$stopped = @()

function Test-YctCommandLineInRepo {
  param([string]$CommandLine, [string]$RepositoryRoot)

  if ([string]::IsNullOrWhiteSpace($CommandLine)) {
    return $false
  }

  return $CommandLine.IndexOf($RepositoryRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Stop-YctProcessTree {
  param([int]$ProcessId)

  $children = @(
    Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue
  )
  foreach ($child in $children) {
    Stop-YctProcessTree -ProcessId ([int]$child.ProcessId)
  }

  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

# next dev 的 stdout/stderr 由最外层 cmd.exe 重定向到日志文件。只停监听端口的
# node 进程时，cmd/pnpm 仍然持有日志句柄，下一次启动会在“清空日志”处失败。
# 因此先停掉整条启动链：优先使用 meta 里的 LauncherProcessId，缺失时用
# “命令行包含本次日志路径 + 仓库根目录”兜底识别。
$launcherIds = New-Object 'System.Collections.Generic.HashSet[int]'
$meta = Read-YctWebDevMeta -Path $logs.Meta
if ($null -ne $meta -and $meta.LauncherProcessId) {
  [void]$launcherIds.Add([int]$meta.LauncherProcessId)
}
foreach ($process in Get-CimInstance Win32_Process -ErrorAction SilentlyContinue) {
  $commandLine = [string]$process.CommandLine
  if (-not (Test-YctCommandLineInRepo -CommandLine $commandLine -RepositoryRoot $root)) {
    continue
  }
  if ($commandLine.IndexOf($logs.Output, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
    continue
  }
  [void]$launcherIds.Add([int]$process.ProcessId)
}

foreach ($launcherId in $launcherIds) {
  $launcher = Get-CimInstance Win32_Process -Filter "ProcessId=$launcherId" -ErrorAction SilentlyContinue
  if ($null -eq $launcher) {
    continue
  }

  $commandLine = [string]$launcher.CommandLine
  # PID 可能被复用：只有确认它仍属于本仓库的 next dev 启动链才允许杀整棵树。
  if (-not (Test-YctCommandLineInRepo -CommandLine $commandLine -RepositoryRoot $root)) {
    continue
  }
  $isLogLauncher =
    $commandLine.IndexOf($logs.Output, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
  $isNextProcess = $commandLine.IndexOf('next', [System.StringComparison]::OrdinalIgnoreCase) -ge 0
  if (-not $isLogLauncher -and -not $isNextProcess) {
    continue
  }

  Stop-YctProcessTree -ProcessId $launcherId
  $stopped += [pscustomobject]@{
    ProcessId = $launcherId
    Name = [string]$launcher.Name
    CommandLine = $commandLine
  }
}

foreach ($candidate in $candidates) {
  Stop-Process -Id $candidate.ProcessId -Force -ErrorAction SilentlyContinue
  if (@($stopped | Where-Object { $_.ProcessId -eq $candidate.ProcessId }).Count -eq 0) {
    $stopped += $candidate
  }
}

if (@($blocked).Count -gt 0) {
  $ids = ($blocked | ForEach-Object { $_.ProcessId }) -join ", "
  throw "Port $Port is used by non-YCT processes. This script will not stop them automatically: $ids"
}

$isClosed = Wait-YctWebDevPort -Port $Port -HostName $HostName -TimeoutSeconds $TimeoutSeconds
if (-not $isClosed) {
  throw "Tried to stop the YCT web dev server, but port $Port is still listening."
}

if (Test-Path -LiteralPath $logs.Meta) {
  Remove-Item -LiteralPath $logs.Meta -Force
}

$result = [pscustomobject]@{
  Status = "stopped"
  Port = $Port
  StoppedProcessIds = @($stopped | ForEach-Object { $_.ProcessId })
}

Write-Output ($result | ConvertTo-Json -Depth 4)
