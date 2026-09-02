# 🎬 Videomapping Agents System - Guia Completo

## Visão Geral

O sistema de agentes de videomapping oferece uma solução completa e modular para criar histórias, storyboards e vídeos para projeções dinâmicas em edifícios.

### 3 Agentes Especializados

```
┌─────────────────────────────────────────────────────────┐
│ 1️⃣  STORY CREATOR                                       │
│     Criador de Histórias para Videomapping             │
│     • Investigar temas e conceitos                      │
│     • Gerar narrativas visuais                          │
│     • Estruturar em atos/cenas                          │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 2️⃣  STORYBOARD CREATOR                                 │
│     Gerador de Prompts para ComfyUI (Imagens)         │
│     • Quebrar história em cenas                        │
│     • Criar prompts visuais detalhados                 │
│     • Definir paleta de cores e estilos                │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 3️⃣  VIDEO CREATOR                                      │
│     Gerador de Prompts de Vídeo (Transições)          │
│     • Criar transições entre cenas                     │
│     • Especificar first/last frame                     │
│     • Gerar efeitos visuais dinâmicos                  │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Começar a Usar

### Instalação e Setup

Todos os agentes já estão instalados em `core/agents/`:
- `story_creator.py` - Agente criador de histórias
- `storyboard_creator.py` - Agente de storyboards
- `video_creator.py` - Agente de vídeos

### Teste Rápido dos Agentes

```bash
# Ver resumo de todos os agentes
python test_agents_overview.py

# Testar Story Creator
python test_story_quick.py

# Usar Story Creator interativo
python test_story_creator.py
```

---

## 📖 1. Story Creator - Criador de Histórias

### O que Faz

O Story Creator é especialista em:
- 🎯 **Investigação de temas** - Expande ideias iniciais com perguntas
- 📖 **Geração de histórias** - Cria narrativas para videomapping
- 🏢 **Contexto visual** - Pensa em projeção em edifícios
- 🎬 **Estruturação** - Divide em atos e cenas

### Fluxo de Interação

```
1. Utilizador menciona temas (ex: "Renovação urbana e esperança")
   ↓
2. Story Creator faz 2-3 perguntas de contexto
   • Período histórico/futurista?
   • Emoção central?
   • Há personagens?
   • Mensagem final?
   ↓
3. Utilizador responde com detalhes
   ↓
4. Story Creator gera HISTÓRIA COMPLETA
   • Sinopse
   • Ato I, II, III
   • Epílogo
   • Cenas numeradas e descritas
   ↓
5. Pergunta se quer gerar storyboard
```

### Exemplo de Uso

```python
from core.orchestrator import run
from core.agents.story_creator import obter_regras_story_creator

regras = obter_regras_story_creator()

# Turno 1
msg1 = "Preciso de uma história sobre renovação urbana e esperança"
resposta1, hist1 = run(msg1, [], regras)

# Turno 2
msg2 = "Período futurista, emoção = transformação positiva. Personagem principal é rapariga jovem"
resposta2, hist2 = run(msg2, hist1, regras)

# Story Creator gera a história completa
```

### Output Esperado

O Story Creator fornece:
- Título e sinopse
- Estrutura em 3-5 atos
- Descrição visual de cada cena
- Cores dominantes
- Movimentos principais
- Duração total

---

## 🎨 2. Storyboard Creator - Gerador de Prompts Visuais

### O que Faz

O Storyboard Creator é especialista em:
- 📸 **Análise de história** - Identifica cenas principais
- 🎨 **Geração de prompts** - Cria instruções para ComfyUI
- 🌈 **Qualidade visual** - Garante prompts com máximo detalhe
- 🔄 **Estruturação** - Organiza storyboard com timing

### Formato dos Prompts

Cada cena recebe um prompt estruturado:

```
[CENA X: Título]
Duração: XXs

PROMPT PRINCIPAL:
"Descrição visual extremamente detalhada...
[Estilo], [Cores], [Iluminação], [Composição], [Emoção]"

ESPECIFICAÇÕES:
• Resolução: 1920x1080 landscape
• Aspecto: 16:9
• Estilo: [digital art, 3D render, abstract]
• Paleta: [cores específicas]
• Lighting: [tipo de iluminação]

REFERÊNCIAS:
[Inspirações visuais, artistas, filmes]
```

### Exemplo de Prompt

```
[CENA 1: Despertar]
Duração: 5 segundos

PROMPT:
"Abstract geometric visualization of awakening.
A single point of brilliant cyan neon light emerges
from complete darkness, expanding in smooth spiral
motion. Volumetric fog surrounds the light, creating
depth. Sharp angular geometric structures rise like
buildings in the background. Cinematic 4K quality,
16:9 aspect ratio, modern digital art style,
hyper-detailed. Negative: people, text, realism."

Paleta: Preto → Azul → Ciano
Lighting: Neon glow com rim light
Movimento: Expansão radial do ponto central
```

### Boas Práticas

✓ Ser muito específico (não vago)
✓ Usar palavras-chave reconhecidas por IA
✓ Estruturar em camadas (objeto, cenário, efeitos)
✓ Incluir negações ("Sem pessoas", "Sem texto")
✓ Referenciar estilos artísticos
✓ Descrever lighting e atmosfera

---

## 🎬 3. Video Creator - Gerador de Prompts de Transições

### O que Faz

O Video Creator é especialista em:
- 📹 **Transições entre cenas** - Cria movimento fluido
- 🔄 **First/Last frames** - Define início e fim de cada vídeo
- 💫 **Efeitos dinâmicos** - Gera prompts com movimento
- ⏱️ **Timing** - Especifica durações e velocidades

### Tipos de Transições

| Tipo | Descrição | Uso |
|------|-----------|-----|
| **Dissolve** | Fade suave entre cenas | Transições calmas |
| **Wipe** | Varrer/limpar a imagem | Movimento direcional |
| **Zoom** | Aproximar/afastar | Mudança de perspectiva |
| **Morph** | Transformação geométrica | Metamorfose visual |
| **Particle** | Desintegração/reconstituição | Efeito dramático |
| **Glitch** | Efeito digital/VHS | Estilo futurista |

### Formato do Prompt de Vídeo

```
[TRANSIÇÃO 1: Cena A → Cena B]

Duração total: 4 segundos
├─ Primeira cena: 1s
├─ Efeito de transição: 2s
└─ Segunda cena: 1s

FIRST FRAME:
"Descrição da imagem de início..."

TRANSIÇÃO:
"Descrição do movimento/efeito..."

LAST FRAME:
"Descrição da imagem de fim..."

MOVIMENTO: [tipo de câmara/objeto]
EFEITOS: [partículas, distorções, glow]
SINCRONIZAÇÃO: [com áudio ou timing]
```

### Exemplo de Transição

```
[TRANSIÇÃO 1: Darkness → Awakening]
Duração: 4 segundos

FIRST FRAME:
"Solid black background, complete darkness,
slightly grainy texture, 4K quality"

TRANSIÇÃO:
"Center point expands outward in smooth growing circle,
neon cyan color, volumetric glow increasing,
dissolving the black. Smooth ease-out acceleration."

LAST FRAME:
"Same as CENA 2: spiral of cyan light,
expanding geometric patterns, fully illuminated"

MOVIMENTO: Radial expansion from center
EFEITOS: Volumetric glow, soft halo
DURAÇÃO: 3 segundos
```

---

## 🔄 Fluxo Completo de Trabalho

### Passo 1: Criar História

```bash
python test_story_creator.py
```

**Entrada do utilizador:**
1. Temas (ex: "Renovação urbana, esperança")
2. Contexto (período, emoção, personagens, mensagem)

**Output:**
- História estruturada
- Cenas numeradas
- Descrições visuais

### Passo 2: Gerar Storyboard

Com a história em mão, copie-a e passe para o Storyboard Creator:

```python
from core.orchestrator import run
from core.agents.storyboard_creator import obter_regras_storyboard_creator

regras = obter_regras_storyboard_creator()
resposta, hist = run("Aqui está a minha história: [COLE A HISTÓRIA]", [], regras)
```

**Output:**
- Prompts detalhados para cada cena
- Especificações técnicas (resolução, cores)
- Referências visuais
- Timing de cada cena

### Passo 3: Gerar Vídeos de Transição

Com o storyboard pronto, passe para o Video Creator:

```python
from core.orchestrator import run
from core.agents.video_creator import obter_regras_video_creator

regras = obter_regras_video_creator()
resposta, hist = run("Aqui está meu storyboard: [COLE O STORYBOARD]", [], regras)
```

**Output:**
- Prompts de vídeo para cada transição
- First/Last frames especificados
- Tipos de efeitos
- Timings de transição

---

## 💾 Salvar Resultados

Após cada fase, copie o output para ficheiros:

```bash
# Guardar história
history.txt

# Guardar storyboard
storyboard.md

# Guardar prompts de vídeo
video_prompts.txt

# Guardar em ComfyUI
comfyui_workflow.json
```

---

## 🔧 Integração com ComfyUI

### Imagens (de Storyboard Creator)

1. Copie cada **PROMPT** para ComfyUI
2. Ajuste **resolução** (ex: 1920x1080)
3. Escolha **modelo** de IA (SDXL, Flux, etc)
4. Gere a imagem
5. Salve como `cena_01.png`, `cena_02.png`, etc

### Vídeos (de Video Creator)

1. Use **Video to Video** workflow do ComfyUI
2. Defina **FIRST FRAME** (imagem inicial)
3. Defina **LAST FRAME** (imagem final)
4. Especifique o **TIPO DE TRANSIÇÃO**
5. Defina **duração** em frames
6. Gere o vídeo
7. Exporte como `.mp4`

---

## 📱 Interface Web (Futura)

Planeado para integração na webapp:

```
┌─────────────────────────────────────────┐
│ DNAI WORKSTATION NEO X1                 │
├─────────────────────────────────────────┤
│ [ NEO X1 ] [ Criar História ]          │
│            [ Criar Storyboard ]         │
│            [ Criar Vídeos ]             │
├─────────────────────────────────────────┤
│                                         │
│ [Chat area com Story Creator]           │
│                                         │
│ "Que temas abordamos hoje?"             │
│                                         │
│ [Input area]                            │
│                                         │
└─────────────────────────────────────────┘
```

---

## 🎯 Resumo

| Agente | Entrada | Output | Ferramenta Destino |
|--------|---------|--------|-------------------|
| **Story Creator** | Temas + Contexto | História + Cenas | Storyboard Creator |
| **Storyboard Creator** | História | Prompts de Imagens | ComfyUI (img2img) |
| **Video Creator** | Storyboard | Prompts de Vídeos | ComfyUI (vid2vid) |

---

## 📚 Recursos Adicionais

- Documentação de ComfyUI: https://comfyui.com
- Estilos de prompt de IA: Civitai, Prompts DB
- Inspiração de videomapping: YouTube, Instagram #videomapping

---

**Sistema desenvolvido para criar histórias visuais dinâmicas! 🎬✨**
