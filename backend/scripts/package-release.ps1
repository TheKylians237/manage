$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backendRoot = Join-Path $repoRoot 'backend'
$version = (Get-Content (Join-Path $backendRoot 'package.json') -Raw | ConvertFrom-Json).version
$downloadDir = Join-Path $backendRoot 'public\downloads'
New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null
$zipPath = Join-Path $downloadDir 'Mat-Manage-latest.zip'
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$stagePath = Join-Path $tempRoot ("mat-manage-release-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stagePath | Out-Null
function Get-PackageFiles([string]$directory) {
  foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
    if ($entry.PSIsContainer) {
      if ($entry.Name -in @('node_modules', '.git', 'downloads', 'avatars')) { continue }
      Get-PackageFiles $entry.FullName
    } elseif ($entry.Name -ne '.env') {
      $entry
    }
  }
}
try {
  foreach ($name in @('README.md', 'backend\INSTALLATION.md', 'app.js', 'styles.css', 'index.html')) {
    $source = Join-Path $repoRoot $name
    if (-not (Test-Path -LiteralPath $source)) { continue }
    $destination = Join-Path $stagePath $name
    if (Test-Path -LiteralPath $source -PathType Container) {
      New-Item -ItemType Directory -Force -Path $destination | Out-Null
      Get-PackageFiles $source | ForEach-Object {
        $relative = $_.FullName.Substring($source.Length).TrimStart([char[]]@([char]92,[char]47))
        $target = Join-Path $destination $relative
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $target
      }
    } else {
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
      Copy-Item -LiteralPath $source -Destination $destination
    }
  }
  $backendStage = Join-Path $stagePath 'backend'
  New-Item -ItemType Directory -Force -Path $backendStage | Out-Null
  Get-PackageFiles $backendRoot | ForEach-Object {
    $relative = $_.FullName.Substring($backendRoot.Length).TrimStart([char[]]@([char]92,[char]47))
    if ($relative -notmatch '^database[\\/]mat_manage\.sql$') {
      $target = Join-Path $backendStage $relative
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
      Copy-Item -LiteralPath $_.FullName -Destination $target
    }
  }
  $databaseStage = Join-Path $backendStage 'database'
  New-Item -ItemType Directory -Force -Path $databaseStage | Out-Null
  $sourceSchema = Join-Path $backendRoot 'database\mat_manage.sql'
  $cleanSchema = Join-Path $databaseStage 'mat_manage.sql'
  $privateTables = @('audit_logs', 'http_sessions', 'mfa_recovery_codes', 'stock_balances', 'users', 'locations', 'services')
  $schemaLines = Get-Content -LiteralPath $sourceSchema
  $safeLines = [Collections.Generic.List[string]]::new()
  $skipInsert = $false
  foreach ($line in $schemaLines) {
    if ($skipInsert) {
      if ($line.TrimEnd().EndsWith(';')) { $skipInsert = $false }
      continue
    }
    $match = [regex]::Match($line, '^\s*INSERT\s+INTO\s+[`"]?([a-z0-9_]+)', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($match.Success -and $privateTables -contains $match.Groups[1].Value.ToLowerInvariant()) {
      if (-not $line.TrimEnd().EndsWith(';')) { $skipInsert = $true }
      continue
    }
    $safeLines.Add($line)
  }
  Set-Content -LiteralPath $cleanSchema -Value $safeLines -Encoding utf8
  if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
  Compress-Archive -Path (Join-Path $stagePath '*') -DestinationPath $zipPath -CompressionLevel Optimal
  Write-Output "Mat-Manage release v$version created: $zipPath"
} finally {
  $resolvedStage = [IO.Path]::GetFullPath($stagePath).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  $resolvedTemp = $tempRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if ($resolvedStage.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $stagePath)) {
    Remove-Item -LiteralPath $stagePath -Recurse -Force
  }
}

