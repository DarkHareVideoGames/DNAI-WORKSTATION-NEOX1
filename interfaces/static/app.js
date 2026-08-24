/* DNAI WORKSTATION NEO X1 — lógica da interface (Milestone 3) */
"use strict";

// ---------------------------------------------------------------- estado
const estado = {
  projetos: [],
  projetoAtual: "geral",
  conversas: [],
  conversaAtual: null,
  aEnviar: false,
};

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- helpers
async function api(caminho, opcoes) {
  const resposta = await fetch(caminho, opcoes);
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || resposta.statusText);
  return dados;
}

function escapar(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

function adicionarMensagem(texto, classe) {
  const div = document.createElement("div");
  div.className = "msg " + classe;
  div.innerHTML = escapar(texto);
  $("mensagens").appendChild(div);
  $("mensagens").scrollTop = $("mensagens").scrollHeight;
}

function limparChat() {
  $("mensagens").innerHTML = "";
}

// ---------------------------------------------------------------- splash
async function arrancar() {
  try {
    $("splash-estado").textContent = "A verificar o LM Studio...";
    const est = await api("/api/estado");
    $("nome-agente").textContent = est.agente_nome || "NEO X1";
    // Rótulos editáveis em config.yaml (interface.rotulos)
    const rotulos = est.rotulos || {};
    if (rotulos.servidor) $("rotulo-servidor").textContent = rotulos.servidor;
    if (rotulos.agente) $("rotulo-agente").textContent = rotulos.agente;
    atualizarEstadoLM(est.lm_studio_ativo);
    $("splash-estado").textContent = est.lm_studio_ativo
      ? "LM Studio ativo. A preparar a interface..."
      : "LM Studio inativo — a interface funciona, mas o chat precisa do LM Studio.";
  } catch (e) {
    $("splash-estado").textContent = "Aviso: " + e.message;
    atualizarEstadoLM(false);
  }
  await carregarProjetos();
  await carregarConversas();
  // Deixa o splash visível um instante para a animação ser apreciada.
  setTimeout(() => {
    $("splash").classList.add("sair");
    setTimeout(() => $("splash").remove(), 700);
    $("app").classList.remove("oculto");
    ligarEventos();
    ligarTerminal();
    // O utilizador pode escrever de imediato: a conversa é criada
    // automaticamente ao enviar a primeira mensagem.
    ativarEntrada();
  }, 1200);
}

function atualizarEstadoLM(ativo) {
  const ponto = $("ponto-lmstudio");
  ponto.className = "ponto " + (ativo ? "verde" : "vermelho");
}

// ---------------------------------------------------------------- projetos
async function carregarProjetos() {
  estado.projetos = await api("/api/projetos");
  const ul = $("lista-projetos");
  ul.innerHTML = "";
  const itens = [{ slug: "geral", nome: "geral" }, ...estado.projetos];
  for (const p of itens) {
    const li = document.createElement("li");
    li.textContent = p.nome;
    li.dataset.slug = p.slug;
    if (p.slug === estado.projetoAtual) li.classList.add("selecionado");
    li.addEventListener("click", () => selecionarProjeto(p.slug));
    ul.appendChild(li);
  }
}

async function selecionarProjeto(slug) {
  estado.projetoAtual = slug;
  estado.conversaAtual = null;
  limparChat();
  $("mensagens").innerHTML =
    '<div class="vazia"><img src="/assets/neox1-logo.svg" class="vazio-logo" alt=""><p>Escolha ou crie uma conversa para começar.</p></div>';
  const projeto = estado.projetos.find((p) => p.slug === slug);
  $("nome-agente").textContent =
    (projeto && projeto.agente_nome) || "NEO X1";
  await carregarProjetos();
  await carregarConversas();
  ativarEntrada();
}

async function criarProjeto() {
  const nome = $("proj-nome").value.trim();
  if (!nome) return alert("O nome do projeto é obrigatório.");
  try {
    await api("/api/projetos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: nome,
        descricao: $("proj-descricao").value,
        agente_nome: $("proj-agente").value.trim() || null,
        regras_especificas: $("proj-regras").value,
      }),
    });
    fecharModalProjeto();
    await selecionarProjeto(
      nome.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-")
    );
  } catch (e) {
    alert("Erro ao criar projeto: " + e.message);
  }
}

function fecharModalProjeto() {
  $("modal-projeto").classList.add("oculto");
  $("proj-nome").value = "";
  $("proj-descricao").value = "";
  $("proj-agente").value = "";
  $("proj-regras").value = "";
}

// ---------------------------------------------------------------- conversas
async function carregarConversas() {
  estado.conversas = await api(
    "/api/conversas?projeto=" + encodeURIComponent(estado.projetoAtual)
  );
  const ul = $("lista-conversas");
  ul.innerHTML = "";
  for (const c of estado.conversas) {
    const li = document.createElement("li");
    li.innerHTML =
      "<span>" + escapar(c.titulo) + "</span><span class='apagar' title='Apagar'>✕</span>";
    if (c.id === estado.conversaAtual) li.classList.add("selecionado");
    li.addEventListener("click", (ev) => {
      if (ev.target.classList.contains("apagar")) {
        apagarConversa(c.id);
      } else {
        abrirConversa(c.id);
      }
    });
    ul.appendChild(li);
  }
}

async function novaConversa() {
  const c = await api("/api/conversas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projeto: estado.projetoAtual }),
  });
  estado.conversaAtual = c.id;
  limparChat();
  await carregarConversas();
  ativarEntrada();
}

async function abrirConversa(id) {
  estado.conversaAtual = id;
  limparChat();
  const historico = await api("/api/conversas/" + id + "/mensagens");
  for (const m of historico) {
    if (m.role === "user") adicionarMensagem(m.content, "utilizador");
    else if (m.role === "assistant") adicionarMensagem(m.content, "agente");
  }
  await carregarConversas();
  ativarEntrada();
}

async function apagarConversa(id) {
  if (!confirm("Apagar esta conversa?")) return;
  await api("/api/conversas/" + id, { method: "DELETE" });
  if (estado.conversaAtual === id) {
    estado.conversaAtual = null;
    limparChat();
    desativarEntrada();
  }
  await carregarConversas();
}

function ativarEntrada() {
  $("entrada").disabled = false;
  $("btn-enviar").disabled = false;
  $("entrada").focus();
}

function desativarEntrada() {
  $("entrada").disabled = true;
  $("btn-enviar").disabled = true;
}

// ---------------------------------------------------------------- chat
async function enviarMensagem(ev) {
  ev.preventDefault();
  const texto = $("entrada").value.trim();
  if (!texto || estado.aEnviar) return;
  estado.aEnviar = true;
  // Sem conversa ativa? Cria uma automaticamente (estilo ChatGPT/Claude).
  if (estado.conversaAtual === null) {
    try {
      const c = await api("/api/conversas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projeto: estado.projetoAtual }),
      });
      estado.conversaAtual = c.id;
      const vazio = $("chat-vazio");
      if (vazio) vazio.remove();
      await carregarConversas();
    } catch (e) {
      estado.aEnviar = false;
      adicionarMensagem("ERRO ao criar conversa: " + e.message, "erro");
      return;
    }
  }
  $("btn-enviar").disabled = true;
  $("entrada").value = "";
  adicionarMensagem(texto, "utilizador");
  const divAEnviar = document.createElement("div");
  divAEnviar.className = "msg agente";
  divAEnviar.textContent = "...";
  $("mensagens").appendChild(divAEnviar);
  $("mensagens").scrollTop = $("mensagens").scrollHeight;
  try {
    const r = await api("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversa_id: estado.conversaAtual, mensagem: texto }),
    });
    divAEnviar.textContent = r.resposta;
  } catch (e) {
    divAEnviar.className = "msg erro";
    divAEnviar.textContent = "ERRO: " + e.message;
  }
  $("mensagens").scrollTop = $("mensagens").scrollHeight;
  estado.aEnviar = false;
  $("btn-enviar").disabled = false;
  $("entrada").focus();
}

// ---------------------------------------------------------------- terminal
function ligarTerminal() {
  const fonte = new EventSource("/api/logs");
  fonte.onmessage = (ev) => {
    const linha = JSON.parse(ev.data);
    const saida = $("terminal-saida");
    saida.textContent += linha + "\n";
    saida.scrollTop = saida.scrollHeight;
  };
}

// ---------------------------------------------------------------- ficheiros
async function atualizarFicheiros() {
  const ficheiros = await api(
    "/api/ficheiros?projeto=" + encodeURIComponent(estado.projetoAtual)
  );
  const div = $("lista-ficheiros");
  div.innerHTML = ficheiros.length
    ? ficheiros.map((f) => "<div>" + escapar(f.nome) + "</div>").join("")
    : "Sem ficheiros.";
}

async function carregarFicheiro(ev) {
  const ficheiro = ev.target.files[0];
  if (!ficheiro) return;
  const fd = new FormData();
  fd.append("projeto", estado.projetoAtual);
  fd.append("ficheiro", ficheiro);
  try {
    await api("/api/upload", { method: "POST", body: fd });
    await atualizarFicheiros();
  } catch (e) {
    alert("Erro no upload: " + e.message);
  }
  ev.target.value = "";
}

// ---------------------------------------------------------------- eventos
function ligarEventos() {
  $("form-chat").addEventListener("submit", enviarMensagem);
  $("btn-nova-conversa").addEventListener("click", novaConversa);
  $("btn-novo-projeto").addEventListener("click", () =>
    $("modal-projeto").classList.remove("oculto")
  );
  $("proj-cancelar").addEventListener("click", fecharModalProjeto);
  $("proj-criar").addEventListener("click", criarProjeto);
  $("btn-terminal").addEventListener("click", () => {
    $("terminal").classList.toggle("oculto");
    $("btn-terminal").classList.toggle("ativo");
  });
  $("btn-abrir-pasta").addEventListener("click", () =>
    api("/api/abrir-pasta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projeto: estado.projetoAtual }),
    }).catch((e) => alert("Erro: " + e.message))
  );
  $("btn-ficheiros").addEventListener("click", async () => {
    $("menu-ficheiros").classList.toggle("oculto");
    if (!$("menu-ficheiros").classList.contains("oculto")) await atualizarFicheiros();
  });
  $("input-upload").addEventListener("change", carregarFicheiro);
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".dropdown")) $("menu-ficheiros").classList.add("oculto");
  });
  $("btn-definicoes").addEventListener("click", () =>
    alert("Definições: disponíveis num milestone futuro.")
  );
}

// ---------------------------------------------------------------- arranque
arrancar();