# test_smoke.py, na raiz do projeto
from core.orchestrator import run
 
resposta, historico = run("qual foi o último commit deste repositório?")
print(resposta)