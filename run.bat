@echo off
REM Lançador do chat -- corre a partir de qualquer pasta ou atalho, sem
REM precisar de ativar o .venv primeiro. %~dp0 é a pasta onde este .bat
REM está guardado (raiz do projeto), calculada pelo próprio Windows --
REM o mesmo princípio do __file__ usado no cli_chat.py e no orchestrator.py.
"%~dp0.venv\Scripts\python.exe" "%~dp0interfaces\cli_chat.py"
pause