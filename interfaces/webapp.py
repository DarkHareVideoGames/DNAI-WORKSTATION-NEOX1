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

Arranque:  python interfaces/webapp.py   (ou Start.ps1)
"""

import asyncio
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from collections import deque
from typing import Any
import ctypes

import uvicorn
import yaml
from starlette.applications import Starlette
from starlette.concurrency import run_in_threadpool
from starlette.responses import FileResponse, JSONResponse, StreamingResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from core import projects, storage, agentes  # noqa: E402
from core.lm_studio import (  # noqa: E402
    garantir_servidor_ativo,
    garantir_modelo_ativo,
    _servidor_responde,
    modelos_disponiveis,
)

_CONFIG_PATH = os.path.join(PROJECT_ROOT, "config", "config.yaml")
_AGENTS_CONFIG_PATH = os.path.join(PROJECT_ROOT, "config", "agents.yaml")
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


def _ler_agents_config() -> dict:
    with open(_AGENTS_CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _guardar_agents_config(cfg: dict[str, Any]) -> None:
    with open(_AGENTS_CONFIG_PATH, "w", encoding="utf-8") as f:
        yaml.safe_dump(cfg, f, allow_unicode=True, sort_keys=False)


def _regras_do_projeto(nome_projeto: str) -> str | None:
    """Devolve as regras específicas do projeto, se existirem."""
    if not nome_projeto or nome_projeto == "geral":
        return None
    projeto = projects.carregar_projeto(nome_projeto)
    if not projeto:
        return None
    regras = str(projeto.get("regras_especificas") or "").strip()
    return regras or None


def _normalizar_modelo_lmstudio(modelo: str, base_url: str) -> str:
    """Resolve pequenas diferenças de ID (ex.: prefixo provider/) contra /models."""
    modelo = str(modelo or "").strip()
    if not modelo:
        return modelo

    disponiveis = modelos_disponiveis(base_url)
    if not disponiveis:
        return modelo

    if modelo in disponiveis:
        return modelo

    if "/" in modelo:
        sem_prefixo = modelo.split("/", 1)[1]
        if sem_prefixo in disponiveis:
            return sem_prefixo

    for item in disponiveis:
        if item.lower() == modelo.lower():
            return item

    return modelo


def _ram_status() -> dict[str, Any]:
    class MEMORYSTATUSEX(ctypes.Structure):
        _fields_ = [
            ("dwLength", ctypes.c_ulong),
            ("dwMemoryLoad", ctypes.c_ulong),
            ("ullTotalPhys", ctypes.c_ulonglong),
            ("ullAvailPhys", ctypes.c_ulonglong),
            ("ullTotalPageFile", ctypes.c_ulonglong),
            ("ullAvailPageFile", ctypes.c_ulonglong),
            ("ullTotalVirtual", ctypes.c_ulonglong),
            ("ullAvailVirtual", ctypes.c_ulonglong),
            ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
        ]

    mem = MEMORYSTATUSEX()
    mem.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(mem))
    total = int(mem.ullTotalPhys)
    avail = int(mem.ullAvailPhys)
    used = max(total - avail, 0)
    return {
        "total_bytes": total,
        "used_bytes": used,
        "percent": round((used / total) * 100, 1) if total else 0.0,
    }


def _cpu_info() -> dict[str, Any]:
    nome = "CPU"
    uso = None
    try:
        r = subprocess.run(
            ["wmic", "cpu", "get", "name,loadpercentage", "/value"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=4,
        )
        out = (r.stdout or "")
        m_nome = re.search(r"Name=(.+)", out)
        m_uso = re.search(r"LoadPercentage=(\d+)", out)
        if m_nome:
            nome = m_nome.group(1).strip()
        if m_uso:
            uso = int(m_uso.group(1))
    except Exception:
        pass
    return {
        "name": nome,
        "usage_percent": uso,
        "logical_cores": os.cpu_count() or 0,
    }


def _gpu_info() -> dict[str, Any] | None:
    try:
        r = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total,memory.used",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=4,
        )
        if r.returncode != 0:
            return None
        linha = (r.stdout or "").strip().splitlines()[0]
        partes = [p.strip() for p in linha.split(",")]
        if len(partes) < 3:
            return None
        nome, total_mb, used_mb = partes[0], int(partes[1]), int(partes[2])
        return {
            "name": nome,
            "total_mb": total_mb,
            "used_mb": used_mb,
            "percent": round((used_mb / total_mb) * 100, 1) if total_mb else 0.0,
        }
    except Exception:
        return None


# ------------------------------------------------------------------- API

async def api_agentes(request):
    """Lista agentes disponíveis com suas configurações."""
    return JSONResponse(agentes.listar_agentes())


async def api_settings(request):
    if request.method == "GET":
        cfg = _ler_agents_config()
        modelos = cfg.get("modelos", {})
        perfil = str(modelos.get("perfil_modelo_ativo", "equilibrado"))
        perfis = list((modelos.get("perfis") or {}).keys())
        if not perfis:
            perfis = ["qualidade", "equilibrado", "leve"]
        return JSONResponse(
            {
                "perfil_modelo_ativo": perfil,
                "perfis_disponiveis": perfis,
            }
        )

    dados = await request.json()
    novo_perfil = str(dados.get("perfil_modelo_ativo", "")).strip().lower()
    if not novo_perfil:
        return JSONResponse({"erro": "perfil_modelo_ativo é obrigatório"}, status_code=400)

    cfg = _ler_agents_config()
    modelos = cfg.setdefault("modelos", {})
    perfis = (modelos.get("perfis") or {})
    if perfis and novo_perfil not in perfis:
        return JSONResponse({"erro": f"perfil inválido: {novo_perfil}"}, status_code=400)
    modelos["perfil_modelo_ativo"] = novo_perfil
    _guardar_agents_config(cfg)
    log(f"[SETTINGS] perfil_modelo_ativo -> {novo_perfil}")
    return JSONResponse({"ok": True, "perfil_modelo_ativo": novo_perfil})


async def api_stats_sistema(request):
    ram = await run_in_threadpool(_ram_status)
    cpu = await run_in_threadpool(_cpu_info)
    gpu = await run_in_threadpool(_gpu_info)
    return JSONResponse(
        {
            "timestamp": datetime.now().isoformat(timespec="seconds"),
            "cpu": cpu,
            "ram": ram,
            "gpu": gpu,
        }
    )


async def api_estado(request):
    config = _ler_config()
    base_url = config["api"]["base_url"]
    agente_id = request.query_params.get("agente", "neo-x1")
    agente_info = agentes.obter_agente(agente_id) or agentes.obter_agente("neo-x1")

    def _verificar() -> bool:
        return _servidor_responde(base_url)

    ativo = await run_in_threadpool(_verificar)
    return JSONResponse(
        {
            "lm_studio_ativo": ativo,
            "agente_nome": agente_info.get("nome", "NEO X1"),
            "agente_id": agente_info.get("id", "neo-x1"),
            "modelo": agente_info.get("modelo", config["model"]["name"]),
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
        agente_id = str(dados.get("agente", "neo-x1"))
        cid = await run_in_threadpool(storage.criar_conversa, projeto, titulo, agente_id)
        log(f"[CONVERSA] criada #{cid} (projeto: {projeto}, agente: {agente_id})")
        return JSONResponse(storage.obter_conversa(cid))
    projeto = request.query_params.get("projeto")
    agente_id = request.query_params.get("agente")
    return JSONResponse(
        await run_in_threadpool(storage.listar_conversas, projeto, agente_id)
    )


async def api_conversa_detalhe(request):
    cid = int(request.path_params["conversa_id"])
    if request.method == "DELETE":
        apagada = await run_in_threadpool(storage.apagar_conversa, cid)
        if apagada:
            log(f"[CONVERSA] apagada #{cid}")
        return JSONResponse({"apagada": apagada})
    if request.method == "PATCH":
        dados = await request.json()
        titulo = str(dados.get("titulo", "")).strip()
        if not titulo:
            return JSONResponse({"erro": "titulo é obrigatório"}, status_code=400)
        ok = await run_in_threadpool(storage.renomear_conversa, cid, titulo)
        if not ok:
            return JSONResponse({"erro": "conversa não encontrada"}, status_code=404)
        log(f"[CONVERSA] renomeada #{cid} -> {titulo[:40]}")
        return JSONResponse(await run_in_threadpool(storage.obter_conversa, cid))
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
    agente_id = str(dados.get("agente", "neo-x1")).strip()
    config = _ler_config()
    base_url = config["api"]["base_url"]
    
    if not mensagem or conversa_id is None:
        return JSONResponse({"erro": "mensagem e conversa_id são obrigatórios"}, status_code=400)

    conversa = await run_in_threadpool(storage.obter_conversa, int(conversa_id))
    if conversa is None:
        return JSONResponse({"erro": "conversa não encontrada"}, status_code=404)

    conversa_agente = str(conversa.get("agente_id") or "neo-x1")
    if conversa_agente != agente_id:
        return JSONResponse(
            {
                "erro": (
                    "conversa pertence a outro agente "
                    f"({conversa_agente}). selecione/crie conversa desse agente"
                )
            },
            status_code=400,
        )

    historico = await run_in_threadpool(storage.carregar_historico, conversa["id"])
    
    # Obter regras do agente especializado (se não for NEO X1 genérico)
    regras = None
    if agente_id != "neo-x1":
        regras = await run_in_threadpool(agentes.obter_regras_agente, agente_id)
    
    # Fallback para regras do projeto se agente não tiver regras
    if not regras:
        regras = await run_in_threadpool(_regras_do_projeto, conversa["projeto"])
    
    # Obter modelo e info do agente
    modelo_raw = await run_in_threadpool(agentes.obter_modelo, agente_id)
    modelo = await run_in_threadpool(_normalizar_modelo_lmstudio, modelo_raw, base_url)
    agente_info = await run_in_threadpool(agentes.obter_agente, agente_id)
    agente_nome = agente_info.get("nome", "NEO X1") if agente_info else "NEO X1"

    if modelo_raw and modelo_raw != modelo:
        log(f"[MODELO] normalizado: '{modelo_raw}' -> '{modelo}'")

    if modelo:
        ok_modelo, msg_modelo = await run_in_threadpool(garantir_modelo_ativo, base_url, modelo)
        if not ok_modelo:
            log(f"[WARN] falha ao ativar modelo '{modelo}': {msg_modelo}")
    
    log(
        f"[CHAT] conversa #{conversa['id']} ({agente_nome} | modelo: {modelo}): "
        f"{mensagem[:60]}"
    )

    def _correr() -> tuple[str, list[dict[str, Any]]]:
        from core.orchestrator import run

        return run(mensagem, historico, regras, model_override=modelo or None)

    try:
        resposta, novo_historico = await run_in_threadpool(_correr)
    except Exception as e:
        log(f"[ERRO] chat: {type(e).__name__}: {e}")
        return JSONResponse({"erro": f"falha no orquestrador: {e}"}, status_code=500)

    guardado = await run_in_threadpool(storage.guardar_historico, conversa["id"], novo_historico)
    if not guardado:
        log(
            "[WARN] histórico não foi guardado: "
            f"conversa #{conversa['id']} já não existe"
        )
    log(f"[CHAT] ({agente_nome}) resposta: {resposta[:60]}")
    return JSONResponse(
        {
            "resposta": resposta,
            "agente": agente_nome,
            "modelo": modelo,
            "historico_guardado": guardado,
        }
    )


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
        Route("/api/agentes", api_agentes),
        Route("/api/settings", api_settings, methods=["GET", "PATCH"]),
        Route("/api/system-stats", api_stats_sistema),
        Route("/api/projetos", api_projetos, methods=["GET", "POST"]),
        Route("/api/conversas", api_conversas, methods=["GET", "POST"]),
        Route(
            "/api/conversas/{conversa_id:int}",
            api_conversa_detalhe,
            methods=["GET", "DELETE", "PATCH"],
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