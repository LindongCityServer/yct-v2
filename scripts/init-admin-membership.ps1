[CmdletBinding(PositionalBinding = $false)]
param(
  [Parameter(Mandatory = $true)]
  [string]$LdpassUserId,
  [string]$StorePath = $env:YCT_ADMIN_STORE_PATH
)

$ErrorActionPreference = "Stop"

function Resolve-YctAdminStorePath {
  param([string]$Path)

  $candidate = ([string]$Path).Trim()
  if ([string]::IsNullOrWhiteSpace($candidate)) {
    $candidate = ".yct-data\admin-memberships.json"
  }

  if ([System.IO.Path]::IsPathRooted($candidate)) {
    return [System.IO.Path]::GetFullPath($candidate)
  }

  return [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $candidate))
}

function Get-YctStringValue {
  param(
    [object]$Object,
    [string]$Name,
    [string]$Fallback
  )

  if ($null -eq $Object) {
    return $Fallback
  }

  $property = $Object.PSObject.Properties[$Name]
  if ($property -and -not [string]::IsNullOrWhiteSpace([string]$property.Value)) {
    return [string]$property.Value
  }

  return $Fallback
}

$normalizedLdpassUserId = $LdpassUserId.Trim()
if ([string]::IsNullOrWhiteSpace($normalizedLdpassUserId)) {
  throw "LdpassUserId cannot be empty."
}

$adminStorePath = Resolve-YctAdminStorePath -Path $StorePath
$adminStoreDir = Split-Path -Parent $adminStorePath
New-Item -ItemType Directory -Force -Path $adminStoreDir | Out-Null

$memberships = @()
if (Test-Path -LiteralPath $adminStorePath) {
  $raw = [System.IO.File]::ReadAllText($adminStorePath, [System.Text.Encoding]::UTF8)
  if (-not [string]::IsNullOrWhiteSpace($raw)) {
    $snapshot = $raw | ConvertFrom-Json
    $memberships = @($snapshot.memberships)
  }
}

$now = (Get-Date).ToUniversalTime().ToString("o")
$nextMemberships = @()
$matched = $false
$adminMembershipId = $null

foreach ($membership in $memberships) {
  if ([string]$membership.ldpassUserId -eq $normalizedLdpassUserId) {
    $adminMembershipId = Get-YctStringValue -Object $membership -Name "id" -Fallback "admin_$([guid]::NewGuid())"
    $createdAt = Get-YctStringValue -Object $membership -Name "createdAt" -Fallback $now
    $nextMemberships += [pscustomobject]@{
      id = $adminMembershipId
      yctUserId = Get-YctStringValue -Object $membership -Name "yctUserId" -Fallback "yct_user_$normalizedLdpassUserId"
      ldpassUserId = $normalizedLdpassUserId
      role = "super_admin"
      status = "active"
      createdAt = $createdAt
      updatedAt = $now
    }
    $matched = $true
  } else {
    $nextMemberships += $membership
  }
}

if (-not $matched) {
  $adminMembershipId = "admin_$([guid]::NewGuid())"
  $nextMemberships += [pscustomobject]@{
    id = $adminMembershipId
    yctUserId = "yct_user_$normalizedLdpassUserId"
    ldpassUserId = $normalizedLdpassUserId
    role = "super_admin"
    status = "active"
    createdAt = $now
    updatedAt = $now
  }
}

$output = [pscustomobject]@{
  version = 1
  memberships = @($nextMemberships)
}
$json = $output | ConvertTo-Json -Depth 8
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($adminStorePath, "$json`n", $utf8NoBom)

[pscustomobject]@{
  ok = $true
  adminMembershipId = $adminMembershipId
  ldpassUserId = $normalizedLdpassUserId
  role = "super_admin"
  status = "active"
  storePath = $adminStorePath
} | ConvertTo-Json -Depth 4
