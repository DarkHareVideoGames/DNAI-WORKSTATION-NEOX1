# DNAI WORKSTATION NEO X1 — lançador da interface web (Milestone 3)
# Uso: .\run_web.ps1   (a partir da raiz do projeto)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $raiz

# Ativa o ambiente virtual se existir
$venvActivate = Join-Path $raiz ".venv\Scripts\Activate.ps1"
if (Test-Path $venvActivate) { & $venvActivate }

Write-Host "=============================================" -ForegroundColor DarkGray
Write-Host " DNAI WORKSTATION NEO X1 - interface web" -ForegroundColor Yellow
Write-Host " A arrancar em http://127.0.0.1:8765 ..." -ForegroundColor Yellow
Write-Host " (feche esta janela para parar o servidor)" -ForegroundColor DarkGray
Write-Host "=============================================" -ForegroundColor DarkGray

python interfaces\webapp.py