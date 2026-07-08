[CmdletBinding(PositionalBinding = $false)]
param(
  [string]$BasePath = "",
  [string]$Origin = "",
  [switch]$Json,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$RemainingArgs = @()
)

$ErrorActionPreference = "Stop"

$envFiles = @(".env", ".env.production", ".env.local", ".env.production.local")
$requiredKeys = @("LDPASS_BASE_URL", "LDPASS_CLIENT_ID", "YCT_PUBLIC_SITE_URL")
$optionalKeys = @("YCT_BASE_PATH", "NEXT_PUBLIC_YCT_BASE_PATH")

if ([string]::IsNullOrWhiteSpace($BasePath) -and $RemainingArgs.Length -gt 0) {
  $normalizedRemainingArgs = $RemainingArgs | Where-Object { $_ -ne "--" }
  for ($index = 0; $index -lt $normalizedRemainingArgs.Length; $index += 1) {
    if ($normalizedRemainingArgs[$index] -eq "-BasePath" -and $index + 1 -lt $normalizedRemainingArgs.Length) {
      $BasePath = $normalizedRemainingArgs[$index + 1]
      break
    }
  }
}

if ([string]::IsNullOrWhiteSpace($Origin) -and $RemainingArgs.Length -gt 0) {
  $normalizedRemainingArgs = $RemainingArgs | Where-Object { $_ -ne "--" }
  for ($index = 0; $index -lt $normalizedRemainingArgs.Length; $index += 1) {
    if ($normalizedRemainingArgs[$index] -eq "-Origin" -and $index + 1 -lt $normalizedRemainingArgs.Length) {
      $Origin = $normalizedRemainingArgs[$index + 1]
      break
    }
  }
}

function Read-YctEnvFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $map
  }

  foreach ($rawLine in Get-Content -LiteralPath $Path -Encoding UTF8) {
    if ($null -eq $rawLine) {
      continue
    }

    $trimmedLine = $rawLine.Trim()
    if (-not $trimmedLine -or $trimmedLine.StartsWith("#")) {
      continue
    }

    $match = [regex]::Match($rawLine, '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$')
    if (-not $match.Success) {
      continue
    }

    $key = $match.Groups[1].Value
    $value = $match.Groups[2].Value.Trim()
    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $map[$key] = $value
  }

  return $map
}

function Resolve-YctEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Key,
    [Parameter(Mandatory = $true)][hashtable[]]$FileMaps
  )

  $processValue = [Environment]::GetEnvironmentVariable($Key, "Process")
  if (-not [string]::IsNullOrWhiteSpace($processValue)) {
    return [pscustomobject]@{
      Key = $Key
      Source = "process.env"
      Value = $processValue.Trim()
    }
  }

  for ($index = $FileMaps.Length - 1; $index -ge 0; $index -= 1) {
    $value = $FileMaps[$index][$Key]
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return [pscustomobject]@{
        Key = $Key
        Source = $envFiles[$index]
        Value = $value.Trim()
      }
    }
  }

  return $null
}

function Find-YctLastFileEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Key,
    [Parameter(Mandatory = $true)][hashtable[]]$FileMaps
  )

  for ($index = $FileMaps.Length - 1; $index -ge 0; $index -= 1) {
    $value = $FileMaps[$index][$Key]
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return [pscustomobject]@{
        Key = $Key
        Source = $envFiles[$index]
        Value = $value.Trim()
      }
    }
  }

  return $null
}

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

function Normalize-YctSiteUrl {
  param([Parameter(Mandatory = $true)][string]$Value)

  if ($Value.EndsWith("/")) {
    return $Value
  }
  return "$Value/"
}

function Join-YctBasePath {
  param(
    [Parameter(Mandatory = $true)][string]$NormalizedBasePath,
    [Parameter(Mandatory = $true)][string]$Path
  )

  if (-not $NormalizedBasePath) {
    return $Path
  }
  return "$NormalizedBasePath$Path"
}

$root = (Get-Location).Path
$fileMaps = @()
foreach ($file in $envFiles) {
  $fileMaps += @(Read-YctEnvFile -Path (Join-Path $root $file))
}

$resolvedValues = @{}
foreach ($key in ($requiredKeys + $optionalKeys)) {
  $value = Resolve-YctEnvValue -Key $key -FileMaps $fileMaps
  if ($null -ne $value) {
    $resolvedValues[$key] = $value
  }
}

if (-not [string]::IsNullOrWhiteSpace($BasePath)) {
  $basePathValue = $BasePath
} elseif ($resolvedValues.ContainsKey("NEXT_PUBLIC_YCT_BASE_PATH")) {
  $basePathValue = $resolvedValues["NEXT_PUBLIC_YCT_BASE_PATH"].Value
} elseif ($resolvedValues.ContainsKey("YCT_BASE_PATH")) {
  $basePathValue = $resolvedValues["YCT_BASE_PATH"].Value
} else {
  $basePathValue = ""
}

$normalizedBasePath = Normalize-YctBasePath -Value $basePathValue
$siteUrl = if (-not [string]::IsNullOrWhiteSpace($Origin)) {
  $Origin
} elseif ($resolvedValues.ContainsKey("YCT_PUBLIC_SITE_URL")) {
  $resolvedValues["YCT_PUBLIC_SITE_URL"].Value
} else {
  $null
}
$ldpassBaseUrl = if ($resolvedValues.ContainsKey("LDPASS_BASE_URL")) {
  $resolvedValues["LDPASS_BASE_URL"].Value
} else {
  $null
}
$ldpassClientId = if ($resolvedValues.ContainsKey("LDPASS_CLIENT_ID")) {
  $resolvedValues["LDPASS_CLIENT_ID"].Value
} else {
  $null
}

$warnings = New-Object System.Collections.Generic.List[string]
if (-not $ldpassBaseUrl) {
  $warnings.Add("LDPASS_BASE_URL is missing. YCT will treat ldpass as not configured.")
}
if (-not $ldpassClientId) {
  $warnings.Add("LDPASS_CLIENT_ID is missing. YCT will treat ldpass as not configured.")
}
if (-not $siteUrl) {
  $warnings.Add("YCT_PUBLIC_SITE_URL is missing. Callback URL inference will be unreliable.")
}

foreach ($key in ($requiredKeys + $optionalKeys)) {
  $processValue = [Environment]::GetEnvironmentVariable($key, "Process")
  $fileValue = Find-YctLastFileEnvValue -Key $key -FileMaps $fileMaps
  if (
    -not [string]::IsNullOrWhiteSpace($processValue) -and
    $null -ne $fileValue -and
    $processValue.Trim() -ne $fileValue.Value
  ) {
    $warnings.Add("$key is currently overridden by process.env and differs from $($fileValue.Source). If this value looks stale, restart the process manager or clear inherited env vars before launching start-yct-web.ps1.")
  }
}

$allowedOrigin = $null
$callbackUrl = $null
if ($siteUrl) {
  try {
    $siteUri = [Uri](Normalize-YctSiteUrl -Value $siteUrl)
    $allowedOrigin = $siteUri.GetLeftPart([System.UriPartial]::Authority)
    $callbackUrl = [Uri]::new(
      $siteUri,
      (Join-YctBasePath -NormalizedBasePath $normalizedBasePath -Path "/auth/ldpass/callback")
    ).AbsoluteUri
    if ($siteUri.AbsolutePath -and $siteUri.AbsolutePath -ne "/") {
      $warnings.Add("YCT_PUBLIC_SITE_URL currently includes path '$($siteUri.AbsolutePath)'. Prefer site root plus BasePath.")
    }
    if (
      $siteUri.Host -eq "localhost" -or
      $siteUri.Host -eq "127.0.0.1" -or
      $siteUri.Host -eq "0.0.0.0"
    ) {
      $warnings.Add("YCT_PUBLIC_SITE_URL currently points to a local host '$($siteUri.Host)'. Production callback URLs will fall back to localhost unless the reverse proxy headers override it.")
    }
  } catch {
    $warnings.Add("YCT_PUBLIC_SITE_URL is not a valid URL.")
  }
}

if ($ldpassBaseUrl) {
  try {
    $ldpassUri = [Uri](Normalize-YctSiteUrl -Value $ldpassBaseUrl)
    if ($ldpassUri.Query) {
      $warnings.Add("LDPASS_BASE_URL should not include query parameters.")
    }
    if ($ldpassUri.AbsolutePath -and $ldpassUri.AbsolutePath -ne "/") {
      $warnings.Add("LDPASS_BASE_URL currently includes path '$($ldpassUri.AbsolutePath)'. Prefer the site root only.")
    }
  } catch {
    $warnings.Add("LDPASS_BASE_URL is not a valid URL.")
  }
}

if ($callbackUrl) {
  try {
    $callbackUri = [Uri]$callbackUrl
    if (
      $callbackUri.Host -eq "localhost" -or
      $callbackUri.Host -eq "127.0.0.1" -or
      $callbackUri.Host -eq "0.0.0.0"
    ) {
      $warnings.Add("Derived callback URL currently resolves to $callbackUrl. This usually means proxy headers are missing or YCT_PUBLIC_SITE_URL still points to a local address.")
    }
  } catch {
  }
}

$loginUrl = $null
$sessionUrl = $null
if ($ldpassBaseUrl -and $ldpassClientId -and $callbackUrl) {
  try {
    $ldpassSite = [Uri](Normalize-YctSiteUrl -Value $ldpassBaseUrl)
    $loginUrl = [Uri]::new(
      $ldpassSite,
      "/login?client_id=$([Uri]::EscapeDataString($ldpassClientId))&redirect_uri=$([Uri]::EscapeDataString($callbackUrl))&state=example-state"
    ).AbsoluteUri
    $sessionUrl = [Uri]::new(
      $ldpassSite,
      "/api/auth/client-session?client_id=$([Uri]::EscapeDataString($ldpassClientId))"
    ).AbsoluteUri
  } catch {
    $warnings.Add("Could not derive ldpass login or client-session URL from current config.")
  }
}

$resolvedKeySummary = @{}
foreach ($key in ($requiredKeys + $optionalKeys)) {
  if ($resolvedValues.ContainsKey($key)) {
    $resolvedKeySummary[$key] = [pscustomobject]@{
      present = $true
      source = $resolvedValues[$key].Source
      value = $resolvedValues[$key].Value
    }
  } else {
    $resolvedKeySummary[$key] = [pscustomobject]@{
      present = $false
      source = $null
      value = $null
    }
  }
}

$envFileSummary = @{}
foreach ($file in $envFiles) {
  $envFileSummary[$file] = Test-Path -LiteralPath (Join-Path $root $file)
}

$result = [pscustomobject]@{
  workingDirectory = $root
  cli = [pscustomobject]@{
    basePath = $BasePath
    origin = $Origin
    json = [bool]$Json
  }
  resolvedKeys = $resolvedKeySummary
  envFiles = $envFileSummary
  derived = [pscustomobject]@{
    basePath = $normalizedBasePath
    siteUrl = $siteUrl
    allowedOrigin = $allowedOrigin
    callbackUrl = $callbackUrl
    ldpassBaseUrl = $ldpassBaseUrl
    ldpassClientId = $ldpassClientId
    loginUrl = $loginUrl
    clientSessionUrl = $sessionUrl
  }
  warnings = @($warnings)
}

if ($Json) {
  Write-Output ($result | ConvertTo-Json -Depth 6)
  return
}

Write-Host "YCT runtime config check"
Write-Host "Working directory: $root"
Write-Host ""
Write-Host "Resolved env keys:"
foreach ($key in $requiredKeys) {
  if ($resolvedValues.ContainsKey($key)) {
    Write-Host "- ${key}: set (source: $($resolvedValues[$key].Source))"
  } else {
    Write-Host "- ${key}: missing"
  }
}
foreach ($key in $optionalKeys) {
  if ($resolvedValues.ContainsKey($key)) {
    Write-Host "- ${key}: set (source: $($resolvedValues[$key].Source))"
  } else {
    Write-Host "- ${key}: missing (optional)"
  }
}

Write-Host ""
Write-Host "Env file presence:"
foreach ($file in $envFiles) {
  if (Test-Path -LiteralPath (Join-Path $root $file)) {
    $fileExistsText = "present"
  } else {
    $fileExistsText = "missing"
  }
  Write-Host "- ${file}: $fileExistsText"
}

Write-Host ""
Write-Host "Derived values:"
if (-not [string]::IsNullOrWhiteSpace($BasePath)) {
  $basePathSourceSuffix = " (from CLI)"
} else {
  $basePathSourceSuffix = ""
}
if (-not [string]::IsNullOrWhiteSpace($Origin)) {
  $originSourceSuffix = " (origin override active)"
} else {
  $originSourceSuffix = ""
}
if ($normalizedBasePath) {
  $displayBasePath = $normalizedBasePath
} else {
  $displayBasePath = "(empty)"
}
if ($allowedOrigin) {
  $displayAllowedOrigin = $allowedOrigin
} else {
  $displayAllowedOrigin = "(unavailable)"
}
if ($callbackUrl) {
  $displayCallbackUrl = $callbackUrl
} else {
  $displayCallbackUrl = "(unavailable)"
}
Write-Host "- BasePath: $displayBasePath$basePathSourceSuffix"
Write-Host "- Site URL used for derivation: $(if ($siteUrl) { $siteUrl } else { '(unavailable)' })$originSourceSuffix"
Write-Host "- Suggested allowed origin: $displayAllowedOrigin"
Write-Host "- Suggested callback URL: $displayCallbackUrl"
if ($loginUrl) {
  Write-Host "- Sample login URL: $loginUrl"
}
if ($sessionUrl) {
  Write-Host "- Sample client-session URL: $sessionUrl"
}

Write-Host ""
if ($warnings.Count -gt 0) {
  Write-Host "Warnings:"
  foreach ($warning in $warnings) {
    Write-Host "- $warning"
  }
} else {
  Write-Host "No obvious configuration gap detected."
}
