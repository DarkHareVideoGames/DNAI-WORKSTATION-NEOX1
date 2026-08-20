"""
Núcleo orquestrador — Milestone 1.

Liga-se a um servidor MCP via stdio, descobre as ferramentas disponíveis,
chama o modelo local via Ollama com essas ferramentas, executa as tool
calls pedidas pelo modelo e devolve a resposta final com dados reais.
"""

import asyncio
from typing import Any

import ollama
import yaml
from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.types import Tool


def _mcp_tool_to_ollama_tool(tool: Tool) -> dict[str, Any]:
    """Converte a definição de uma ferramenta MCP no formato de function-calling do Ollama."""
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description or "",
            "parameters": tool.inputSchema or {"type": "object", "properties": {}},
        },
    }


async def _run_async(user_message: str) -> str:
    with open("config/config.yaml", "r") as f:
        config = yaml.safe_load(f)

    model_name = config["model"]["name"]
    server_cfg = config["mcp_servers"][0]

    server_params = StdioServerParameters(
        command=server_cfg["command"],
        args=server_cfg.get("args", []),
        env=server_cfg.get("env"),
    )

    # stdio_client arranca o processo do servidor MCP e mantém-no vivo durante
    # todo o bloco `async with`: é um processo persistente que fala JSON-RPC
    # pelo stdin/stdout, não uma sequência de comandos "de um tiro" (por isso
    # "tools/list" e "tools/call" nunca podem ser argumentos de linha de
    # comando — são métodos JSON-RPC enviados através da ClientSession).
    async with stdio_client(server_params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()  # handshake MCP obrigatório

            tools_result = await session.list_tools()
            ollama_tools = [_mcp_tool_to_ollama_tool(t) for t in tools_result.tools]
            tools_by_name = {t.name: t for t in tools_result.tools}

            messages: list[dict[str, Any]] = [
                {"role": "user", "content": user_message}
            ]

            response = ollama.chat(model=model_name, messages=messages, tools=ollama_tools)
            assistant_message = response.message
            messages.append(assistant_message.model_dump(exclude_none=True))

            if not assistant_message.tool_calls:
                return assistant_message.content or ""

            # Executa cada tool call pedida pelo modelo através da sessão MCP real
            for call in assistant_message.tool_calls:
                tool_name = call.function.name
                tool_args = call.function.arguments or {}

                if tool_name not in tools_by_name:
                    tool_output = f"Erro: ferramenta '{tool_name}' não existe neste servidor MCP."
                else:
                    result = await session.call_tool(tool_name, tool_args)
                    tool_output = "\n".join(
                        block.text for block in result.content if hasattr(block, "text")
                    )
                    if result.isError:
                        tool_output = f"Erro ao executar '{tool_name}': {tool_output}"

                messages.append(
                    {"role": "tool", "tool_name": tool_name, "content": tool_output}
                )

            # Segunda chamada: dá ao modelo o resultado real da ferramenta para
            # produzir a resposta final em linguagem natural ("verificar resultado").
            final_response = ollama.chat(model=model_name, messages=messages, tools=ollama_tools)
            return final_response.message.content or ""


def run(user_message: str) -> str:
    """Ponto de entrada síncrono usado por test_smoke.py e pelas interfaces futuras."""
    try:
        return asyncio.run(_run_async(user_message))
    except Exception as e:
        return f"Error: {str(e)}"