# Lançador do chat — substituto multiplataforma do antigo run.bat.
# Corre a partir de qualquer pasta ou atalho, sem precisar de ativar o
# .venv primeiro. $PSScriptRoot é a pasta onde este script está guardado
# (raiz do projeto), calculada pelo próprio PowerShell.
#
# Uso:  .\run.ps1   (ou clique direito > "Executar com PowerShell")

$ErrorActionPreference = "Stop"

$python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
$chat = Join-Path $PSScriptRoot "interfaces\cli_chat.py"

if (-not (Test-Path $python)) {
    Write-Host "ERRO: ambiente virtual nao encontrado em '$PSScriptRoot\.venv'." -ForegroundColor Red
    Write-Host "Crie-o primeiro com:  python -m venv .venv"
    Write-Host "Depois instale as dependencias:  .venv\Scripts\pip.exe install -r requirements.txt"
    Read-Host "Pressione Enter para sair"
    exit 1
}

if (-not (Test-Path $chat)) {
    Write-Host "ERRO: interface nao encontrada em '$chat'." -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

& $python $chat

# Pausa no fim, igual ao 'pause' do antigo run.bat (util quando lancado
# por duplo clique, para o erro nao desaparecer antes de ser lido).
Read-Host "Pressione Enter para sair"