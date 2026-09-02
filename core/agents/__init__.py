"""
Agentes especializados do NEO X1.

Cada agente encapsula regras específicas de domínio, injetadas como
regras_especificas na chamada do orquestrador.

Agentes disponíveis:
  1. Story Creator - Criação de histórias para videomapping
  2. Storyboard Creator - Geração de prompts para imagens (ComfyUI)
  3. Video Creator - Geração de prompts para vídeos (transições)
"""

from core.agents.story_creator import (
    obter_regras_story_creator,
    criar_projeto_videomapping,
)
from core.agents.storyboard_creator import (
    obter_regras_storyboard_creator,
    criar_projeto_storyboard,
)
from core.agents.video_creator import (
    obter_regras_video_creator,
    criar_projeto_video,
)

__all__ = [
    # Story Creator
    "obter_regras_story_creator",
    "criar_projeto_videomapping",
    # Storyboard Creator
    "obter_regras_storyboard_creator",
    "criar_projeto_storyboard",
    # Video Creator
    "obter_regras_video_creator",
    "criar_projeto_video",
]
