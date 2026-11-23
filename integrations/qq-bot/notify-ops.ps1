<#
.SYNOPSIS
  向 QQ 机器人发送一条运维提醒（雨城通 / 临东通 / QQ 机器人更新）。

.DESCRIPTION
  机器人事件桥需要开启 QQ_BOT_EVENT_PORT，并配置 QQ_BOT_OPS_TOKEN。
  脚本只负责 POST http://127.0.0.1:<port>/ops，不直接连 QQ。
  通知会私聊发给“给机器人发过消息的好友”（个人认证下通常就是核心管理员），不再发群。
  同一次更新的开始和结束必须传同一个 -UpdateId；不传时脚本会生成一个并打印出来。

.EXAMPLE
  .\notify-ops.ps1 -System yct -Phase start -Version 2.26.0 -ExpectedMinutes 10 -Summary "车站资料维护"

.EXAMPLE
  .\notify-ops.ps1 -System yct -Phase end -UpdateId ops-20261123-200000-a1b2c3d4 -Version 2.26.0
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('yct', 'ldpass', 'qqbot')]
  [string]$System,

  [Parameter(Mandatory = $true)]
  [ValidateSet('start', 'end', 'failed', 'rolled_back', 'cancelled')]
  [string]$Phase,

  [string]$UpdateId = '',
  [string]$Version = '',
  [string]$BuildId = '',
  [string]$Summary = '',
  [string]$Impact = '',
  [string]$Reason = '',
  [ValidateRange(0, 180)]
  [int]$ExpectedMinutes = 0,

  [string]$Url = 'http://127.0.0.1:8765/ops',
  [string]$Token = $env:QQ_BOT_OPS_TOKEN,
  [string]$TokenFile = '',
  [switch]$DryRun,
  [switch]$BestEffort
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

if ([string]::IsNullOrWhiteSpace($Token) -and -not [string]::IsNullOrWhiteSpace($TokenFile)) {
  if (-not (Test-Path -LiteralPath $TokenFile)) {
    throw "找不到 TokenFile：$TokenFile"
  }
  $Token = (Get-Content -LiteralPath $TokenFile -Encoding UTF8 |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
    Select-Object -First 1).Trim()
}

if ([string]::IsNullOrWhiteSpace($Token) -and -not $DryRun) {
  if ($BestEffort) {
    Write-Warning '缺少 QQ_BOT_OPS_TOKEN，跳过运维提醒。'
    return
  }
  throw '缺少 QQ_BOT_OPS_TOKEN，或通过 -Token / -TokenFile 传入。'
}

if ([string]::IsNullOrWhiteSpace($UpdateId)) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $suffix = [guid]::NewGuid().ToString('N').Substring(0, 8)
  $UpdateId = "ops-$stamp-$suffix"
  if ($Phase -ne 'start') {
    Write-Warning "没有传 -UpdateId，已生成 $UpdateId；它和开始通知的 id 不同，结束/异常通知会用不到开始时间。"
  }
}

$body = [ordered]@{
  system = $System
  phase = $Phase
  updateId = $UpdateId
}
if (-not [string]::IsNullOrWhiteSpace($Version)) { $body.version = $Version }
if (-not [string]::IsNullOrWhiteSpace($BuildId)) { $body.buildId = $BuildId }
if (-not [string]::IsNullOrWhiteSpace($Summary)) { $body.summary = $Summary }
if (-not [string]::IsNullOrWhiteSpace($Impact)) { $body.impact = $Impact }
if (-not [string]::IsNullOrWhiteSpace($Reason)) { $body.reason = $Reason }
if ($ExpectedMinutes -gt 0) { $body.expectedMinutes = $ExpectedMinutes }

$json = $body | ConvertTo-Json -Depth 5

if ($DryRun) {
  Write-Output $json
  return
}

try {
  $response = Invoke-RestMethod `
    -Method Post `
    -Uri $Url `
    -Headers @{ Authorization = "Bearer $Token" } `
    -ContentType 'application/json; charset=utf-8' `
    -Body $json `
    -TimeoutSec 20

  $response | ConvertTo-Json -Depth 8
  if ($response.reason -eq 'no_recipients') {
    Write-Warning '还没有好友给机器人发过私聊消息；请先私聊机器人任意一条消息，再重发运维提醒。'
  }
  if (@($response.failed).Count -gt 0) {
    Write-Warning "部分私聊发送失败：$($response.failed -join '、')"
  }
  if (@($response.failureCodes).Count -gt 0) {
    Write-Warning "QQ 返回错误码：$($response.failureCodes -join '、')。$($response.hint)"
  }
  if ($response.pending -gt 0) {
    Write-Warning "已保留 $($response.pending) 条待补发通知；私聊机器人发送 /运维 可补发。"
  }
  if ($response.sent -eq 0 -and $response.reason -ne 'no_recipients' -and $response.duplicate -ne $true) {
    Write-Warning '本次没有成功发送到任何私聊，请查看机器人日志。'
  }
}
catch {
  if ($BestEffort) {
    Write-Warning "发送运维提醒失败，已按 BestEffort 跳过：$($_.Exception.Message)"
    return
  }
  Write-Host "发送运维提醒失败：$($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
