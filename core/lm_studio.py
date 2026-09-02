"""
Verificação e arranque automático do servidor LM Studio.

Antes de a interface abrir o loop de chat, garante que o servidor local
do LM Studio (OpenAI-compatible, ex.: http://localhost:1234/v1) está
acessível. Se não estiver:

  1. Tenta arrancá-lo com o CLI oficial `lms server start`.
  2. Opcionalmente carrega o modelo configurado com `lms load <modelo> -y`.
  3. Faz polling ao endpoint /models até responder ou esgotar o timeout.

Usa apenas a biblioteca padrão (urllib/subprocess/shutil) para não
adicionar dependências ao requirements.txt.

O comportamento é controlado pela secção `lm_studio` do config.yaml:
    lm_studio:
      auto_start: true            # tentar arrancar o servidor se estiver desligado
      startup_timeout_seconds: 60 # tempo máximo de espera após o arranque
      load_model_on_start: true   # carregar o modelo automaticamente
"""

import json
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.request

import yaml

# Raiz do projeto = pasta pai deste ficheiro (core/), calculada a partir do
# caminho absoluto do próprio módulo — o mesmo princípio usado no
# orchestrator.py e no cli_chat.py para funcionar a partir de qualquer cwd.
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_CONFIG_PATH = os.path.join(_PROJECT_ROOT, "config", "config.yaml")

# Valores por omissão caso config.yaml não tenha a secção lm_studio.
DEFAULT_AUTO_START = True
DEFAULT_STARTUP_TIMEOUT = 60
DEFAULT_LOAD_MODEL = True


def _ler_config() -> dict:
    with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _servidor_responde(base_url: str, timeout: float = 2.0) -> bool:
    """Health check simples: GET {base_url}/models com timeout curto."""
    try:
        with urllib.request.urlopen(base_url.rstrip("/") + "/models", timeout=timeout):
            return True
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError):
        return False


def _correr_lms(args: list[str]) -> tuple[bool, str]:
    """Executa um subcomando do CLI `lms`. Devolve (sucesso, mensagem)."""
    lms_path = shutil.which("lms")
    if lms_path is None:
        return False, (
            "ERRO: o CLI 'lms' do LM Studio não foi encontrado no PATH.\n"
            "       Instale/atualize o LM Studio (versões recentes instalam o 'lms'\n"
            "       por defeito) ou inicie o servidor manualmente na aplicação."
        )
    try:
        # encoding="utf-8" + errors="replace": o CLI 'lms' emite UTF-8
        # (barras de progresso, setas, etc.) e, sem isto, o Windows tenta
        # descodificar com cp1252 e rebenta com UnicodeDecodeError.
        resultado = subprocess.run(
            [lms_path] + args,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        return False, f"ERRO: o comando 'lms {' '.join(args)}' excedeu o tempo limite."
    if resultado.returncode != 0:
        detalhe = (resultado.stderr or resultado.stdout or "").strip()
        return False, f"ERRO: 'lms {' '.join(args)}' falhou ({detalhe})."
    return True, ""


def garantir_servidor_ativo() -> str | None:
    """Garante que o LM Studio está acessível antes da interface arrancar.

    Devolve None se tudo estiver bem (ou já estava ativo), ou uma mensagem
    informativa/de erro para a interface apresentar ao utilizador.
    Nunca lança exceções — falhas são devolvidas como mensagem.
    """
    try:
        config = _ler_config()
    except Exception as e:
        return f"ERRO: não foi possível ler {_CONFIG_PATH}: {e}"

    base_url = config["api"]["base_url"]
    modelo = config["model"]["name"]
    cfg = config.get("lm_studio", {})
    auto_start = cfg.get("auto_start", DEFAULT_AUTO_START)
    timeout_s = int(cfg.get("startup_timeout_seconds", DEFAULT_STARTUP_TIMEOUT))
    load_model = cfg.get("load_model_on_start", DEFAULT_LOAD_MODEL)

    # Passo 1: garantir que o SERVIDOR responde.
    if not _servidor_responde(base_url):
        if not auto_start:
            return (
                "AVISO: o LM Studio não responde em "
                f"{base_url} e o arranque automático está desligado "
                "(lm_studio.auto_start: false). Inicie-o manualmente."
            )

        print("LM Studio não está ativo — a iniciar automaticamente...")

        ok, erro = _correr_lms(["server", "start"])
        if not ok:
            return erro

        # Polling até o endpoint /models responder ou esgotar o timeout.
        print(f"A aguardar o servidor responder (timeout: {timeout_s}s)...")
        inicio = time.monotonic()
        while time.monotonic() - inicio < timeout_s:
            if _servidor_responde(base_url):
                break
            time.sleep(1)
        else:
            return (
                f"ERRO: o LM Studio não respondeu em {base_url} após {timeout_s}s.\n"
                "       Verifique se o servidor está configurado na aplicação\n"
                "       LM Studio (Developer > Start Server) e se a porta coincide\n"
                "       com api.base_url."
            )

    # Passo 2: garantir que o MODELO configurado está carregado (o servidor
    # pode estar ativo com o modelo descarregado pelo utilizador na GUI).
    if load_model and modelo not in modelos_disponiveis(base_url):
        print(f"Modelo '{modelo}' não está carregado — a carregar...")
        ok, erro = _correr_lms(["load", modelo, "-y"])
        if not ok:
            print(erro)
        if modelo not in modelos_disponiveis(base_url):
            return (
                f"AVISO: o modelo '{modelo}' não consta nos modelos disponíveis.\n"
                "       Confirme o nome exato em model.name (config.yaml) contra a\n"
                "       lista do LM Studio."
            )

    return None


def modelos_disponiveis(base_url: str) -> list[str]:
    """Lista os IDs dos modelos atualmente servidos pelo LM Studio.

    Utilitário opcional de diagnóstico; devolve lista vazia em caso de falha.
    """
    try:
        with urllib.request.urlopen(base_url.rstrip("/") + "/models", timeout=5) as r:
            dados = json.loads(r.read().decode("utf-8"))
        return [m["id"] for m in dados.get("data", [])]
    except Exception:
        return []


def garantir_modelo_ativo(base_url: str, modelo: str, timeout_s: int = 45) -> tuple[bool, str]:
    """Garante que um modelo especifico está ativo no servidor LM Studio.

    Tenta carregar via `lms load <modelo> -y` e espera até surgir em /models.
    Devolve (ok, mensagem_erro_ou_info).
    """
    modelo = str(modelo or "").strip()
    if not modelo:
        return False, "modelo vazio"

    atuais = modelos_disponiveis(base_url)
    if modelo in atuais:
        return True, ""

    ok, erro = _correr_lms(["load", modelo, "-y"])
    if not ok:
        return False, erro

    inicio = time.monotonic()
    while time.monotonic() - inicio < timeout_s:
        if modelo in modelos_disponiveis(base_url):
            return True, ""
        time.sleep(1)

    return False, f"modelo '{modelo}' nao apareceu em /models apos {timeout_s}s"