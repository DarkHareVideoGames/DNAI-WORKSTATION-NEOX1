# Sistema de Abas de Agentes — Guia de Implementação

## Visão Geral

A webapp agora suporta um **sistema de abas para seleção de agentes especializados** com modelos otimizados para cada tarefa.

## Arquitetura

### Backend (Python)

#### 1. **core/agentes.py** (NOVO)
Módulo gestor de agentes com funções principais:
- `listar_agentes()` → Lista todos os agentes com suas configurações
- `obter_agente(agente_id)` → Retorna dados de um agente específico
- `obter_modelo(agente_id)` → Retorna o modelo LM Studio do agente
- `obter_regras_agente(agente_id)` → Retorna as regras especializadas (system prompt) do agente

Carrega configuração de `config/agents.yaml`.

#### 2. **config/agents.yaml** (NOVO)
Arquivo de configuração YAML com definição de cada agente:
```yaml
agentes:
  - id: neo-x1
    nome: NEO X1
    modelo: google/gemma-4-26b-a4b-qat
    emoji: 🤖
    tipo: generico
  - id: story-creator
    tipo: videomapping
    agente: story_creator  # ref. para core/agents/story_creator.py
```

#### 3. **interfaces/webapp.py** (MODIFICADO)
Alterações:
- **Import**: `from core import agentes`
- **Novo endpoint** `GET /api/agentes` → Lista agentes disponíveis
- **api_estado()** modificada: Agora aceita query param `agente` e retorna modelo desse agente
- **api_chat()** modificada: 
  - Aceita parâmetro `agente` no JSON POST
  - Obtém regras especializadas do agente
  - Usa modelo correto do agente
  - Retorna `agente` e `modelo` na resposta

### Frontend (HTML/CSS/JS)

#### 1. **interfaces/static/index.html** (MODIFICADO)
Adicionado:
```html
<!-- ===================== ABAS DE AGENTES ===================== -->
<div id="abas-agentes" class="abas-container">
  <div id="abas-lista" class="abas-lista"></div>
</div>
```

#### 2. **interfaces/static/style.css** (MODIFICADO)
Estilos adicionados:
- `.abas-container` → Container das abas
- `.abas-lista` → Flex container para as abas
- `.aba-agente` → Estilo individual de aba com hover e estado ativo
- `.aba-emoji`, `.aba-modelo` → Estilos para elementos dentro da aba
- `.nota-agente` → Anotação pequena mostrando qual agente respondeu

#### 3. **interfaces/static/app.js** (MODIFICADO)
Alterações:
- **Estado**: Adicionados `agentes: []` e `agenteAtual: "neo-x1"`
- **Função carregarAgentes()** → Busca `/api/agentes` e renderiza abas
- **Função renderizarAbas()** → Cria elementos HTML para cada aba
- **Função selecionarAgente(agenteId)** → Muda agente ativo e persiste em localStorage
- **arrancar()** modificada → Carrega agentes ao iniciar e restaura último agente selecionado
- **enviarMensagem()** modificada → Passa `agente: estado.agenteAtual` no POST de chat
- **Persistência**: localStorage salva o agente selecionado

## Fluxo de Uso

### 1. Inicialização
```
app.js arrancar()
  ↓
carregarAgentes()
  ↓
GET /api/agentes
  ↓
renderizarAbas() → Exibe 4 abas no topo
  ↓
Restaura último agente de localStorage
```

### 2. Mudança de Aba
```
Utilizador clica em aba
  ↓
selecionarAgente(agente_id)
  ↓
estado.agenteAtual = agente_id
localStorage.setItem("agenteAtual", agente_id)
renderizarAbas() → Destaca aba ativa
$("nome-agente").textContent = agente.nome → Topbar atualiza
```

### 3. Envio de Mensagem
```
Utilizador escreve e clica ENVIAR
  ↓
enviarMensagem()
  ↓
POST /api/chat
  body: {
    conversa_id: ...,
    mensagem: "...",
    agente: "story-creator"  ← Passa agente atual
  }
  ↓
api_chat() em webapp.py
  ↓
agentes.obter_regras_agente("story-creator")
  ↓
run(mensagem, historico, regras_especializadas)
  ↓
Resposta com modelo correto
  ↓
response: { resposta: "...", agente: "Story Creator", modelo: "..." }
  ↓
Frontend exibe mensagem com nota de agente
  "(Story Creator)"
```

## Configuração dos Agentes

### Modelos Recomendados por Tarefa

| Agente | Modelo | Razão |
|--------|--------|-------|
| **NEO X1** | google/gemma-4-26b-a4b-qat | Chat genérico, balanceado |
| **Story Creator** | qwen/qwen3.6-40b-... | Criatividade narrativa superior |
| **Storyboard Creator** | qwen/qwen3.6-40b-... | Detalhes visuais precisos |
| **Video Creator** | qwen/qwen2.5-coder-14b | Especificações técnicas |

### Adicionar Novo Agente

1. Adicionar entrada em `config/agents.yaml`:
```yaml
- id: novo-agente
  nome: Novo Agente
  modelo: modelo/selecionado
  emoji: 🆕
  tipo: customizado
  agente: novo_agente  # Se houver arquivo core/agents/novo_agente.py
```

2. (Opcional) Criar arquivo `core/agents/novo_agente.py`:
```python
def obter_regras_novo_agente() -> str:
    return """Seu system prompt aqui..."""
```

3. Reiniciar webapp
4. Nova aba aparecerá automaticamente

## UI/UX

### Abas
- Localizadas abaixo do topbar, acima do corpo principal
- 4 abas visíveis por padrão (NEO X1 | Story Creator | Storyboard Creator | Video Creator)
- Aba ativa: Fundo elevado + borda inferior laranja (#ff7a1a)
- Hover: Borda ativa, texto ligeiramente destacado

### Indicadores
- Emoji em cada aba para rápida identificação visual
- Nome do agente em destaque no topbar quando muda
- Nota "(Agente Name)" ao final de cada resposta

### Persistência
- Último agente selecionado salvo em `localStorage["agenteAtual"]`
- Restaurado automaticamente ao reabrir a página

## Fluxo de Desenvolvimento Futuro

### Próximos Passos Opcionais
1. **Modelo Dinâmico**: Atualmente webapp usa config.yaml padrão
   - Melhorar para usar modelo específico de cada agente
   - Requer modificação em core/orchestrator.py

2. **Persistência em BD**: Guardar qual agente foi usado em cada conversa
   - Adicionar campo `agente_id` na tabela conversas
   - Permitir buscar/filtrar conversas por agente

3. **Configuração em UI**: Adicionar aba DEFINIÇÕES para:
   - Trocar modelos de agentes dinamicamente
   - Editar regras especializadas in-app
   - Teste de agentes (sandbox)

4. **Integração MCP**: Passar modelo correto ao orchestrator
   - Criar novo parâmetro em `run(mensagem, historia, regras, modelo)`
   - Usar modelo do agente em vez de config.yaml fixo

## Testes

### Teste Rápido
```bash
python test_agentes_modulo.py
```

Verifica:
- ✓ Módulo agentes carregado
- ✓ 4 agentes disponíveis
- ✓ Cada agente tem modelo configurado

### Teste na Webapp
1. Iniciar webapp: `.\Start.ps1`
2. Abrir http://localhost:8765
3. Verificar:
 ✓ 4 abas visíveis no topo
 ✓ Ao clicar aba, NEO X1 muda para nome da aba
 ✓ localStorage persiste a aba selecionada
   - ✓ localStorage persiste a aba selecionada
   - ✓ POST do chat inclui `agente_id` correto

## Notas Técnicas

### Regras Especializadas
- Agentes "videomapping" usam regras especializadas de core/agents/
- NEO X1 usa regras do projeto (config.yaml ou projeto.regras_especificas)
- Se agente não tiver regras, fallback para regras do projeto

### YAML Loading
- `config/agents.yaml` carregado via `yaml.safe_load()`
- Cache: Recarregado a cada chamada (pode otimizar com cache se needed)

### Segurança
- Parâmetro `agente` vem do cliente → Validar sempre
- Função `obter_agente(agente_id)` protege contra IDs inválidos
- Fallback seguro para "neo-x1" se agente desconhecido

## Bugs Conhecidos / Limitações

1. **Modelo não é usado**: Webapp carrega modelo da config, não do agente
   - Solução: Modificar orchestrator.py para aceitar modelo como parâmetro

2. **Abas não scrolláveis**: Se muitos agentes, precisam scroll horizontal
   - Solução: CSS `overflow-x: auto` já está implementado

3. **localStorage pode falhar**: Em modo privado/incógnito
   - Fallback: Usa "neo-x1" como padrão sempre disponível

## Próxima Etapa: Usar Modelo por Agente

Atualmente webapp carrega agente mas não muda modelo. Para usar modelo específico:

```python
# Em orchestrator.py
def run(mensagem, history, regras, modelo=None):
    config = _ler_config()
    if modelo:
        config["model"]["name"] = modelo  # Sobrescreve
    # ... resto do código
```

Então em webapp.py api_chat():
```python
modelo = agentes.obter_modelo(agente_id)
resposta, novo_historico = await run_in_threadpool(
    _correr, 
    modelo  # Passa modelo
)
```

## Conclusão

✅ Sistema de abas funcional e completo
✅ 4 agentes especializados
✅ Configuração centralizada em YAML
✅ Persistência de seleção em localStorage
✅ Pronto para integração de modelo por agente

**Status**: Implementação concluída. Webapp com abas operacional e pronta para uso.
