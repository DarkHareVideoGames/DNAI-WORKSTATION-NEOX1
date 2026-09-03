"""Cliente ComfyUI para geração em lote com validação de aderência a contornos."""

from __future__ import annotations

import json
import os
import shutil
import time
import uuid
from dataclasses import dataclass
from typing import Any

import httpx


@dataclass
class LineLockResult:
    passed: bool
    score: float
    coverage: float
    spill: float


class ComfyUIClient:
    def __init__(
        self,
        base_url: str,
        root_dir: str,
        request_timeout_seconds: int = 120,
        poll_interval_seconds: float = 1.5,
    ) -> None:
        self.base_url = str(base_url).rstrip("/")
        self.root_dir = os.path.abspath(root_dir)
        self.timeout = request_timeout_seconds
        self.poll_interval = poll_interval_seconds

    def carregar_workflow(self, caminho_workflow: str) -> dict[str, Any]:
        with open(caminho_workflow, "r", encoding="utf-8") as f:
            return json.load(f)

    def copiar_referencia_para_input(self, caminho_referencia_local: str) -> str:
        input_dir = os.path.join(self.root_dir, "input")
        os.makedirs(input_dir, exist_ok=True)

        base = os.path.basename(caminho_referencia_local)
        nome, ext = os.path.splitext(base)
        nome_final = f"{nome}-{uuid.uuid4().hex[:8]}{ext}"
        destino = os.path.join(input_dir, nome_final)

        shutil.copy2(caminho_referencia_local, destino)
        return nome_final

    def injetar_inputs_workflow(
        self,
        workflow: dict[str, Any],
        *,
        prompt_text: str,
        seed: int,
        filename_prefix: str,
        referencia_input_name: str,
        canny_low_threshold: float,
        canny_high_threshold: float,
        control_strength: float,
    ) -> dict[str, Any]:
        w = json.loads(json.dumps(workflow))

        # Nós mapeados no workflow fornecido pelo utilizador.
        w["58"]["inputs"]["image"] = referencia_input_name
        w["70:45"]["inputs"]["text"] = prompt_text
        w["70:44"]["inputs"]["seed"] = int(seed)
        w["9"]["inputs"]["filename_prefix"] = filename_prefix

        w["57"]["inputs"]["low_threshold"] = float(canny_low_threshold)
        w["57"]["inputs"]["high_threshold"] = float(canny_high_threshold)
        w["70:60"]["inputs"]["strength"] = float(control_strength)

        return w

    def submeter_prompt(self, workflow: dict[str, Any]) -> str:
        with httpx.Client(timeout=self.timeout) as c:
            r = c.post(f"{self.base_url}/prompt", json={"prompt": workflow})
            r.raise_for_status()
            dados = r.json()
        prompt_id = dados.get("prompt_id")
        if not prompt_id:
            raise RuntimeError("ComfyUI não devolveu prompt_id")
        return str(prompt_id)

    def esperar_conclusao(self, prompt_id: str, max_wait_seconds: int = 600) -> dict[str, Any]:
        fim = time.time() + max_wait_seconds
        with httpx.Client(timeout=self.timeout) as c:
            while time.time() < fim:
                r = c.get(f"{self.base_url}/history/{prompt_id}")
                r.raise_for_status()
                dados = r.json() or {}
                if prompt_id in dados:
                    return dados[prompt_id]
                time.sleep(self.poll_interval)
        raise TimeoutError(f"ComfyUI não concluiu prompt {prompt_id} em {max_wait_seconds}s")

    def extrair_outputs(self, historico_prompt: dict[str, Any]) -> list[dict[str, str]]:
        outputs: list[dict[str, str]] = []
        output_nodes = (historico_prompt.get("outputs") or {})

        prompt_payload = historico_prompt.get("prompt")
        workflow_nodes: dict[str, Any] = {}
        if isinstance(prompt_payload, (list, tuple)) and len(prompt_payload) > 2:
            maybe_workflow = prompt_payload[2]
            if isinstance(maybe_workflow, dict):
                workflow_nodes = maybe_workflow
        elif isinstance(prompt_payload, dict):
            workflow_nodes = prompt_payload

        for node_id, node_data in output_nodes.items():
            node_id_str = str(node_id)
            wf_node = workflow_nodes.get(node_id_str)
            node_title = ""
            node_class_type = ""
            if isinstance(wf_node, dict):
                node_title = str((wf_node.get("_meta") or {}).get("title") or "").strip()
                node_class_type = str(wf_node.get("class_type") or "").strip()

            for img in (node_data.get("images") or []):
                filename = str(img.get("filename") or "").strip()
                subfolder = str(img.get("subfolder") or "").strip()
                kind = str(img.get("type") or "output").strip() or "output"
                if filename:
                    outputs.append(
                        {
                            "node_id": node_id_str,
                            "node_title": node_title,
                            "node_class_type": node_class_type,
                            "filename": filename,
                            "subfolder": subfolder,
                            "type": kind,
                        }
                    )
        return outputs

    def caminho_output_seguro(self, item: dict[str, str]) -> str:
        base_saida = os.path.join(self.root_dir, "output")
        filename = os.path.basename(item["filename"])
        subfolder = item.get("subfolder", "").replace("\\", "/").strip("/")

        if subfolder:
            caminho = os.path.abspath(os.path.join(base_saida, subfolder, filename))
        else:
            caminho = os.path.abspath(os.path.join(base_saida, filename))

        common = os.path.commonpath([base_saida, caminho])
        if common != os.path.abspath(base_saida):
            raise RuntimeError("Output do ComfyUI fora da pasta esperada")
        return caminho


def validar_aderencia_contornos(
    referencia_path: str,
    gerada_path: str,
    *,
    min_coverage: float,
    max_spill: float,
    min_score: float,
    edge_threshold: int = 35,
) -> LineLockResult:
    try:
        from PIL import Image, ImageFilter
    except ImportError as exc:
        raise RuntimeError(
            "Pillow não está instalado. Instale com: pip install Pillow"
        ) from exc

    ref = Image.open(referencia_path).convert("L")
    gen = Image.open(gerada_path).convert("L")
    if gen.size != ref.size:
        gen = gen.resize(ref.size)

    ref_edges = ref.filter(ImageFilter.FIND_EDGES).point(
        lambda p: 255 if p >= edge_threshold else 0
    )
    gen_edges = gen.filter(ImageFilter.FIND_EDGES).point(
        lambda p: 255 if p >= edge_threshold else 0
    )

    ref_data = list(ref_edges.getdata())
    gen_data = list(gen_edges.getdata())

    ref_total = sum(1 for p in ref_data if p > 0)
    gen_total = sum(1 for p in gen_data if p > 0)

    if ref_total == 0:
        return LineLockResult(False, 0.0, 0.0, 1.0)

    overlap = 0
    outside = 0
    for r, g in zip(ref_data, gen_data):
        r_on = r > 0
        g_on = g > 0
        if r_on and g_on:
            overlap += 1
        elif g_on and not r_on:
            outside += 1

    coverage = overlap / ref_total
    spill = (outside / gen_total) if gen_total else 1.0
    score = max(0.0, min(1.0, coverage * (1.0 - spill)))

    passed = coverage >= min_coverage and spill <= max_spill and score >= min_score
    return LineLockResult(passed, round(score, 4), round(coverage, 4), round(spill, 4))
