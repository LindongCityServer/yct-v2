[CmdletBinding(PositionalBinding = $false)]
param(
  [string]$Origin = "https://yct.shangxiaoguan.top",
  [string]$BasePath = "",
  [switch]$SkipLdpass,
  [switch]$Json
)

$ErrorActionPreference = "Stop"
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

function Join-YctUrl {
  param(
    [Parameter(Mandatory = $true)][string]$OriginValue,
    [Parameter(Mandatory = $true)][string]$PathValue
  )

  $origin = $OriginValue.TrimEnd("/")
  $path = if ($PathValue.StartsWith("/")) { $PathValue } else { "/$PathValue" }
  return "$origin$path"
}

function Get-YctResponse {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [switch]$AsHead
  )

  $headers = @{
    "Cache-Control" = "no-cache"
    "Pragma" = "no-cache"
  }

  if ($AsHead) {
    $rawHeaders = curl.exe -sS -D - -o NUL $Url -H "Cache-Control: no-cache" -H "Pragma: no-cache"
    return @($rawHeaders -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  }

  return Invoke-WebRequest -Uri $Url -UseBasicParsing -Headers $headers
}

function Read-YctServiceWorkerFirstLine {
  param([Parameter(Mandatory = $true)][string]$Url)

  $response = Get-YctResponse -Url $Url
  $content = [string]$response.Content
  return ($content -split "`r?`n", 2)[0]
}

function Find-YctHeaderValue {
  param(
    [AllowEmptyCollection()][string[]]$HeaderLines = @(),
    [Parameter(Mandatory = $true)][string]$HeaderName
  )

  $prefix = "${HeaderName}:"
  foreach ($line in $HeaderLines) {
    if ($line.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      return $line.Substring($prefix.Length).Trim()
    }
  }

  return $null
}

$normalizedBasePath = Normalize-YctBasePath -Value $BasePath
$cacheBuster = Get-Date -Format "yyyyMMddHHmmss"
$healthUrl = Join-YctUrl -OriginValue $Origin -PathValue "$normalizedBasePath/api/health?check=$cacheBuster"
$mapUrl = Join-YctUrl -OriginValue $Origin -PathValue "$normalizedBasePath/map?check=$cacheBuster"
$markersUrl = Join-YctUrl -OriginValue $Origin -PathValue "$normalizedBasePath/api/map/markers?check=$cacheBuster"
$serviceWorkerUrl = Join-YctUrl -OriginValue $Origin -PathValue "$normalizedBasePath/sw.js?check=$cacheBuster"
$ldpassStartUrl = Join-YctUrl -OriginValue $Origin -PathValue "$normalizedBasePath/api/auth/ldpass/start?check=$cacheBuster"

$healthResponse = Get-YctResponse -Url $healthUrl
$healthJson = $healthResponse.Content | ConvertFrom-Json
$mapResponse = Get-YctResponse -Url $mapUrl
$markersResponse = Get-YctResponse -Url $markersUrl
$serviceWorkerFirstLine = Read-YctServiceWorkerFirstLine -Url $serviceWorkerUrl

$result = [ordered]@{
  origin = $Origin.TrimEnd("/")
  basePath = if ($normalizedBasePath) { $normalizedBasePath } else { "/" }
  checkedAt = (Get-Date).ToString("o")
  health = [ordered]@{
    url = $healthUrl
    statusCode = [int]$healthResponse.StatusCode
    buildId = [string]$healthJson.buildId
    basePath = [string]$healthJson.basePath
  }
  map = [ordered]@{
    url = $mapUrl
    statusCode = [int]$mapResponse.StatusCode
  }
  markers = [ordered]@{
    url = $markersUrl
    statusCode = [int]$markersResponse.StatusCode
  }
  serviceWorker = [ordered]@{
    url = $serviceWorkerUrl
    firstLine = $serviceWorkerFirstLine
  }
}

if (-not $SkipLdpass) {
  $ldpassHeaders = @(Get-YctResponse -Url $ldpassStartUrl -AsHead) | Where-Object { $_ -is [string] }
  $result.ldpass = [ordered]@{
    url = $ldpassStartUrl
    location = Find-YctHeaderValue -HeaderLines $ldpassHeaders -HeaderName "location"
    stateCookie = Find-YctHeaderValue -HeaderLines $ldpassHeaders -HeaderName "set-cookie"
    hasReturnOriginCookie = ($ldpassHeaders | Where-Object { $_ -match '^set-cookie:\s*yct\.ldpass_return_origin=' }).Count -gt 0
  }
}

if ($Json) {
  $result | ConvertTo-Json -Depth 6
  return
}

Write-Output 'YCT deployment smoke check'
Write-Output ("Origin: {0}" -f [string]$result.origin)
Write-Output ("BasePath: {0}" -f [string]$result.basePath)
Write-Output (
  "Health: {0} buildId={1} basePath={2}" -f
  [string]$result.health.statusCode,
  [string]$result.health.buildId,
  [string]$result.health.basePath
)
Write-Output ("Map: {0}" -f [string]$result.map.statusCode)
Write-Output ("Markers: {0}" -f [string]$result.markers.statusCode)
Write-Output ("SW: {0}" -f [string]$result.serviceWorker.firstLine)

if (-not $SkipLdpass) {
  Write-Output ("Ldpass redirect: {0}" -f [string]$result.ldpass.location)
  Write-Output ("Ldpass has return-origin cookie: {0}" -f [string]$result.ldpass.hasReturnOriginCookie)
}
