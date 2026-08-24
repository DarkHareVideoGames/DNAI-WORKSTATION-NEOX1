"""
Núcleo orquestrador — Milestone 1 (+ memória entre turnos).

Liga-se a um servidor MCP via stdio, descobre as ferramentas disponíveis,
chama o modelo local (via LM Studio, servidor OpenAI-compatible) com essas
ferramentas, executa as tool calls pedidas pelo modelo e devolve a resposta
final com dados reais.

Memória: `run()` recebe e devolve o histórico da conversa (lista de
mensagens), em vez de manter estado escondido. Quem chama (ex.: cli_chat.py)
guarda o histórico devolvido e passa-o na chamada seguinte — assim o
orquestrador continua "sem estado" e fácil de testar, mas a conversa
mantém contexto entre turnos.
"""

import asyncio
import json
import os
from typing import Any

import yaml
from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.types import Tool
from openai import OpenAI

# Raiz do projeto = pasta pai deste ficheiro (core/), calculada a partir do
# caminho absoluto do próprio módulo — o mesmo truque já usado no
# cli_chat.py. Evita depender da pasta a partir de onde o processo foi
# lançado (cwd), que muda consoante o terminal/atalho usado para arrancar.
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_CONFIG_PATH = os.path.join(_PROJECT_ROOT, "config", "config.yaml")

# Nº máximo de mensagens mantidas no histórico antes de começarmos a
# descartar as mais antigas — proteção simples contra estourar o num_ctx do
# modelo (ver lição registada no DNAI-log-progresso.md sobre truncagem
# silenciosa do Ollama). Pode ser sobreposto em config.yaml:
#   memory:
#     max_history_messages: 20
DEFAULT_MAX_HISTORY_MESSAGES = 20


def _mcp_tool_to_local_model_tool(tool: Tool) -> dict[str, Any]:
    """Converte a definição de uma ferramenta MCP no formato de function-calling OpenAI-compatible."""
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description or "",
            "parameters": tool.inputSchema or {"type": "object", "properties": {}},
        },
    }


def _trim_history(history: list[dict[str, Any]], max_messages: int) -> list[dict[str, Any]]:
    """Mantém só as últimas `max_messages` mensagens do histórico.

    Simplificação deliberada (MVP): corta por contagem de mensagens, sem se
    preocupar em manter pares tool_call/tool juntos. Suficiente para já não
    estourar o contexto; uma futura biblioteca de memória mais cuidada pode
    resumir em vez de cortar.
    """
    if len(history) <= max_messages:
        return list(history)
    return list(history[-max_messages:])


async def _run_async(
    user_message: str, history: list[dict[str, Any]]
) -> tuple[str, list[dict[str, Any]]]:
    with open(_CONFIG_PATH, "r") as f:
        config = yaml.safe_load(f)

    # Configurações de API para LM Studio (servidor OpenAI-compatible)
    base_url = config["api"]["base_url"]
    api_key = config["api"]["api_key"]

    model_name = config["model"]["name"]
    server_cfg = config["mcp_servers"][0]
    max_history = config.get("memory", {}).get(
        "max_history_messages", DEFAULT_MAX_HISTORY_MESSAGES
    )

    # Identidade do agente (secção persona do config.yaml). Injetada como
    # system prompt a cada chamada, mas NÃO guardada no histórico devolvido:
    # assim o histórico mantém-se limpo (só user/assistant/tool) e a
    # identidade nunca se perde, mesmo com a truncagem das mensagens antigas.
    system_prompt = (config.get("persona") or {}).get("system_prompt")

    client = OpenAI(base_url=base_url, api_key=api_key)

    server_params = StdioServerParameters(
        command=server_cfg["command"],
        args=server_cfg.get("args", []),
        env=server_cfg.get("env"),
        # Se o config.yaml não indicar um "cwd" próprio, o servidor MCP (ex.:
        # mcp-server-git --repository .) arranca a partir da raiz do
        # projeto, não da pasta onde o terminal calhou de estar.
        cwd=server_cfg.get("cwd", _PROJECT_ROOT),
    )

    async with stdio_client(server_params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()  # handshake MCP obrigatório

            tools_result = await session.list_tools()
            local_model_tools = [_mcp_tool_to_local_model_tool(t) for t in tools_result.tools]
            tools_by_name = {t.name: t for t in tools_result.tools}

            messages = _trim_history(history, max_history)
            if system_prompt:
                messages.insert(0, {"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": user_message})

            response = client.chat.completions.create(
                model=model_name, messages=messages, tools=local_model_tools
            )
            assistant_message = response.choices[0].message
            # Adiciona a mensagem do assistente, mantendo tool_calls se existirem
            msg = assistant_message.model_dump(exclude_none=True)
            msg["role"] = "assistant"
            messages.append(msg)

            if not assistant_message.tool_calls:
                return assistant_message.content or "", messages

            # Executa cada tool call pedida pelo modelo através da sessão MCP real
            for call in assistant_message.tool_calls:
                tool_name = call.function.name
                # No formato OpenAI, os argumentos vêm como uma string JSON,
                # não como dict — é preciso descodificar antes de passar ao MCP.
                try:
                    tool_args = json.loads(call.function.arguments or "{}")
                except json.JSONDecodeError:
                    tool_args = {}
                tool_output = ""  # Inicializa a saída da ferramenta

                if tool_name not in tools_by_name:
                    tool_output = f"ERRO DE CONFIGURAÇÃO: Ferramenta '{tool_name}' solicitada, mas não foi encontrada no servidor MCP."
                else:
                    try:
                        result = await session.call_tool(tool_name, tool_args)
                        if result.isError:
                            error_details = "\n".join(block.text for block in result.content if hasattr(block, "text"))
                            tool_output = f"ERRO NA EXECUÇÃO DE '{tool_name}': {error_details}"
                        else:
                            tool_output = "\n".join(block.text for block in result.content if hasattr(block, "text"))

                    except Exception as e:
                        # Captura erros de comunicação ou protocolo MCP
                        tool_output = f"ERRO CRÍTICO DE COMUNICAÇÃO MCP ao chamar '{tool_name}': {type(e).__name__}: {str(e)}"

                # O formato OpenAI exige tool_call_id a associar a resposta à
                # tool_call pedida (em vez de "tool_name", que o Ollama aceitava).
                messages.append(
                    {"role": "tool", "tool_call_id": call.id, "content": tool_output}
                )

            # Segunda chamada: dá ao modelo o resultado real da ferramenta para
            # produzir a resposta final em linguagem natural ("verificar resultado").
            final_response = client.chat.completions.create(
                model=model_name, messages=messages, tools=local_model_tools
            )
            final_message = final_response.choices[0].message
            messages.append(final_message.model_dump(exclude_none=True))

            return final_message.content or "", messages


def run(
    user_message: str, history: list[dict[str, Any]] | None = None
) -> tuple[str, list[dict[str, Any]]]:
    """Ponto de entrada síncrono usado por test_smoke.py e pelas interfaces.

    `history`: mensagens da conversa até agora (None/[] no primeiro turno).
    Devolve (resposta, historico_atualizado) — guarda o histórico devolvido
    e passa-o na chamada seguinte para manter contexto entre turnos.
    """
    history = history or []
    try:
        return asyncio.run(_run_async(user_message, history))
    except Exception as e:
        # Captura erros gerais de execução do run() (ex: falha ao iniciar o evento)
        import traceback
        traceback.print_exc()
        return f"ERRO FATAL DE EXECUÇÃO DO ORQUESTRADOR: {type(e).__name__}: {str(e)}", history