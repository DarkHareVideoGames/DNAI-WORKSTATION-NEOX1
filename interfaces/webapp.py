"""
Servidor web local do NEO X1 — Milestone 3.

Interface de chat customizada, apenas acessível em localhost.
Usa Starlette/Uvicorn (já presentes no ambiente via dependência 'mcp').

Endpoints principais:
    GET  /                        → interface (interfaces/static/index.html)
    GET  /api/estado              → estado LM Studio + agente + modelo
    GET/POST /api/projetos        → listar/criar projetos
    GET/POST /api/conversas       → listar/criar conversas
    DELETE /api/conversas/{id}    → apagar conversa
    GET  /api/conversas/{id}/mensagens → histórico guardado
    POST /api/chat                → enviar mensagem ao agente
    POST /api/upload              → carregar ficheiro para o projeto
    GET  /api/ficheiros           → listar ficheiros do projeto
    POST /api/abrir-pasta         → abrir pasta do projeto no Explorador
    GET  /api/logs                → stream SSE de logs (painel TERMINAL)

Arranque:  python interfaces/webapp.py   (ou run_web.ps1)
"""

import asyncio
import json
import os
import sys
from collections import deque
from typing import Any

import uvicorn
import yaml
from starlette.applications import Starlette
from starlette.concurrency import run_in_threadpool
from starlette.responses import FileResponse, JSONResponse, StreamingResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from core import projects, storage  # noqa: E402
from core.lm_studio import garantir_servidor_ativo, _servidor_responde  # noqa: E402

_CONFIG_PATH = os.path.join(PROJECT_ROOT, "config", "config.yaml")
STATIC_DIR = os.path.join(PROJECT_ROOT, "interfaces", "static")
ASSETS_DIR = os.path.join(PROJECT_ROOT, "assets")

# Buffer de logs para o painel TERMINAL (SSE faz polling deste buffer).
LOGS: deque[str] = deque(maxlen=500)


def log(mensagem: str) -> None:
    """Regista uma linha no painel TERMINAL e na consola do processo."""
    LOGS.append(mensagem)
    print(mensagem, flush=True)


def _ler_config() -> dict:
    with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _regras_do_projeto(nome_projeto: str) -> str | None:
    """Devolve as regras específicas do projeto, se existirem."""
    if not nome_projeto or nome_projeto == "geral":
        return None
    projeto = projects.carregar_projeto(nome_projeto)
    if not projeto:
        return None
    regras = str(projeto.get("regras_especificas") or "").strip()
    return regras or None


# ------------------------------------------------------------------- API

async def api_estado(request):
    config = _ler_config()
    base_url = config["api"]["base_url"]

    def _verificar() -> bool:
        return _servidor_responde(base_url)

    ativo = await run_in_threadpool(_verificar)
    return JSONResponse(
        {
            "lm_studio_ativo": ativo,
            "agente_nome": (config.get("persona") or {}).get("name", "NEO X1"),
            "modelo": config["model"]["name"],
            "base_url": base_url,
            # Rótulos editáveis da interface (interface.rotulos no config.yaml)
            "rotulos": config.get("interface", {}).get("rotulos", {}),
        }
    )


async def api_projetos(request):
    if request.method == "POST":
        dados = await request.json()
        try:
            projeto = await run_in_threadpool(
                projects.criar_projeto,
                str(dados.get("nome", "")).strip(),
                str(dados.get("descricao", "")),
                dados.get("agente_nome"),
                str(dados.get("regras_especificas", "")),
            )
            log(f"[PROJETO] criado: {projeto['nome']}")
            return JSONResponse(projeto)
        except (ValueError, FileExistsError) as e:
            return JSONResponse({"erro": str(e)}, status_code=400)
    return JSONResponse(projects.listar_projetos())


async def api_conversas(request):
    if request.method == "POST":
        dados = await request.json()
        projeto = str(dados.get("projeto", "geral"))
        titulo = str(dados.get("titulo", "Nova conversa"))
        cid = await run_in_threadpool(storage.criar_conversa, projeto, titulo)
        log(f"[CONVERSA] criada #{cid} (projeto: {projeto})")
        return JSONResponse(storage.obter_conversa(cid))
    projeto = request.query_params.get("projeto")
    return JSONResponse(
        await run_in_threadpool(storage.listar_conversas, projeto)
    )


async def api_conversa_detalhe(request):
    cid = int(request.path_params["conversa_id"])
    if request.method == "DELETE":
        apagada = await run_in_threadpool(storage.apagar_conversa, cid)
        if apagada:
            log(f"[CONVERSA] apagada #{cid}")
        return JSONResponse({"apagada": apagada})
    conversa = await run_in_threadpool(storage.obter_conversa, cid)
    if conversa is None:
        return JSONResponse({"erro": "conversa não encontrada"}, status_code=404)
    return JSONResponse(conversa)


async def api_mensagens(request):
    cid = int(request.path_params["conversa_id"])
    historico = await run_in_threadpool(storage.carregar_historico, cid)
    return JSONResponse(historico)


async def api_chat(request):
    dados = await request.json()
    mensagem = str(dados.get("mensagem", "")).strip()
    conversa_id = dados.get("conversa_id")
    if not mensagem or conversa_id is None:
        return JSONResponse({"erro": "mensagem e conversa_id são obrigatórios"}, status_code=400)

    conversa = await run_in_threadpool(storage.obter_conversa, int(conversa_id))
    if conversa is None:
        return JSONResponse({"erro": "conversa não encontrada"}, status_code=404)

    historico = await run_in_threadpool(storage.carregar_historico, conversa["id"])
    regras = await run_in_threadpool(_regras_do_projeto, conversa["projeto"])
    log(f"[CHAT] conversa #{conversa['id']}: {mensagem[:60]}")

    def _correr() -> tuple[str, list[dict[str, Any]]]:
        from core.orchestrator import run

        return run(mensagem, historico, regras)

    try:
        resposta, novo_historico = await run_in_threadpool(_correr)
    except Exception as e:
        log(f"[ERRO] chat: {type(e).__name__}: {e}")
        return JSONResponse({"erro": f"falha no orquestrador: {e}"}, status_code=500)

    await run_in_threadpool(storage.guardar_historico, conversa["id"], novo_historico)
    log(f"[CHAT] resposta: {resposta[:60]}")
    return JSONResponse({"resposta": resposta})


async def api_upload(request):
    formulario = await request.form()
    upload = formulario.get("ficheiro")
    projeto = str(formulario.get("projeto", "geral"))
    if upload is None or not hasattr(upload, "filename"):
        return JSONResponse({"erro": "sem ficheiro"}, status_code=400)
    nome = os.path.basename(upload.filename)
    pasta = await run_in_threadpool(projects.pasta_ficheiros, projeto)
    destino = os.path.join(pasta, nome)
    with open(destino, "wb") as f:
        f.write(await upload.read())
    log(f"[UPLOAD] {nome} -> {projeto}")
    return JSONResponse({"nome": nome, "tamanho": os.path.getsize(destino)})


async def api_ficheiros(request):
    projeto = request.query_params.get("projeto", "geral")
    pasta = await run_in_threadpool(projects.pasta_ficheiros, projeto)

    def _listar() -> list[dict]:
        if not os.path.isdir(pasta):
            return []
        return [
            {"nome": f, "tamanho": os.path.getsize(os.path.join(pasta, f))}
            for f in sorted(os.listdir(pasta))
            if os.path.isfile(os.path.join(pasta, f))
        ]

    return JSONResponse(await run_in_threadpool(_listar))


async def api_abrir_pasta(request):
    dados = await request.json()
    projeto = str(dados.get("projeto", "geral"))
    pasta = await run_in_threadpool(projects.pasta_ficheiros, projeto)
    if os.name == "nt":
        os.startfile(pasta)  # noqa: S606 — Windows Explorer, intencional
        log(f"[PASTA] aberta: {pasta}")
        return JSONResponse({"aberta": pasta})
    return JSONResponse({"erro": "suportado apenas no Windows"}, status_code=400)


async def api_logs(request):
    """Stream SSE das linhas de log (painel TERMINAL)."""

    async def gerador():
        indice = 0
        # Envia o histórico existente e depois as linhas novas.
        while True:
            if indice < len(LOGS):
                for linha in list(LOGS)[indice:]:
                    yield f"data: {json.dumps(linha, ensure_ascii=False)}\n\n"
                indice = len(LOGS)
            await asyncio.sleep(0.5)

    return StreamingResponse(gerador(), media_type="text/event-stream")


async def pagina_principal(request):
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


# ------------------------------------------------------------------ app

def criar_app() -> Starlette:
    storage.inicializar()
    rotas = [
        Route("/", pagina_principal),
        Route("/api/estado", api_estado),
        Route("/api/projetos", api_projetos, methods=["GET", "POST"]),
        Route("/api/conversas", api_conversas, methods=["GET", "POST"]),
        Route(
            "/api/conversas/{conversa_id:int}",
            api_conversa_detalhe,
            methods=["GET", "DELETE"],
        ),
        Route("/api/conversas/{conversa_id:int}/mensagens", api_mensagens),
        Route("/api/chat", api_chat, methods=["POST"]),
        Route("/api/upload", api_upload, methods=["POST"]),
        Route("/api/ficheiros", api_ficheiros),
        Route("/api/abrir-pasta", api_abrir_pasta, methods=["POST"]),
        Route("/api/logs", api_logs),
        Mount("/static", StaticFiles(directory=STATIC_DIR), name="static"),
        Mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets"),
    ]
    return Starlette(routes=rotas)


if __name__ == "__main__":
    config = _ler_config()
    interface_cfg = config.get("interface", {})
    host = str(interface_cfg.get("host", "127.0.0.1"))
    porta = int(interface_cfg.get("porta", 8188))

    log("=" * 50)
    log(" DNAI WORKSTATION NEO X1 — servidor web local")
    log(f" A arrancar em http://{host}:{porta} ...")
    log("=" * 50)

    # Garante LM Studio ativo antes de servir (em background para não atrasar).
    app = criar_app()
    uvicorn.run(app, host=host, port=porta, log_level="warning")