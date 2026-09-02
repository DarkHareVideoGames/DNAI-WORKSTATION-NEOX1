"""
Gerenciador de agentes especializados.

Carrega configuração de agentes e fornece funções para:
- Listar agentes disponíveis
- Obter modelo de um agente
- Obter regras de um agente
"""

import os
import yaml
from typing import Any

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_CONFIG_PATH = os.path.join(_PROJECT_ROOT, "config", "agents.yaml")


def _carregar_config() -> dict:
    """Carrega configuração de agentes."""
    with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _perfil_modelo_ativo(config: dict[str, Any]) -> str:
    """Devolve o perfil de modelo global ativo."""
    perfil = ((config.get("modelos") or {}).get("perfil_modelo_ativo") or "equilibrado")
    return str(perfil).strip().lower() or "equilibrado"


def _modelo_por_perfil(agente: dict[str, Any], perfil: str) -> str:
    """Seleciona o modelo do agente de acordo com o perfil."""
    mapa = agente.get("modelos") or {}
    if isinstance(mapa, dict):
        escolhido = str(mapa.get(perfil, "")).strip()
        if escolhido:
            return escolhido
    return str(agente.get("modelo", "")).strip()


def listar_agentes() -> list[dict[str, Any]]:
    """Retorna lista de agentes disponíveis."""
    config = _carregar_config()
    perfil = _perfil_modelo_ativo(config)
    agentes = []
    for agente in config.get("agentes", []):
        if agente.get("ativo"):
            agentes.append({
                "id": agente["id"],
                "nome": agente["nome"],
                "descricao": agente.get("descricao", ""),
                "emoji": agente.get("emoji", "🤖"),
                "cor": agente.get("cor", "#ff7a1a"),
                "modelo": _modelo_por_perfil(agente, perfil),
                "tipo": agente.get("tipo", "generico"),
                "perfil_modelo_ativo": perfil,
            })
    return agentes


def obter_agente(agente_id: str) -> dict[str, Any] | None:
    """Retorna dados de um agente específico."""
    config = _carregar_config()
    for agente in config.get("agentes", []):
        if agente["id"] == agente_id:
            return agente
    return None


def obter_modelo(agente_id: str) -> str:
    """Retorna o modelo de um agente."""
    config = _carregar_config()
    perfil = _perfil_modelo_ativo(config)
    agente = None
    for item in config.get("agentes", []):
        if item.get("id") == agente_id:
            agente = item
            break
    if agente:
        return _modelo_por_perfil(agente, perfil)
    return ""


def _instrucoes_globais(config: dict[str, Any]) -> str:
    """Devolve instrucoes globais de agentes definidas no YAML."""
    instrucoes = (config.get("instrucoes") or {}).get("global", "")
    return str(instrucoes).strip()


def _compor_instrucoes_yaml(config: dict[str, Any], agente: dict[str, Any]) -> str:
    """Compoe instrucoes globais + instrucoes especificas do agente."""
    partes: list[str] = []
    globais = _instrucoes_globais(config)
    if globais:
        partes.append(globais)

    especificas = str(agente.get("instrucoes") or "").strip()
    if especificas:
        partes.append(especificas)

    return "\n\n".join(partes).strip()


def obter_regras_agente(agente_id: str) -> str | None:
    """Retorna as regras especializadas de um agente."""
    config = _carregar_config()
    agente = None
    for item in config.get("agentes", []):
        if item.get("id") == agente_id:
            agente = item
            break

    if not agente:
        return None

    # Prioriza instrucoes declaradas no YAML (global + agente).
    regras_yaml = _compor_instrucoes_yaml(config, agente)
    if regras_yaml:
        return regras_yaml
    
    agente_type = agente.get("agente")
    if not agente_type:
        return None
    
    try:
        # Importa dinamicamente o módulo de agente
        if agente_type == "story_creator":
            from core.agents.story_creator import obter_regras_story_creator
            return obter_regras_story_creator()
        elif agente_type == "storyboard_creator":
            from core.agents.storyboard_creator import obter_regras_storyboard_creator
            return obter_regras_storyboard_creator()
        elif agente_type == "video_creator":
            from core.agents.video_creator import obter_regras_video_creator
            return obter_regras_video_creator()
    except ImportError:
        pass
    
    return None
