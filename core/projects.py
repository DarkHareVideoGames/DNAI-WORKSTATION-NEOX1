"""
Gestão de projetos — ficheiros YAML em `data/projetos/`.

Cada projeto é um ficheiro `<slug>.yaml` com:
    nome:               nome de apresentação
    descricao:          descrição livre
    agente_nome:        nome do agente neste projeto (customizável;
                        por omissão herda o do config.yaml)
    regras_especificas: regras extra (system prompt adicional) que se
                        juntam à persona base definida no config.yaml

Cada projeto tem também uma pasta de ficheiros em
`data/projetos/<slug>/ficheiros/` (uploads da interface, Milestone 3).
"""

import os
import re
from typing import Any

import yaml

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJETOS_DIR = os.path.join(_PROJECT_ROOT, "data", "projetos")

# Campos válidos num projeto (qualquer outro é ignorado ao guardar).
_CAMPOS = ("nome", "descricao", "agente_nome", "regras_especificas")


def _slug(nome: str) -> str:
    """Converte um nome de projeto num nome de ficheiro seguro."""
    slug = re.sub(r"[^\w\s-]", "", nome, flags=re.UNICODE).strip().lower()
    slug = re.sub(r"[\s]+", "-", slug)
    return slug or "projeto"


def _caminho(slug: str) -> str:
    return os.path.join(PROJETOS_DIR, slug + ".yaml")


def _criar_estrutura(slug: str) -> None:
    """Cria a pasta do projeto e a subpasta de ficheiros (uploads)."""
    os.makedirs(os.path.join(PROJETOS_DIR, slug, "ficheiros"), exist_ok=True)


def criar_projeto(
    nome: str,
    descricao: str = "",
    agente_nome: str | None = None,
    regras_especificas: str = "",
) -> dict:
    """Cria um projeto novo. Devolve o dicionário do projeto criado."""
    if not nome or not nome.strip():
        raise ValueError("O nome do projeto não pode ser vazio.")
    slug = _slug(nome)
    caminho = _caminho(slug)
    if os.path.exists(caminho):
        raise FileExistsError(f"Já existe um projeto com o nome '{nome}'.")
    projeto: dict[str, Any] = {
        "nome": nome.strip(),
        "descricao": descricao,
        "agente_nome": agente_nome,
        "regras_especificas": regras_especificas,
    }
    _criar_estrutura(slug)
    with open(caminho, "w", encoding="utf-8") as f:
        yaml.safe_dump(projeto, f, allow_unicode=True, sort_keys=False)
    return projeto


def listar_projetos() -> list[dict]:
    """Lista todos os projetos (por ordem alfabética do nome)."""
    if not os.path.isdir(PROJETOS_DIR):
        return []
    projetos: list[dict] = []
    for ficheiro in sorted(os.listdir(PROJETOS_DIR)):
        if not ficheiro.endswith(".yaml"):
            continue
        try:
            with open(os.path.join(PROJETOS_DIR, ficheiro), "r", encoding="utf-8") as f:
                dados = yaml.safe_load(f) or {}
            dados["slug"] = ficheiro[:-5]
            projetos.append(dados)
        except (yaml.YAMLError, OSError):
            continue  # ficheiro corrompido não deve rebentar a listagem
    return sorted(projetos, key=lambda p: str(p.get("nome", "")).lower())


def carregar_projeto(nome_ou_slug: str) -> dict | None:
    """Carrega um projeto por nome ou slug. Devolve None se não existir."""
    slug = _slug(nome_ou_slug)
    caminho = _caminho(slug)
    if not os.path.exists(caminho):
        return None
    with open(caminho, "r", encoding="utf-8") as f:
        dados = yaml.safe_load(f) or {}
    dados["slug"] = slug
    return dados


def guardar_projeto(projeto: dict) -> None:
    """Guarda (cria ou atualiza) um projeto. Mantém a pasta de ficheiros."""
    nome = str(projeto.get("nome", "")).strip()
    if not nome:
        raise ValueError("O projeto precisa de um 'nome'.")
    slug = _slug(nome)
    limpo = {campo: projeto.get(campo) for campo in _CAMPOS}
    _criar_estrutura(slug)
    with open(_caminho(slug), "w", encoding="utf-8") as f:
        yaml.safe_dump(limpo, f, allow_unicode=True, sort_keys=False)


def apagar_projeto(nome_ou_slug: str) -> bool:
    """Apaga o YAML e a pasta de ficheiros do projeto. Devolve True se existia."""
    slug = _slug(nome_ou_slug)
    caminho = _caminho(slug)
    pasta = os.path.join(PROJETOS_DIR, slug)
    existia = False
    if os.path.exists(caminho):
        os.remove(caminho)
        existia = True
    if os.path.isdir(pasta):
        import shutil

        shutil.rmtree(pasta)
        existia = True
    return existia


def pasta_ficheiros(nome_ou_slug: str) -> str:
    """Devolve (e cria, se necessário) a pasta de ficheiros do projeto."""
    slug = _slug(nome_ou_slug)
    pasta = os.path.join(PROJETOS_DIR, slug, "ficheiros")
    os.makedirs(pasta, exist_ok=True)
    return pasta