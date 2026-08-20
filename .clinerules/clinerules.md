# Contexto
Orquestrador de IA local: loop LLM (planear → escolher ferramenta MCP → 
chamar → verificar → repetir), 100% local via Ollama.
Hardware: RTX 4080 Super 16GB / Ryzen 7 7800X3D / 64GB RAM.
Modelos disponíveis: Devstral Small 24B (qualidade), Qwen Coder 14B / 
gpt-oss-20b (rapidez).

# Regras
- É tudo em português
- Não usar frameworks de agentes (LangGraph, AutoGen, CrewAI) — núcleo 
  construído de raiz para comportamento previsível e fácil de depurar.
- Python 3.11+, tipagem explícita, dependências mínimas.
- Nunca hardcodar paths, nomes de modelo ou endereços — tudo via 
  config/config.yaml ou .env.
- Servidores MCP devem ser "burros": só expõem ações simples (set_cue, 
  load_scene, etc.), sem lógica de negócio no meio.
- Memória e skills: ficheiros simples ou SQLite — sem ORM pesado, sem 
  frameworks de "agent memory".
- Objetivo é portabilidade: o projeto deve poder ser instalado noutra 
  máquina só com o README, sem passos escondidos.
- Cada milestone deve correr e ser testável antes de avançar para o 
  próximo — não construir várias camadas de uma vez.