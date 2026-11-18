<#
.SYNOPSIS
  启动雨城通「问一问」QQ 机器人，并在进程退出后自动重启。

.DESCRIPTION
  机器人是独立的 Node.js 进程，但本地生图需要同目录的 node_modules 和 assets。
  日志按天写入同目录 logs\qq-bot-yyyyMMdd.log（UTF-8），超过 10MB 时顺延为 .1.log。
  请用 PowerShell 7（pwsh）运行：Windows PowerShell 5.1 会把无 BOM 的 UTF-8 脚本读成乱码。

.EXAMPLE
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\start-qq-bot.ps1

.EXAMPLE
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\start-qq-bot.ps1 -NodePath "C:\node-v24\node.exe" -NoRestart
#>
param(
  [string]$NodePath = 'node',
  [string]$EnvFile = '.env',
  [switch]$NoRestart,
  [int]$RestartDelaySeconds = 5
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

# Node 和日志都使用 UTF-8；中文 Windows 的控制台默认是 GBK，不显式设置会把中文解码成乱码。
$utf8 = [System.Text.UTF8Encoding]::new($false)
try {
  [Console]::OutputEncoding = $utf8
  [Console]::InputEncoding = $utf8
}
catch {
  # 计划任务等没有控制台句柄的场景允许失败，文件日志仍按 UTF-8 写。
}
$OutputEncoding = $utf8

$entry = Join-Path $root 'src\index.mjs'
if (-not (Test-Path -LiteralPath $entry)) {
  throw "找不到入口文件：$entry"
}
if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules\@resvg\resvg-js'))) {
  throw '缺少卡片渲染依赖 node_modules\@resvg\resvg-js，请先按 README 安装并复制 node_modules。'
}

$resolvedNode = $NodePath
if (Test-Path -LiteralPath $NodePath) {
  $resolvedNode = (Resolve-Path -LiteralPath $NodePath).Path
}
else {
  $command = Get-Command $NodePath -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    throw "找不到 Node.js：$NodePath。请安装 Node.js 22+（推荐 24），或用 -NodePath 指定 node.exe 的完整路径。"
  }
  $resolvedNode = $command.Source
}

$envPath = $EnvFile
if (-not [System.IO.Path]::IsPathRooted($EnvFile)) {
  $envPath = Join-Path $root $EnvFile
}
if (-not (Test-Path -LiteralPath $envPath)) {
  Write-Warning "配置文件不存在：$envPath。机器人会使用默认值启动，通常会在 --check 阶段报错。"
}

$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-BotLog {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [AllowEmptyString()][string] $Message
  )
  Write-Host $Message
  try {
    [System.IO.File]::AppendAllText($Path, $Message + [Environment]::NewLine, $script:utf8)
  }
  catch {
    Write-Warning "写入日志失败：$($_.Exception.Message)"
  }
}

# 旧版 Tee-Object 在 Windows PowerShell 下写的是 UTF-16；直接追加会和新日志混在一起。
function Move-LegacyUtf16Log {
  param([Parameter(Mandatory = $true)][string] $Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }
  try {
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
      Move-Item -LiteralPath $Path -Destination ($Path + '.utf16') -Force
    }
  }
  catch {
    # 读不到旧日志就继续追加，不影响机器人启动。
  }
}

$delay = [Math]::Max(1, $RestartDelaySeconds)
while ($true) {
  $logPath = Join-Path $logDir ('qq-bot-{0}.log' -f (Get-Date -Format 'yyyyMMdd'))
  Move-LegacyUtf16Log -Path $logPath
  if ((Test-Path -LiteralPath $logPath) -and ((Get-Item -LiteralPath $logPath).Length -gt 10MB)) {
    Move-Item -LiteralPath $logPath -Destination ($logPath -replace '\.log$', '.1.log') -Force
  }

  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Write-BotLog -Path $logPath -Message "[$stamp] 启动：$resolvedNode $entry --env $envPath"
  $startedAt = Get-Date

  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $resolvedNode $entry --env $envPath 2>&1 | ForEach-Object {
      Write-BotLog -Path $logPath -Message ([string]$_)
    }
  }
  finally {
    $ErrorActionPreference = $previousErrorAction
  }
  $exitCode = $LASTEXITCODE
  $ranSeconds = [Math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)
  Write-BotLog -Path $logPath -Message "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 退出码 $exitCode，运行 $ranSeconds 秒"

  if ($NoRestart) {
    exit $exitCode
  }

  # 连续快速失败时拉长重启间隔，避免配置错误把日志刷爆。
  if ($ranSeconds -lt 30) {
    $delay = [Math]::Min(60, $delay * 2)
  }
  else {
    $delay = [Math]::Max(1, $RestartDelaySeconds)
  }
  Write-BotLog -Path $logPath -Message "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 等待 $delay 秒后重启"
  Start-Sleep -Seconds $delay
}
