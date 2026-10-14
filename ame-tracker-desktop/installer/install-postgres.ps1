# Installs PostgreSQL 16 on the Trimble Windows server and creates the
# ame_tracker database used by AME Tracker.
#
# Does not change Trimble SQL Server. Closing AME Tracker does not stop PostgreSQL.
#
# Run from an elevated PowerShell:
#   .\install-postgres.ps1 -SuperPassword '...' -AppPassword '...' -InstallerPath 'C:\Temp\postgresql-16-windows-x64.exe'
param(
  [Parameter(Mandatory = $true)]
  [string]$SuperPassword,

  [Parameter(Mandatory = $true)]
  [string]$AppPassword,

  [string]$InstallerPath,
  [int]$Port = 5432
)

$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Open PowerShell as Administrator, then run this script again.'
}

function Find-Psql {
  $candidates = @(
    'C:\Program Files\PostgreSQL\16\bin\psql.exe',
    'C:\Program Files\PostgreSQL\17\bin\psql.exe'
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $candidate }
  }
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

$psql = Find-Psql
if (-not $psql) {
  if (-not $InstallerPath -or -not (Test-Path $InstallerPath)) {
    throw "PostgreSQL is not installed. Download the Windows x64 installer from https://www.enterprisedb.com/downloads/postgres-postgresql-downloads and pass -InstallerPath."
  }
  Write-Host "Installing PostgreSQL from $InstallerPath"
  $arguments = @(
    '--mode', 'unattended',
    '--unattendedmodeui', 'none',
    '--superpassword', $SuperPassword,
    '--serverport', "$Port",
    '--servicename', 'postgresql-ame',
    '--disable-components', 'stackbuilder'
  )
  $proc = Start-Process -FilePath $InstallerPath -ArgumentList $arguments -Wait -PassThru
  if ($proc.ExitCode -ne 0) {
    throw "PostgreSQL installer exited with code $($proc.ExitCode)."
  }
  $psql = Find-Psql
}

if (-not $psql) {
  throw 'PostgreSQL installed, but psql.exe was not found.'
}

$env:PGPASSWORD = $SuperPassword
$exists = & $psql -h localhost -p $Port -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'ame_tracker'"
if ($exists.Trim() -ne '1') {
  $escaped = $AppPassword.Replace("'", "''")
  & $psql -h localhost -p $Port -U postgres -d postgres -c "CREATE ROLE ame_tracker LOGIN PASSWORD '$escaped'"
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the ame_tracker login.' }
}

$db = & $psql -h localhost -p $Port -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'ame_tracker'"
if ($db.Trim() -ne '1') {
  & $psql -h localhost -p $Port -U postgres -d postgres -c 'CREATE DATABASE ame_tracker OWNER ame_tracker'
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the ame_tracker database.' }
}

Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
Write-Host 'PostgreSQL is ready. In AME Tracker, set host localhost, port' $Port ', database ame_tracker, user ame_tracker.'
Write-Host 'Trimble stays on localhost:1433 with the ame_readonly login. Do not use sa.'
