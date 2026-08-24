"""
Camada de persistência — SQLite (biblioteca padrão, zero dependências).

Guarda conversas e mensagens do agente em `data/neox1.db`. O histórico
guardado é compatível com o formato que `orchestrator.run()` espera
(lista de dicts role/content/tool_call_id, sem mensagens de sistema).

Estratégia de escrita deliberada (MVP): após cada turno, o histórico
completo da conversa é substituído na base de dados (DELETE + INSERT numa
transação). Com o limite de 20 mensagens do histórico, o custo é
irrelevante e elimina qualquer lógica de sincronização incremental.
"""

import os
import sqlite3
from datetime import datetime

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(_PROJECT_ROOT, "data")
DB_PATH = os.path.join(DATA_DIR, "neox1.db")


def _agora() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _ligar() -> sqlite3.Connection:
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def inicializar() -> None:
    """Cria as tabelas se não existirem (idempotente)."""
    with _ligar() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS conversas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                projeto TEXT NOT NULL DEFAULT 'geral',
                titulo TEXT NOT NULL DEFAULT 'Nova conversa',
                criada_em TEXT NOT NULL,
                atualizada_em TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS mensagens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversa_id INTEGER NOT NULL
                    REFERENCES conversas(id) ON DELETE CASCADE,
                role TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                tool_call_id TEXT,
                criada_em TEXT NOT NULL
            )
            """
        )


def _linha_para_dict(linha: sqlite3.Row) -> dict:
    return dict(linha)


# ---------------------------------------------------------------- conversas

def criar_conversa(projeto: str = "geral", titulo: str = "Nova conversa") -> int:
    """Cria uma conversa e devolve o seu id."""
    inicializar()
    agora = _agora()
    with _ligar() as conn:
        cursor = conn.execute(
            "INSERT INTO conversas (projeto, titulo, criada_em, atualizada_em) "
            "VALUES (?, ?, ?, ?)",
            (projeto, titulo, agora, agora),
        )
        return int(cursor.lastrowid)


def listar_conversas(projeto: str | None = None) -> list[dict]:
    """Lista conversas (todas, ou as de um projeto), mais recentes primeiro."""
    inicializar()
    with _ligar() as conn:
        if projeto is None:
            linhas = conn.execute(
                "SELECT * FROM conversas ORDER BY atualizada_em DESC, id DESC"
            ).fetchall()
        else:
            linhas = conn.execute(
                "SELECT * FROM conversas WHERE projeto = ? "
                "ORDER BY atualizada_em DESC, id DESC",
                (projeto,),
            ).fetchall()
        return [_linha_para_dict(l) for l in linhas]


def obter_conversa(conversa_id: int) -> dict | None:
    """Devolve a conversa ou None se não existir."""
    inicializar()
    with _ligar() as conn:
        linha = conn.execute(
            "SELECT * FROM conversas WHERE id = ?", (conversa_id,)
        ).fetchone()
        return _linha_para_dict(linha) if linha else None


def renomear_conversa(conversa_id: int, titulo: str) -> bool:
    """Renomeia uma conversa. Devolve True se existir."""
    inicializar()
    with _ligar() as conn:
        cursor = conn.execute(
            "UPDATE conversas SET titulo = ?, atualizada_em = ? WHERE id = ?",
            (titulo, _agora(), conversa_id),
        )
        return cursor.rowcount > 0


def apagar_conversa(conversa_id: int) -> bool:
    """Apaga uma conversa e as suas mensagens (CASCADE). Devolve True se existir."""
    inicializar()
    with _ligar() as conn:
        cursor = conn.execute("DELETE FROM conversas WHERE id = ?", (conversa_id,))
        return cursor.rowcount > 0


# ---------------------------------------------------------------- mensagens

def guardar_historico(conversa_id: int, historico: list[dict]) -> None:
    """Substitui as mensagens guardadas da conversa pelo histórico completo.

    `historico` é o formato devolvido por `orchestrator.run()`:
    dicts com role/content e, opcionalmente, tool_call_id/tool_calls.
    Mensagens de sistema são ignoradas (a persona é reinjetada a cada turno).
    """
    inicializar()
    agora = _agora()
    with _ligar() as conn:
        conn.execute("DELETE FROM mensagens WHERE conversa_id = ?", (conversa_id,))
        for msg in historico:
            role = msg.get("role")
            if role is None or role == "system":
                continue
            conn.execute(
                "INSERT INTO mensagens (conversa_id, role, content, tool_call_id, criada_em) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    conversa_id,
                    role,
                    str(msg.get("content") or ""),
                    msg.get("tool_call_id"),
                    agora,
                ),
            )
        conn.execute(
            "UPDATE conversas SET atualizada_em = ? WHERE id = ?",
            (agora, conversa_id),
        )


def carregar_historico(conversa_id: int) -> list[dict]:
    """Carrega o histórico guardado no formato que `orchestrator.run()` espera."""
    inicializar()
    with _ligar() as conn:
        linhas = conn.execute(
            "SELECT role, content, tool_call_id FROM mensagens "
            "WHERE conversa_id = ? ORDER BY id",
            (conversa_id,),
        ).fetchall()
    historico: list[dict] = []
    for l in linhas:
        msg: dict = {"role": l["role"], "content": l["content"]}
        if l["tool_call_id"]:
            msg["tool_call_id"] = l["tool_call_id"]
        historico.append(msg)
    return historico