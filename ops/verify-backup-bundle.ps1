[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BundleDirectory,

  [string]$DestinationRoot = 'F:\Pulso-backups',

  [switch]$CopyToVerified
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$source = (Resolve-Path -LiteralPath $BundleDirectory).Path
$checksumFiles = @(Get-ChildItem -LiteralPath $source -File -Filter 'pulso-*.sha256')
if ($checksumFiles.Count -ne 1) {
  throw "Se esperaba exactamente un checksum pulso-*.sha256 en $source."
}

$checksumFile = $checksumFiles[0]
$baseName = [System.IO.Path]::GetFileNameWithoutExtension($checksumFile.Name)
$requiredNames = @("$baseName.dump.age", "$baseName.manifest.age")
$expected = @{}

foreach ($line in Get-Content -LiteralPath $checksumFile.FullName) {
  if ($line -notmatch '^([0-9a-fA-F]{64})\s+\*?(.+)$') {
    throw "Línea SHA-256 inválida en $($checksumFile.Name)."
  }
  $fileName = $Matches[2].Trim()
  if ([System.IO.Path]::GetFileName($fileName) -ne $fileName) {
    throw 'El checksum contiene una ruta; sólo se permiten nombres de archivo.'
  }
  $expected[$fileName] = $Matches[1].ToLowerInvariant()
}

if ($expected.Count -ne 2 -or @($requiredNames | Where-Object { -not $expected.ContainsKey($_) }).Count -ne 0) {
  throw 'El checksum debe cubrir exactamente el dump y el manifiesto cifrados del mismo bundle.'
}

foreach ($fileName in $requiredNames) {
  $path = Join-Path $source $fileName
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Falta artefacto cifrado: $fileName"
  }
  $header = Get-Content -LiteralPath $path -TotalCount 1
  if ($header -notmatch '^age-encryption\.org/v1') {
    throw "$fileName no tiene cabecera age v1; se rechaza para evitar almacenar un dump plano."
  }
  $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected[$fileName]) {
    throw "SHA-256 inválido para $fileName."
  }
}

Write-Host "Bundle verificado: $baseName"

if ($CopyToVerified) {
  $verifiedRoot = Join-Path $DestinationRoot 'verified'
  $target = Join-Path $verifiedRoot $baseName
  if (Test-Path -LiteralPath $target) {
    throw "El destino ya existe: $target"
  }
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  Copy-Item -LiteralPath $checksumFile.FullName -Destination $target
  foreach ($fileName in $requiredNames) {
    Copy-Item -LiteralPath (Join-Path $source $fileName) -Destination $target
  }

  foreach ($fileName in $requiredNames) {
    $copied = Join-Path $target $fileName
    $actual = (Get-FileHash -LiteralPath $copied -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected[$fileName]) {
      throw "La copia local falló la reverificación: $fileName"
    }
  }
  Write-Host "Copia verificada guardada en: $target"
}
