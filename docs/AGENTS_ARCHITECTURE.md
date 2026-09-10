# Arquitetura de Agentes — NEO X1

Consolida o que antes estava espalhado por `VIDEOMAPPING_AGENTS_GUIDE.md`,
`SISTEMA_ABAS_AGENTES.md`, `IMPLEMENTATION_SUMMARY.md`, `README_VIDEOMAPPING.md`
e `VERIFICATION_REPORT.md`. Esses cinco ficheiros foram removidos por serem
relatórios de estado sobrepostos e, nalguns casos, referirem scripts de teste
que já não existem no repositório.

## 1. Visão geral

A webapp suporta múltiplos agentes especializados, selecionáveis por abas,
além do agente genérico NEO X1:

| Agente | Entrada | Saída | Destino |
|---|---|---|---|
| **NEO X1** | Conversa livre | Resposta genérica | — |
| **Story Creator** | Temas + contexto | História estruturada (sinopse, atos, cenas) | Storyboard Creator |
| **Storyboard Creator** | História | Prompts visuais detalhados por cena | ComfyUI (imagem) |
| **Video Creator** | Storyboard | Prompts de transição (first/last frame) | ComfyUI (vídeo) |

Módulos: `core/agents/story_creator.py`, `storyboard_creator.py`,
`video_creator.py` (regras/system prompts especializados). Ligados a
[dome-mapping] — o objetivo final é gerar sequências para videomapping em
edifícios/dome.

## 2. Sistema de abas (backend)

- `core/agentes.py` — gestor: `listar_agentes()`, `obter_agente(id)`,
  `obter_modelo(id)`, `obter_regras_agente(id)`. Carrega `config/agents.yaml`.
- `config/agents.yaml` — define cada agente (id, nome, modelo, emoji, tipo).
- `interfaces/webapp.py` — `GET /api/agentes` lista os agentes;
  `api_chat()` aceita `agente` no POST, obtém as regras especializadas e
  devolve `agente`/`modelo` na resposta.

## 3. Sistema de abas (frontend)

- `interfaces/static/index.html` / `style.css` — UI das abas
  (`.abas-container`, `.aba-agente`, estado ativo).
- `interfaces/static/app.js` — `carregarAgentes()` busca `/api/agentes`;
  `selecionarAgente()` muda o agente ativo e persiste em `localStorage`;
  `enviarMensagem()` envia `agente: estado.agenteAtual` no POST.

## 4. Formato dos prompts (Storyboard Creator)

```
[CENA X: Título]
Duração: XXs

PROMPT PRINCIPAL:
"Descrição visual detalhada — estilo, cores, iluminação, composição, emoção"

ESPECIFICAÇÕES:
• Resolução: 1920x1080, 16:9
• Estilo / Paleta / Lighting

REFERÊNCIAS: inspirações visuais, artistas, filmes
```

Boas práticas: ser específico, estruturar em camadas (objeto/cenário/efeitos),
incluir negações ("sem pessoas", "sem texto"), descrever lighting.

## 5. Formato dos prompts (Video Creator)

Tipos de transição suportados: dissolve, wipe, zoom, morph, particle, glitch.

```
[TRANSIÇÃO 1: Cena A → Cena B]
FIRST FRAME: "..."
TRANSIÇÃO: "..."
LAST FRAME: "..."
MOVIMENTO: [tipo de câmara/objeto]
EFEITOS: [partículas, distorções, glow]
```

## 6. Integração com ComfyUI

- **Imagens** (Storyboard Creator): copiar o prompt principal, definir
  resolução/modelo (SDXL, Flux, etc.), gerar e guardar (`cena_01.png`, ...).
- **Vídeos** (Video Creator): usar workflow Video-to-Video, definir
  first/last frame e tipo de transição, exportar `.mp4`.
- Ver também `core/comfyui_client.py` e o pipeline de render batch em
  `interfaces/webapp.py` (`api_comfyui_render_batch`), que já automatiza
  parte deste fluxo para o Storyboard Maker.

## 7. Bugs conhecidos / limitações

1. **Modelo não muda por agente** — a webapp troca a aba/agente mas
   `api_chat()` continua a usar o modelo de `config.yaml`, não o
   `obter_modelo(agente_id)` correspondente. Corrigir requer passar o
   modelo como parâmetro a `core/orchestrator.py:run()`.
2. Abas sem scroll horizontal testado com muitos agentes (CSS
   `overflow-x: auto` já previsto, mas por confirmar).
3. `localStorage` pode falhar em modo privado — há fallback para `neo-x1`.

## 8. Próximos passos em aberto

- Passar o modelo do agente ao orquestrador (ver bug #1).
- Guardar `agente_id` na tabela de conversas (SQLite) para filtrar histórico.
- Aba de definições para editar regras/modelos por agente na UI.
- Exportação de storyboard/vídeo para JSON/YAML reutilizável fora da webapp.
