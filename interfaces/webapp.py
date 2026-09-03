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
import random
import re
import shutil
import subprocess
import sys
import uuid
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
from core.comfyui_client import ComfyUIClient, validar_aderencia_contornos  # noqa: E402
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
COMFY_BATCH_JOBS: dict[str, dict[str, Any]] = {}

_REF_PREFERENCIAL = (
    "outline",
    "line",
    "lineart",
    "contour",
    "contours",
    "mask",
    "ambient_occlusion",
    "ao",
    "facade",
    "fachada",
    "building",
    "edificio",
)


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


def _agora_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _slug_pdf_nome(texto: str) -> str:
    base = re.sub(r"[^\w\s-]", "", str(texto or "")).strip().lower()
    base = re.sub(r"[\s]+", "-", base)
    return base or "historia"


def _gerar_pdf_texto(caminho_pdf: str, titulo: str, conteudo: str) -> None:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
        from xml.sax.saxutils import escape
    except ImportError as exc:
        raise RuntimeError(
            "Dependencia em falta: reportlab. Instale com: pip install reportlab"
        ) from exc

    styles = getSampleStyleSheet()
    st_titulo = styles["Title"]
    st_body = styles["BodyText"]
    st_body.leading = 14

    doc = SimpleDocTemplate(caminho_pdf, pagesize=A4)
    elementos = [Paragraph(escape(titulo), st_titulo), Spacer(1, 12)]

    blocos = [b.strip() for b in str(conteudo or "").split("\n\n") if b.strip()]
    for bloco in blocos:
        html = escape(bloco).replace("\n", "<br/>")
        elementos.append(Paragraph(html, st_body))
        elementos.append(Spacer(1, 8))

    doc.build(elementos)


def _gerar_pdf_storyboard_visual(
    caminho_pdf: str,
    titulo: str,
    projeto: str,
    itens: list[dict[str, Any]],
) -> None:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.utils import ImageReader
        from reportlab.platypus import Image as RLImage
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
        from xml.sax.saxutils import escape
    except ImportError as exc:
        raise RuntimeError(
            "Dependencia em falta: reportlab. Instale com: pip install reportlab"
        ) from exc

    styles = getSampleStyleSheet()
    st_titulo = styles["Title"]
    st_sub = styles["Heading3"]
    st_body = styles["BodyText"]
    st_body.leading = 13

    doc = SimpleDocTemplate(caminho_pdf, pagesize=A4)
    elementos: list[Any] = [Paragraph(escape(titulo), st_titulo), Spacer(1, 10)]

    max_w = 480
    max_h = 250

    for idx, item in enumerate(itens, start=1):
        output = str(item.get("output") or "").strip()
        if not output:
            continue

        caminho_img = _resolver_caminho_ficheiro_projeto(projeto, output)
        if not os.path.isfile(caminho_img):
            continue

        scene_id = str(item.get("scene_id") or "Sxx")
        shot_id = str(item.get("shot_id") or f"SH{idx:02d}")
        prompt = str(item.get("prompt") or "").strip()

        elementos.append(Paragraph(escape(f"{scene_id} / {shot_id}"), st_sub))

        try:
            iw, ih = ImageReader(caminho_img).getSize()
            if iw and ih:
                escala = min(max_w / float(iw), max_h / float(ih), 1.0)
                w = float(iw) * escala
                h = float(ih) * escala
            else:
                w, h = max_w, max_h
        except Exception:
            w, h = max_w, max_h

        elementos.append(RLImage(caminho_img, width=w, height=h))
        if prompt:
            elementos.append(Spacer(1, 5))
            elementos.append(Paragraph(escape(prompt[:420]), st_body))
        elementos.append(Spacer(1, 12))

    if len(elementos) <= 2:
        raise RuntimeError("nenhuma imagem valida para exportar no PDF visual")

    doc.build(elementos)


def _is_image_name(nome: str) -> bool:
    ext = os.path.splitext(str(nome).lower())[1]
    return ext in {".png", ".jpg", ".jpeg", ".webp", ".tiff", ".tif", ".exr", ".bmp"}


def _resolver_caminho_ficheiro_projeto(projeto: str, nome_ficheiro: str) -> str:
    pasta = projects.pasta_ficheiros(projeto)
    nome_seguro = os.path.basename(str(nome_ficheiro or "")).strip()
    if not nome_seguro:
        raise ValueError("nome de ficheiro invalido")

    caminho = os.path.abspath(os.path.join(pasta, nome_seguro))
    pasta_abs = os.path.abspath(pasta)
    if os.path.commonpath([pasta_abs, caminho]) != pasta_abs:
        raise ValueError("ficheiro fora da pasta do projeto")
    return caminho


def _escolher_referencia_fachada(projeto: str, nome_preferido: str | None) -> tuple[str, str]:
    pasta = projects.pasta_ficheiros(projeto)
    if not os.path.isdir(pasta):
        raise ValueError("pasta de projeto não encontrada")

    ficheiros = [f for f in os.listdir(pasta) if os.path.isfile(os.path.join(pasta, f))]
    imagens = [f for f in ficheiros if _is_image_name(f)]
    if not imagens:
        raise ValueError("sem imagem de referência no projeto")

    if nome_preferido:
        nome_preferido = os.path.basename(str(nome_preferido))
        if nome_preferido in imagens:
            return os.path.join(pasta, nome_preferido), nome_preferido
        raise ValueError(f"imagem de referência '{nome_preferido}' não existe no projeto")

    ordenadas = sorted(imagens)
    preferenciais = []
    for nome in ordenadas:
        baixo = nome.lower()
        if any(p in baixo for p in _REF_PREFERENCIAL):
            preferenciais.append(nome)
    escolhido = preferenciais[0] if preferenciais else ordenadas[0]
    return os.path.join(pasta, escolhido), escolhido


def _resolver_prompt_shot(item: Any) -> str:
    if isinstance(item, str):
        return item.strip()
    if not isinstance(item, dict):
        return ""
    for chave in (
        "positive_prompt",
        "prompt",
        "visual_prompt",
        "shot_prompt",
        "descricao",
        "description",
        "texto",
        "text",
    ):
        valor = item.get(chave)
        if isinstance(valor, str) and valor.strip():
            return valor.strip()
    return ""


def _extrair_shots(dados: dict[str, Any]) -> list[dict[str, Any]]:
    shots_origem = dados.get("shots")
    storyboard = dados.get("storyboard")
    resultado: list[dict[str, Any]] = []

    if isinstance(shots_origem, list):
        for idx, item in enumerate(shots_origem, start=1):
            prompt = _resolver_prompt_shot(item)
            if not prompt:
                continue
            scene_id = str(item.get("scene_id") if isinstance(item, dict) else "1")
            shot_id = str(item.get("shot_id") if isinstance(item, dict) else idx)
            seed = item.get("seed") if isinstance(item, dict) else None
            resultado.append(
                {
                    "scene_id": scene_id,
                    "shot_id": shot_id,
                    "prompt": prompt,
                    "seed": seed,
                }
            )
        return resultado

    if isinstance(storyboard, list):
        for idx, item in enumerate(storyboard, start=1):
            prompt = _resolver_prompt_shot(item)
            if not prompt:
                continue
            resultado.append(
                {
                    "scene_id": "1",
                    "shot_id": str(idx),
                    "prompt": prompt,
                    "seed": item.get("seed") if isinstance(item, dict) else None,
                }
            )
        return resultado

    if isinstance(storyboard, dict):
        shots_dict = storyboard.get("shots")
        if isinstance(shots_dict, list):
            for idx, shot in enumerate(shots_dict, start=1):
                prompt = _resolver_prompt_shot(shot)
                if not prompt:
                    continue
                resultado.append(
                    {
                        "scene_id": str(
                            shot.get("scene_id") if isinstance(shot, dict) else idx
                        ),
                        "shot_id": str(
                            shot.get("shot_id") if isinstance(shot, dict) else idx
                        ),
                        "prompt": prompt,
                        "seed": shot.get("seed") if isinstance(shot, dict) else None,
                    }
                )
            if resultado:
                return resultado

        cenas = storyboard.get("scenes")
        if isinstance(cenas, list):
            for cidx, cena in enumerate(cenas, start=1):
                if isinstance(cena, dict) and isinstance(cena.get("shots"), list):
                    for sidx, shot in enumerate(cena["shots"], start=1):
                        prompt = _resolver_prompt_shot(shot)
                        if not prompt:
                            continue
                        resultado.append(
                            {
                                "scene_id": str(cena.get("id") or cidx),
                                "shot_id": str(
                                    shot.get("id") if isinstance(shot, dict) else sidx
                                ),
                                "prompt": prompt,
                                "seed": shot.get("seed") if isinstance(shot, dict) else None,
                            }
                        )
                else:
                    prompt = _resolver_prompt_shot(cena)
                    if not prompt:
                        continue
                    resultado.append(
                        {
                            "scene_id": str(cena.get("id") if isinstance(cena, dict) else cidx),
                            "shot_id": "1",
                            "prompt": prompt,
                            "seed": cena.get("seed") if isinstance(cena, dict) else None,
                        }
                    )
        return resultado

    return resultado


def _atualizar_job(job_id: str, **campos: Any) -> None:
    job = COMFY_BATCH_JOBS.get(job_id)
    if not job:
        return
    job.update(campos)
    job["updated_at"] = _agora_iso()


def _renderizar_shot_tentativa(
    client: ComfyUIClient,
    workflow_template: dict[str, Any],
    comfy_cfg: dict[str, Any],
    projeto: str,
    referencia_local_path: str,
    referencia_input_name: str,
    shot: dict[str, Any],
    tentativa_idx: int,
) -> dict[str, Any]:
    ll = (comfy_cfg.get("line_lock") or {})

    seed = shot.get("seed")
    if not isinstance(seed, int):
        seed = random.randint(1, 2**63 - 1)
    if tentativa_idx > 0:
        seed = int(seed) + tentativa_idx

    scene_id = str(shot.get("scene_id") or "1")
    shot_id = str(shot.get("shot_id") or "1")
    prefixo = f"scene_{scene_id}_shot_{shot_id}_{seed}"

    wf = client.injetar_inputs_workflow(
        workflow_template,
        prompt_text=str(shot.get("prompt") or "").strip(),
        seed=seed,
        filename_prefix=prefixo,
        referencia_input_name=referencia_input_name,
        canny_low_threshold=float(ll.get("canny_low_threshold", 0.06)),
        canny_high_threshold=float(ll.get("canny_high_threshold", 0.24)),
        control_strength=float(ll.get("control_strength", 1.0)),
    )

    prompt_id = client.submeter_prompt(wf)
    historico = client.esperar_conclusao(
        prompt_id,
        max_wait_seconds=int(comfy_cfg.get("max_wait_seconds_per_shot", 600)),
    )
    outputs = client.extrair_outputs(historico)
    if not outputs:
        raise RuntimeError("ComfyUI concluiu sem outputs")

    # Prioriza o nó de saída final do workflow (ex.: FinalShot).
    no_final_cfg = str(comfy_cfg.get("final_output_node") or "FinalShot").strip().lower()

    output_item = None
    for item in outputs:
        titulo_no = str(item.get("node_title") or "").strip().lower()
        node_id = str(item.get("node_id") or "").strip().lower()
        if no_final_cfg and (titulo_no == no_final_cfg or node_id == no_final_cfg):
            output_item = item
            break

    # Fallback seguro: usa output persistido por SaveImage, nunca preview/temp.
    if output_item is None:
        candidatos_output = [
            item
            for item in outputs
            if str(item.get("type") or "").strip().lower() == "output"
        ]
        candidatos_save = [
            item
            for item in candidatos_output
            if str(item.get("node_class_type") or "").strip().lower() == "saveimage"
        ]
        if candidatos_save:
            output_item = candidatos_save[0]
        elif candidatos_output:
            output_item = candidatos_output[0]
        else:
            output_item = outputs[0]

    origem = client.caminho_output_seguro(output_item)
    if not os.path.exists(origem):
        raise FileNotFoundError(f"output não encontrado: {origem}")

    ext = os.path.splitext(origem)[1] or ".png"
    nome_destino = f"{prefixo}{ext}"
    destino = os.path.join(projects.pasta_ficheiros(projeto), nome_destino)
    shutil.copy2(origem, destino)

    aderencia = validar_aderencia_contornos(
        referencia_local_path,
        destino,
        min_coverage=float(ll.get("min_coverage", 0.72)),
        max_spill=float(ll.get("max_spill", 0.35)),
        min_score=float(ll.get("min_score", 0.45)),
        edge_threshold=int(ll.get("edge_threshold", 35)),
    )

    aprovado = bool(aderencia.passed)

    return {
        "aprovado": aprovado,
        "prompt_id": prompt_id,
        "seed": int(seed),
        "tentativa": tentativa_idx + 1,
        "saida_nome": nome_destino,
        "saida_path": destino,
        "score": aderencia.score,
        "coverage": aderencia.coverage,
        "spill": aderencia.spill,
    }


async def _processar_job_comfy_batch(
    job_id: str,
    projeto: str,
    referencia_nome: str,
    referencia_path: str,
    shots: list[dict[str, Any]],
) -> None:
    config = _ler_config()
    comfy_cfg = dict(config.get("comfyui") or {})
    workflow_rel = str(comfy_cfg.get("workflow_template") or "").strip()
    workflow_path = (
        workflow_rel
        if os.path.isabs(workflow_rel)
        else os.path.join(PROJECT_ROOT, workflow_rel)
    )

    if not os.path.exists(workflow_path):
        _atualizar_job(
            job_id,
            status="failed",
            erro=f"workflow não encontrado: {workflow_path}",
        )
        return

    client = ComfyUIClient(
        base_url=str(comfy_cfg.get("base_url") or "http://127.0.0.1:8188"),
        root_dir=str(comfy_cfg.get("root_dir") or ""),
        request_timeout_seconds=int(comfy_cfg.get("request_timeout_seconds", 180)),
        poll_interval_seconds=float(comfy_cfg.get("poll_interval_seconds", 1.5)),
    )
    workflow_template = await run_in_threadpool(client.carregar_workflow, workflow_path)

    try:
        referencia_input_name = await run_in_threadpool(
            client.copiar_referencia_para_input,
            referencia_path,
        )
    except Exception as e:
        _atualizar_job(job_id, status="failed", erro=f"falha ao copiar referência: {e}")
        return

    resultados: list[dict[str, Any]] = []
    max_retries = int(comfy_cfg.get("max_retries_per_shot", 2))

    for idx, shot in enumerate(shots, start=1):
        _atualizar_job(
            job_id,
            status="rendering",
            shot_atual=idx,
            fase="rendering",
            prompt_atual=str(shot.get("prompt") or "")[:140],
        )

        ultimo_erro = None
        resultado_final = None
        ultimo_resultado = None
        for tentativa_idx in range(max_retries + 1):
            try:
                if tentativa_idx > 0:
                    _atualizar_job(job_id, fase="retrying", tentativa=tentativa_idx + 1)

                _atualizar_job(job_id, fase="rendering")
                resultado = await run_in_threadpool(
                    _renderizar_shot_tentativa,
                    client,
                    workflow_template,
                    comfy_cfg,
                    projeto,
                    referencia_path,
                    referencia_input_name,
                    shot,
                    tentativa_idx,
                )
                _atualizar_job(job_id, fase="validating")

                if resultado["aprovado"]:
                    resultado_final = {
                        "scene_id": shot.get("scene_id"),
                        "shot_id": shot.get("shot_id"),
                        "prompt": shot.get("prompt"),
                        **resultado,
                    }
                    break

                ultimo_resultado = resultado
                ultimo_erro = (
                    "aderência insuficiente "
                    f"(score={resultado['score']}, coverage={resultado['coverage']}, spill={resultado['spill']})"
                )
            except Exception as e:
                ultimo_erro = str(e)

        if resultado_final is None:
            base_falha = {
                "scene_id": shot.get("scene_id"),
                "shot_id": shot.get("shot_id"),
                "prompt": shot.get("prompt"),
                "aprovado": False,
                "erro": ultimo_erro or "falha desconhecida",
            }
            if isinstance(ultimo_resultado, dict):
                base_falha.update(
                    {
                        "seed": ultimo_resultado.get("seed"),
                        "tentativa": ultimo_resultado.get("tentativa"),
                        "saida_nome": ultimo_resultado.get("saida_nome"),
                        "saida_path": ultimo_resultado.get("saida_path"),
                        "score": ultimo_resultado.get("score"),
                        "coverage": ultimo_resultado.get("coverage"),
                        "spill": ultimo_resultado.get("spill"),
                    }
                )
            resultados.append(
                base_falha
            )
            _atualizar_job(
                job_id,
                concluido=len([r for r in resultados if r.get("aprovado")]),
                falhados=len([r for r in resultados if not r.get("aprovado")]),
                resultados=resultados,
            )
            continue

        resultados.append(resultado_final)
        meta_nome = (
            f"render_scene_{resultado_final['scene_id']}_shot_{resultado_final['shot_id']}.yaml"
        )
        await run_in_threadpool(
            projects.guardar_metadata_render,
            projeto,
            meta_nome,
            {
                "job_id": job_id,
                "timestamp": _agora_iso(),
                "referencia": referencia_nome,
                "scene_id": resultado_final["scene_id"],
                "shot_id": resultado_final["shot_id"],
                "seed": resultado_final["seed"],
                "tentativa": resultado_final["tentativa"],
                "score": resultado_final["score"],
                "coverage": resultado_final["coverage"],
                "spill": resultado_final["spill"],
                "output": resultado_final["saida_nome"],
            },
        )

        _atualizar_job(
            job_id,
            concluido=len([r for r in resultados if r.get("aprovado")]),
            falhados=len([r for r in resultados if not r.get("aprovado")]),
            resultados=resultados,
        )

    total = len(shots)
    concluidos = len([r for r in resultados if r.get("aprovado")])
    falhados = total - concluidos
    status_final = "done" if falhados == 0 else "done_with_errors"

    _atualizar_job(
        job_id,
        status=status_final,
        fase="done",
        concluido=concluidos,
        falhados=falhados,
        resultados=resultados,
    )
    log(
        f"[COMFYUI] job {job_id} terminado: {concluidos}/{total} aprovados "
        f"(referência: {referencia_nome})"
    )


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


async def api_ficheiro_conteudo(request):
    projeto = str(request.query_params.get("projeto", "geral"))
    nome = str(request.query_params.get("nome", ""))
    download = str(request.query_params.get("download", "0")) in {"1", "true", "yes"}

    try:
        caminho = await run_in_threadpool(_resolver_caminho_ficheiro_projeto, projeto, nome)
    except ValueError as e:
        return JSONResponse({"erro": str(e)}, status_code=400)

    if not os.path.isfile(caminho):
        return JSONResponse({"erro": "ficheiro nao encontrado"}, status_code=404)

    headers = {}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="{os.path.basename(caminho)}"'

    return FileResponse(caminho, filename=os.path.basename(caminho), headers=headers)


async def api_ficheiro_apagar(request):
    dados = await request.json()
    projeto = str(dados.get("projeto", "geral"))
    nome = str(dados.get("nome", ""))

    try:
        caminho = await run_in_threadpool(_resolver_caminho_ficheiro_projeto, projeto, nome)
    except ValueError as e:
        return JSONResponse({"erro": str(e)}, status_code=400)

    if not os.path.isfile(caminho):
        return JSONResponse({"erro": "ficheiro nao encontrado"}, status_code=404)

    await run_in_threadpool(os.remove, caminho)
    log(f"[FICHEIROS] apagado: {os.path.basename(caminho)} -> {projeto}")
    return JSONResponse({"ok": True, "nome": os.path.basename(caminho)})


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


async def api_story_export_pdf(request):
    dados = await request.json()
    projeto = str(dados.get("projeto", "geral")).strip() or "geral"
    titulo = str(dados.get("titulo") or "Historia").strip() or "Historia"
    conteudo = str(dados.get("conteudo") or "").strip()

    if not conteudo:
        return JSONResponse({"erro": "conteudo da historia em falta"}, status_code=400)

    pasta = await run_in_threadpool(projects.pasta_ficheiros, projeto)
    nome = f"story_{_slug_pdf_nome(titulo)}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    caminho = os.path.join(pasta, nome)

    try:
        await run_in_threadpool(_gerar_pdf_texto, caminho, titulo, conteudo)
    except Exception as e:
        return JSONResponse({"erro": str(e)}, status_code=500)

    log(f"[PDF] historia exportada: {nome} -> {projeto}")
    return JSONResponse(
        {
            "ok": True,
            "nome": nome,
            "tamanho": os.path.getsize(caminho),
        }
    )


async def api_storyboard_export_pdf(request):
    dados = await request.json()
    projeto = str(dados.get("projeto", "geral")).strip() or "geral"
    titulo = str(dados.get("titulo") or "Storyboard Visual").strip() or "Storyboard Visual"
    itens_raw = dados.get("itens")

    if not isinstance(itens_raw, list) or not itens_raw:
        return JSONResponse({"erro": "itens do storyboard em falta"}, status_code=400)

    itens: list[dict[str, Any]] = []
    for item in itens_raw:
        if not isinstance(item, dict):
            continue
        output = str(item.get("output") or "").strip()
        if not output:
            continue
        itens.append(
            {
                "scene_id": item.get("scene_id"),
                "shot_id": item.get("shot_id"),
                "prompt": item.get("prompt"),
                "output": output,
            }
        )

    if not itens:
        return JSONResponse({"erro": "nenhum item valido para exportar"}, status_code=400)

    pasta = await run_in_threadpool(projects.pasta_ficheiros, projeto)
    nome = (
        f"storyboard_visual_{_slug_pdf_nome(titulo)}_"
        f"{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    )
    caminho = os.path.join(pasta, nome)

    try:
        await run_in_threadpool(_gerar_pdf_storyboard_visual, caminho, titulo, projeto, itens)
    except Exception as e:
        return JSONResponse({"erro": str(e)}, status_code=500)

    log(f"[PDF] storyboard visual exportado: {nome} -> {projeto}")
    return JSONResponse({"ok": True, "nome": nome, "tamanho": os.path.getsize(caminho)})


async def api_comfyui_render_batch(request):
    dados = await request.json()
    projeto = str(dados.get("projeto", "geral")).strip() or "geral"
    referencia_nome = str(dados.get("referencia_nome") or "").strip() or None

    config = _ler_config()
    comfy_cfg = dict(config.get("comfyui") or {})
    if not bool(comfy_cfg.get("enabled", False)):
        return JSONResponse({"erro": "comfyui desativado no config"}, status_code=400)

    root_dir = str(comfy_cfg.get("root_dir") or "").strip()
    if not root_dir or not os.path.isdir(root_dir):
        return JSONResponse(
            {"erro": "comfyui.root_dir inválido ou inexistente"},
            status_code=400,
        )

    shots = _extrair_shots(dados)
    if not shots:
        return JSONResponse(
            {"erro": "nenhum shot com prompt foi encontrado"},
            status_code=400,
        )

    try:
        referencia_path, referencia_escolhida = await run_in_threadpool(
            _escolher_referencia_fachada,
            projeto,
            referencia_nome,
        )
    except Exception as e:
        return JSONResponse({"erro": str(e)}, status_code=400)

    job_id = uuid.uuid4().hex
    COMFY_BATCH_JOBS[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "fase": "queued",
        "projeto": projeto,
        "referencia": referencia_escolhida,
        "total": len(shots),
        "concluido": 0,
        "falhados": 0,
        "shot_atual": 0,
        "tentativa": 1,
        "resultados": [],
        "erro": None,
        "created_at": _agora_iso(),
        "updated_at": _agora_iso(),
    }

    log(
        f"[COMFYUI] job {job_id} criado para {len(shots)} shots "
        f"(projeto: {projeto}, referência: {referencia_escolhida})"
    )
    asyncio.create_task(
        _processar_job_comfy_batch(
            job_id,
            projeto,
            referencia_escolhida,
            referencia_path,
            shots,
        )
    )

    return JSONResponse(
        {
            "job_id": job_id,
            "status": "queued",
            "total": len(shots),
            "referencia": referencia_escolhida,
        }
    )


async def api_comfyui_render_status(request):
    job_id = str(request.path_params["job_id"])
    job = COMFY_BATCH_JOBS.get(job_id)
    if not job:
        return JSONResponse({"erro": "job não encontrado"}, status_code=404)
    return JSONResponse(job)


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
        Route("/api/ficheiros/conteudo", api_ficheiro_conteudo),
        Route("/api/ficheiros/apagar", api_ficheiro_apagar, methods=["POST"]),
        Route("/api/abrir-pasta", api_abrir_pasta, methods=["POST"]),
        Route("/api/logs", api_logs),
        Route("/api/story/export-pdf", api_story_export_pdf, methods=["POST"]),
        Route("/api/storyboard/export-pdf", api_storyboard_export_pdf, methods=["POST"]),
        Route("/api/comfyui/render-batch", api_comfyui_render_batch, methods=["POST"]),
        Route("/api/comfyui/render-batch/{job_id}", api_comfyui_render_status),
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