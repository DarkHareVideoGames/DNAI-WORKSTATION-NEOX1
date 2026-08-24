import os
import sys

# Diretório raiz do projeto = pasta pai deste ficheiro, calculado a partir do
# caminho absoluto do próprio ficheiro (__file__). Ao contrário de um caminho
# relativo como '..', isto funciona sempre, seja qual for a pasta a partir de
# onde o script é invocado (cwd) — essencial para o objetivo de ser
# instalável/corrível a partir de qualquer sítio noutra máquina.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from core.lm_studio import garantir_servidor_ativo
from core.orchestrator import run

# Usa apenas caracteres ASCII puros (sem blocos Unicode) para não depender da
# code page do terminal — o mesmo cuidado de encoding já documentado no
# projeto para o PowerShell.


_TITLE = r"""
 ____  _   _    _    ___
|  _ \| \ | |  / \  |_ _|
| | | |  \| | / _ \  | |
| |_| | |\  |/ ___ \ | |
|____/|_| \_/_/   \_\___|

   WORKSTATION  NEO X1
"""


def _print_banner() -> None:
    print(_TITLE)
    print("=" * 46)
    print("  orquestrador local -- escreve 'sair' para sair")
    print("=" * 46)


def main():
    _print_banner()
    # Garante que o LM Studio está acessível antes de aceitar a primeira
    # mensagem: se o servidor não estiver ativo, tenta arrancá-lo e carregar
    # o modelo automaticamente (ver core/lm_studio.py e config.yaml).
    aviso = garantir_servidor_ativo()
    if aviso:
        print(aviso)
    # Histórico da conversa, mantido em memória durante esta sessão do chat.
    # run() devolve o histórico atualizado a cada turno; guardamo-lo aqui e
    # passamo-lo de volta na chamada seguinte para o modelo ter contexto das
    # perguntas anteriores.
    historico = []
    while True:
        try:
            mensagem = input("Tu: ")
            if mensagem.lower() in ["sair", "exit", "quit"]:
                break
            resposta, historico = run(mensagem, historico)
            print(f"DNAI: {resposta}")
        except KeyboardInterrupt:
            print("\nSaindo do chat.")
            break


if __name__ == "__main__":
    main()