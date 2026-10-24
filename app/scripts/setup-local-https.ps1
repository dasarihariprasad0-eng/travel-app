param(
    [string]$ComputerIp
)

$ErrorActionPreference = "Stop"

function Find-Mkcert {
    $command = Get-Command mkcert -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $wingetMkcert = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\FiloSottile.mkcert_Microsoft.Winget.Source_8wekyb3d8bbwe\mkcert.exe"
    if (Test-Path $wingetMkcert) {
        return $wingetMkcert
    }

    throw "mkcert was not found. Install it from https://github.com/FiloSottile/mkcert and run this script again."
}

if (-not $ComputerIp) {
    $ComputerIp = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object {
            $_.IPAddress -notlike "127.*" -and
            $_.IPAddress -notlike "169.254.*" -and
            $_.ValidLifetime -gt 0
        } |
        Select-Object -First 1 -ExpandProperty IPAddress
}

if (-not $ComputerIp) {
    throw "Could not detect this computer's LAN IPv4 address. Pass it with -ComputerIp."
}

$mkcert = Find-Mkcert
$appRoot = Split-Path -Parent $PSScriptRoot
$certDirectory = Join-Path $appRoot ".certs"
$keyFile = Join-Path $certDirectory "dev-key.pem"
$certFile = Join-Path $certDirectory "dev-cert.pem"
$phoneCaFile = Join-Path $certDirectory "phone-rootCA.pem"
$envLocalFile = Join-Path $appRoot ".env.local"

New-Item -ItemType Directory -Path $certDirectory -Force | Out-Null
& $mkcert -install
if ($LASTEXITCODE -ne 0) {
    throw "mkcert could not install its local certificate authority."
}

& $mkcert -key-file $keyFile -cert-file $certFile "localhost" "127.0.0.1" $ComputerIp
if ($LASTEXITCODE -ne 0) {
    throw "mkcert could not create the local HTTPS certificate."
}

$caRoot = (& $mkcert -CAROOT).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Could not locate mkcert's public root certificate."
}
Copy-Item -Path (Join-Path $caRoot "rootCA.pem") -Destination $phoneCaFile -Force

$keyPathForEnv = $keyFile.Replace("\", "/")
$certPathForEnv = $certFile.Replace("\", "/")
@"
VITE_API_URL=/api
DEV_HTTPS_KEY=$keyPathForEnv
DEV_HTTPS_CERT=$certPathForEnv
"@ | Set-Content -Path $envLocalFile -Encoding ASCII

Write-Host "Local HTTPS is configured for this computer."
Write-Host "Start the app, then open https://${ComputerIp}:8080 on your phone."
Write-Host "Install $phoneCaFile as a trusted CA on the phone."
Write-Host "Do not copy or install mkcert's rootCA-key.pem."
