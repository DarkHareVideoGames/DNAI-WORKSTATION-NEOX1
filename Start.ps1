param(
    [ValidateSet("web", "cli")]
    [string]$Mode = "web",
    [switch]$KeepRunning
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$python = Join-Path $root ".venv\Scripts\python.exe"
$webEntry = Join-Path $root "interfaces\webapp.py"
$cliEntry = Join-Path $root "interfaces\cli_chat.py"
$configPath = Join-Path $root "config\config.yaml"

if (-not (Test-Path $python)) {
    Write-Host "ERRO: ambiente virtual nao encontrado em '$root\.venv'." -ForegroundColor Red
    Write-Host "Crie-o com:  python -m venv .venv"
    Write-Host "Instale deps com:  .venv\Scripts\pip.exe install -r requirements.txt"
    exit 1
}

function Get-WebPortFromConfig {
    param([string]$Path)

    if (-not (Test-Path $Path)) { return 8765 }

    $porta = $null
    foreach ($line in Get-Content -Path $Path) {
        if ($line -match '^\s*porta\s*:\s*(\d+)\s*$') {
            $porta = [int]$Matches[1]
        }
    }
    if ($null -eq $porta) { return 8765 }
    return $porta
}

function Stop-ProcessOnPort {
    param([int]$Port)

    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($conn) {
            $owningPid = $conn.OwningProcess
            Write-Host "Porta $Port ocupada. A terminar processo PID $owningPid..." -ForegroundColor Yellow
            Stop-Process -Id $owningPid -Force
        }
    } catch {
        Write-Host "Aviso: nao foi possivel libertar a porta $Port automaticamente." -ForegroundColor Yellow
    }
}

if ($Mode -eq "web") {
    if (-not (Test-Path $webEntry)) {
        Write-Host "ERRO: interface web nao encontrada em '$webEntry'." -ForegroundColor Red
        exit 1
    }

    $port = Get-WebPortFromConfig -Path $configPath
    Stop-ProcessOnPort -Port $port

    Write-Host "=============================================" -ForegroundColor DarkGray
    Write-Host " DNAI WORKSTATION NEO X1 - interface web" -ForegroundColor Yellow
    Write-Host " A arrancar em http://127.0.0.1:$port ..." -ForegroundColor Yellow
    Write-Host " (feche esta janela para parar o servidor)" -ForegroundColor DarkGray
    Write-Host "=============================================" -ForegroundColor DarkGray

    & $python $webEntry
}
else {
    if (-not (Test-Path $cliEntry)) {
        Write-Host "ERRO: interface CLI nao encontrada em '$cliEntry'." -ForegroundColor Red
        exit 1
    }

    Write-Host "=============================================" -ForegroundColor DarkGray
    Write-Host " DNAI WORKSTATION NEO X1 - interface CLI" -ForegroundColor Yellow
    Write-Host "=============================================" -ForegroundColor DarkGray

    & $python $cliEntry
}

if (-not $KeepRunning) {
    Read-Host "Pressione Enter para sair"
}
