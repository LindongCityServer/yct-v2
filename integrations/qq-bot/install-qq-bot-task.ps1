<#
.SYNOPSIS
  把 QQ 机器人注册为 Windows 计划任务，开机自动启动并在崩溃后重启。

.DESCRIPTION
  需要以管理员身份运行 PowerShell。默认使用 SYSTEM 账户、开机触发；
  改用 -AtLogon 时在当前用户登录后启动。

.EXAMPLE
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\install-qq-bot-task.ps1 -NodePath "C:\node-v24\node.exe"

.EXAMPLE
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\install-qq-bot-task.ps1 -Uninstall
#>
param(
  [string]$TaskName = 'YCT QQBOT',
  [string]$NodePath = 'C:\node-v24\node.exe',
  [string]$WorkingDirectory = $PSScriptRoot,
  [switch]$AtLogon,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

# 中文提示按 UTF-8 输出，避免和启动脚本一样在 GBK 控制台里显示乱码。
try {
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
}
catch {
  # 无控制台时忽略。
}

if ($Uninstall) {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -eq $task) {
    Write-Host "计划任务「$TaskName」不存在，无需删除。"
    return
  }
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "已删除计划任务「$TaskName」。"
  return
}

$resolvedWorkingDirectory = (Resolve-Path -LiteralPath $WorkingDirectory).Path
$startScript = Join-Path $resolvedWorkingDirectory 'start-qq-bot.ps1'
if (-not (Test-Path -LiteralPath $startScript)) {
  throw "找不到启动脚本：$startScript"
}
if (-not (Test-Path -LiteralPath $NodePath)) {
  throw "找不到 node.exe：$NodePath。请确认 Node.js 22+（推荐 24）的安装路径。"
}

$pwsh = (Get-Command pwsh.exe -ErrorAction Stop).Source
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -NodePath `"$NodePath`""
$action = New-ScheduledTaskAction -Execute $pwsh -Argument $arguments -WorkingDirectory $resolvedWorkingDirectory

if ($AtLogon) {
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
}
else {
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
}

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description '雨城通「问一问」QQ 机器人（Node.js 常驻进程）' `
  -Force | Out-Null

Write-Host "已注册计划任务「$TaskName」。"
Write-Host "启动：Start-ScheduledTask -TaskName `"$TaskName`""
Write-Host "状态：Get-ScheduledTask -TaskName `"$TaskName`" | Get-ScheduledTaskInfo"
Write-Host "日志：$resolvedWorkingDirectory\logs"
