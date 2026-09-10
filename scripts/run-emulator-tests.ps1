$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$env:XDG_CONFIG_HOME = Join-Path $root ".firebase-config"
$env:FIREBASE_EMULATORS_PATH = Join-Path $root ".firebase-emulators"
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
$env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"
$env:GCLOUD_PROJECT = "olaf-emulator"

New-Item -ItemType Directory -Force -Path $env:XDG_CONFIG_HOME, $env:FIREBASE_EMULATORS_PATH | Out-Null
$emulator = Start-Process -FilePath "firebase.cmd" -ArgumentList "emulators:start --only auth,firestore --project olaf-emulator" -WorkingDirectory $root -WindowStyle Hidden -PassThru
try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    try {
      $ready = (Test-NetConnection -ComputerName 127.0.0.1 -Port 8080 -InformationLevel Quiet) -and
        (Test-NetConnection -ComputerName 127.0.0.1 -Port 9099 -InformationLevel Quiet)
    } catch {
      $ready = $false
    }
    if ($ready) { break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw "Firebase emulators did not become ready within 60 seconds." }
  Push-Location $root
  try {
    npm.cmd test -- --run tests/experiment-emulator.test.ts
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  } finally {
    Pop-Location
  }
} finally {
  if ($emulator -and -not $emulator.HasExited) { Stop-Process -Id $emulator.Id -Force -ErrorAction SilentlyContinue }
  $listenerIds = @(
    netstat -ano | ForEach-Object {
      if ($_ -match '^\s*TCP\s+\S+:(8080|9099|4000)\s+\S+\s+LISTENING\s+(\d+)\s*$') {
        [int]$Matches[2]
      }
    }
  ) | Sort-Object -Unique
  foreach ($listenerId in $listenerIds) {
    Stop-Process -Id $listenerId -Force -ErrorAction SilentlyContinue
  }
}
