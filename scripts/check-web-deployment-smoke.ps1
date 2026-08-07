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
$robotsUrl = Join-YctUrl -OriginValue $Origin -PathValue "$normalizedBasePath/robots.txt?check=$cacheBuster"
$sitemapUrl = Join-YctUrl -OriginValue $Origin -PathValue "$normalizedBasePath/sitemap.xml?check=$cacheBuster"
$llmsUrl = Join-YctUrl -OriginValue $Origin -PathValue "$normalizedBasePath/llms.txt?check=$cacheBuster"
$publicApiUrl = Join-YctUrl -OriginValue $Origin -PathValue "$normalizedBasePath/api/v1/public?check=$cacheBuster"
$publicOpenApiUrl = Join-YctUrl -OriginValue $Origin -PathValue "$normalizedBasePath/api/v1/public/openapi?check=$cacheBuster"

$healthResponse = Get-YctResponse -Url $healthUrl
$healthJson = $healthResponse.Content | ConvertFrom-Json
$mapResponse = Get-YctResponse -Url $mapUrl
$markersResponse = Get-YctResponse -Url $markersUrl
$serviceWorkerFirstLine = Read-YctServiceWorkerFirstLine -Url $serviceWorkerUrl
$robotsResponse = Get-YctResponse -Url $robotsUrl
$sitemapResponse = Get-YctResponse -Url $sitemapUrl
$llmsResponse = Get-YctResponse -Url $llmsUrl
$publicApiResponse = Get-YctResponse -Url $publicApiUrl
$publicApiJson = $publicApiResponse.Content | ConvertFrom-Json
$publicOpenApiResponse = Get-YctResponse -Url $publicOpenApiUrl
$publicOpenApiJson = $publicOpenApiResponse.Content | ConvertFrom-Json

if ($robotsResponse.Content -notmatch '/api/v1/public') {
  throw "robots.txt does not advertise the versioned public API allow rule."
}
if ($sitemapResponse.Content -notmatch '<(?:urlset|sitemapindex)(?:\s|>)') {
  throw "sitemap.xml did not return a sitemap document."
}
if ($llmsResponse.Content -notmatch '/api/v1/public/openapi') {
  throw "llms.txt does not link to the public OpenAPI document."
}
if ([string]$publicApiJson.meta.apiVersion -ne 'v1') {
  throw "Public API catalog did not return apiVersion v1."
}
if ([string]$publicOpenApiJson.openapi -notmatch '^3\.1(?:\.|$)') {
  throw "Public OpenAPI document did not return an OpenAPI 3.1 version."
}

$publicCanonicalUrl = [string]$publicApiJson.meta.canonicalUrl
$publicDocumentationUrl = [string]$publicApiJson.data.documentationUrl
foreach ($candidateUrl in @($publicCanonicalUrl, $publicDocumentationUrl)) {
  $candidateUri = $null
  if (-not [Uri]::TryCreate($candidateUrl, [UriKind]::Absolute, [ref]$candidateUri)) {
    throw "Public API returned a non-absolute canonical URL: $candidateUrl"
  }
  if ($candidateUri.Host -in @('localhost', '127.0.0.1', '0.0.0.0', '::1')) {
    throw "Public API returned a local canonical URL: $candidateUrl"
  }
}

$originUri = [Uri]($Origin.TrimEnd('/'))
$isLoopbackOrigin = [System.Net.IPAddress]::Loopback.ToString() -eq $originUri.Host -or
  $originUri.Host -eq 'localhost' -or
  $originUri.Host -eq '::1'
if (-not $isLoopbackOrigin -and $publicCanonicalUrl -notlike "$($Origin.TrimEnd('/'))$normalizedBasePath/api/v1/public*") {
  throw "Public API canonical URL does not match the checked public origin and base path: $publicCanonicalUrl"
}

$publicCorsHeader = [string]$publicApiResponse.Headers['Access-Control-Allow-Origin']
if ($publicCorsHeader -ne '*') {
  throw "Public API did not return Access-Control-Allow-Origin: * (actual: $publicCorsHeader)"
}
$publicCacheHeader = [string]$publicApiResponse.Headers['Cache-Control']
if ($publicCacheHeader -notmatch 'public') {
  throw "Public API did not return a public cache policy (actual: $publicCacheHeader)"
}
$publicRobotsHeader = [string]$publicApiResponse.Headers['X-Robots-Tag']
if ($publicRobotsHeader -notmatch 'noindex') {
  throw "Public API did not return X-Robots-Tag: noindex (actual: $publicRobotsHeader)"
}

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
  aiAccess = [ordered]@{
    robots = [ordered]@{
      url = $robotsUrl
      statusCode = [int]$robotsResponse.StatusCode
    }
    sitemap = [ordered]@{
      url = $sitemapUrl
      statusCode = [int]$sitemapResponse.StatusCode
    }
    llms = [ordered]@{
      url = $llmsUrl
      statusCode = [int]$llmsResponse.StatusCode
      hasOpenApiLink = $llmsResponse.Content -match '/api/v1/public/openapi'
    }
    publicApi = [ordered]@{
      url = $publicApiUrl
      statusCode = [int]$publicApiResponse.StatusCode
      apiVersion = [string]$publicApiJson.meta.apiVersion
      canonicalUrl = $publicCanonicalUrl
      cors = $publicCorsHeader
      cacheControl = $publicCacheHeader
      robots = $publicRobotsHeader
    }
    openApi = [ordered]@{
      url = $publicOpenApiUrl
      statusCode = [int]$publicOpenApiResponse.StatusCode
      version = [string]$publicOpenApiJson.openapi
    }
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
Write-Output (
  "AI access: robots={0} sitemap={1} llms={2} publicApi={3} openApi={4} canonical={5}" -f
  [string]$result.aiAccess.robots.statusCode,
  [string]$result.aiAccess.sitemap.statusCode,
  [string]$result.aiAccess.llms.statusCode,
  [string]$result.aiAccess.publicApi.statusCode,
  [string]$result.aiAccess.openApi.statusCode,
  [string]$result.aiAccess.publicApi.canonicalUrl
)
Write-Output ("SW: {0}" -f [string]$result.serviceWorker.firstLine)

if (-not $SkipLdpass) {
  Write-Output ("Ldpass redirect: {0}" -f [string]$result.ldpass.location)
  Write-Output ("Ldpass has return-origin cookie: {0}" -f [string]$result.ldpass.hasReturnOriginCookie)
}
