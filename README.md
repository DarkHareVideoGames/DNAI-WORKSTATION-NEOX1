# DNAI WORKSTATION NEO X1

## Resumo
Orquestrador de IA local utilizando loop LLM (planear → escolher ferramenta MCP → chamar → verificar → repetir).

## Estrutura do Projeto
- `.clinerules/`
  - `clinerules.md`: Diretrizes e regras para o projeto.
- `config/`
  - `config.yaml`: Configurações principais do projeto.
  - `Modelfile`: Definições de modelos.
- `core/`
  - `orchestrator.py`: Módulo principal de orquestração.
- `interfaces/`
  - `cli_chat.py`: Interface de chat CLI.
- `assets/`
  - `neox1-logo.png`: Logotipo.
  - `neox1-logo.svg`: Logotipo.
- `run.bat`: Script de execução.
- `test_smoke.py`: Testes de integração.
## Resumo
Orquestrador de IA local utilizando loop LLM (planear → escolher ferramenta MCP → chamar → verificar → repetir).

## Resumo
Orquestrador de IA local utilizando loop LLM (planear → escolher ferramenta MCP → chamar → verificar → repetir).

## Funcionalidade
O projeto inclui um interface de chat CLI (`interfaces/cli_chat.py`) que permite interagir com a IA local. O utilizador pode enviar mensagens que são processadas pelo módulo `core/orchestrator.py` e a IA responde.

## Requisitos
- Python 3.11+
- Tipagem explícita
- Dependências mínimas

## Instruções de Uso
1. Clone o repositório:
   ```bash
   git clone https://github.com/DarkHareVideoGames/DNAI-WORKSTATION-NEOX1.git
   ```

2. Navegue até o diretório do projeto:
   ```bash
   cd DNAI-WORKSTATION-NEOX1
   ```

3. Crie um ambiente virtual e ative-o:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   ```

4. Instale as dependências:
   ```bash
   pip install -r requirements.txt
   ```

5. Execute o projeto:
   ```bash
   python run.bat
   ```

## Contribuições
Contribuições são bem-vindas. Por favor, forneça pull requests para adicionar novas funcionalidades, corrigir bugs ou melhorar a documentação.

## Licença
Este projeto está licenciado sob a Licença MIT.
## Requisitos
- Python 3.11+
- Tipagem explícita
- Dependências mínimas

## Instruções de Uso
1. Clone o repositório:
   ```bash
   git clone https://github.com/DarkHareVideoGames/DNAI-WORKSTATION-NEOX1.git
