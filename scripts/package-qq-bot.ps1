<#
.SYNOPSIS
  生成可直接上传的 QQ 机器人自包含部署包。

.DESCRIPTION
  先构建本地卡片渲染器和资源，再用 pnpm deploy 生成带真实 node_modules 的目录，
  最后压缩到 artifacts/qq-bot-时间戳.zip。包内不包含真实 .env、state、logs。
#>
param(
  [string]$Output = ''
)

$ErrorActionPreference = 'Stop'
$env:CI = 'true'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location -LiteralPath $root

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$artifacts = Join-Path $root 'artifacts'
$staging = Join-Path $artifacts "qq-bot-staging-$stamp"
if (-not $Output) {
  $Output = Join-Path $artifacts "qq-bot-$stamp.zip"
}
elseif (-not [System.IO.Path]::IsPathRooted($Output)) {
  $Output = Join-Path $root $Output
}

if (-not $Output.StartsWith($artifacts, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "输出文件必须放在 artifacts 目录下：$Output"
}

Write-Host '同步卡片资源和渲染器...'
& pnpm qqbot:card:assets
& pnpm qqbot:card:build

Write-Host '生成自包含部署目录...'
if (Test-Path -LiteralPath $staging) {
  Remove-Item -LiteralPath $staging -Recurse -Force
}
& pnpm --filter yct-qq-bot deploy --prod --legacy --config.node-linker=hoisted $staging

$required = @(
  (Join-Path $staging 'src\card-renderer.mjs'),
  (Join-Path $staging 'node_modules\@resvg\resvg-js\package.json'),
  (Join-Path $staging 'node_modules\qrcode\package.json'),
  (Join-Path $staging 'assets\fonts\HarmonyOS_Sans_SC_Regular.ttf'),
  (Join-Path $staging 'start-qq-bot.ps1')
)
foreach ($path in $required) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "部署包缺少必要文件：$path"
  }
}

# Compress-Archive 不会跟随 junction：isolated 布局下直接压缩会得到只有 .pnpm、
# 没有 node_modules\@resvg\resvg-js 的坏包。必须用 hoisted 布局并显式检查。
foreach ($linkedPath in @('node_modules\@resvg\resvg-js', 'node_modules\qrcode')) {
  $item = Get-Item -LiteralPath (Join-Path $staging $linkedPath)
  if ($item.LinkType) {
    throw "部署目录里的 $linkedPath 是链接（$($item.LinkType)），压缩后会丢失；请保留 --config.node-linker=hoisted。"
  }
}

if (Test-Path -LiteralPath (Join-Path $staging '.env')) {
  throw '部署目录里出现真实 .env，已中止打包。'
}

if (Test-Path -LiteralPath $Output) {
  Remove-Item -LiteralPath $Output -Force
}
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $Output -CompressionLevel Optimal
$hash = (Get-FileHash -LiteralPath $Output -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath "$Output.sha256" -Value "$hash  $(Split-Path -Leaf $Output)" -Encoding ascii
Remove-Item -LiteralPath $staging -Recurse -Force

Write-Host "机器人部署包：$Output"
Write-Host "SHA-256：$hash"
