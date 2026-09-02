/* DNAI WORKSTATION NEO X1 — lógica da interface (Milestone 3) */
"use strict";

// ---------------------------------------------------------------- estado
const estado = {
  projetos: [],
  projetoAtual: "geral",
  conversas: [],
  conversaAtual: null,
  aEnviar: false,
  agentes: [],
  agenteAtual: "neo-x1",
  autoPipeline: false,
  conversaPorAgente: {},
  ultimaRespostaBrutaPorAgente: {},
  statsTimer: null,
};

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- helpers
async function api(caminho, opcoes = {}) {
  const timeoutMs = Number(opcoes.timeoutMs || 12000);
  const usarTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
  const controller = new AbortController();
  const t = usarTimeout ? setTimeout(() => controller.abort(), timeoutMs) : null;

  const opcoesFetch = { ...opcoes, signal: controller.signal };
  delete opcoesFetch.timeoutMs;

  let resposta;
  try {
    resposta = await fetch(caminho, usarTimeout ? opcoesFetch : opcoes);
  } catch (e) {
    if (e && e.name === "AbortError") {
      throw new Error("tempo limite de ligação ao servidor");
    }
    throw e;
  } finally {
    if (t) clearTimeout(t);
  }

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

function criarMensagemLoading(texto) {
  const div = document.createElement("div");
  div.className = "msg agente msg-loading";
  div.innerHTML =
    '<div class="loading-glow">' + escapar(texto || "A gerar resposta...") + '</div>' +
    '<div class="loading-dots" aria-hidden="true"><span></span><span></span><span></span></div>';
  $("mensagens").appendChild(div);
  $("mensagens").scrollTop = $("mensagens").scrollHeight;
  return div;
}

function atualizarMensagemLoading(div, texto) {
  if (!div) return;
  const t = div.querySelector(".loading-glow");
  if (t) t.textContent = texto || "A gerar resposta...";
}

function _fmtGB(bytes) {
  const gb = Number(bytes || 0) / (1024 ** 3);
  return gb.toFixed(1) + " GB";
}

async function carregarDefinicoesUI() {
  const cfg = await api("/api/settings");
  const sel = $("cfg-perfil-modelo");
  if (!sel) return;
  sel.innerHTML = "";
  for (const p of (cfg.perfis_disponiveis || [])) {
    const op = document.createElement("option");
    op.value = p;
    op.textContent = p;
    if (p === cfg.perfil_modelo_ativo) op.selected = true;
    sel.appendChild(op);
  }
}

async function atualizarStatsUI() {
  const s = await api("/api/system-stats");
  const cpu = s.cpu || {};
  const ram = s.ram || {};
  const gpu = s.gpu || null;

  $("stat-cpu").textContent = (cpu.name || "--") + " | cores: " + (cpu.logical_cores || "--");
  $("stat-cpu-uso").textContent = (cpu.usage_percent ?? "--") + "%";
  $("stat-ram").textContent = _fmtGB(ram.used_bytes) + " / " + _fmtGB(ram.total_bytes) + " (" + (ram.percent ?? "--") + "%)";

  if (gpu) {
    $("stat-gpu").textContent = gpu.name || "GPU NVIDIA";
    $("stat-vram").textContent = (gpu.used_mb ?? "--") + " MB / " + (gpu.total_mb ?? "--") + " MB (" + (gpu.percent ?? "--") + "%)";
  } else {
    $("stat-gpu").textContent = "Nao detetada/indisponivel";
    $("stat-vram").textContent = "--";
  }
  $("stat-ts").textContent = s.timestamp || "--";
}

async function abrirDefinicoes() {
  $("modal-definicoes").classList.remove("oculto");
  await carregarDefinicoesUI();
  await atualizarStatsUI();
  if (estado.statsTimer) clearInterval(estado.statsTimer);
  estado.statsTimer = setInterval(() => {
    atualizarStatsUI().catch(() => {});
  }, 3000);
}

function fecharDefinicoes() {
  $("modal-definicoes").classList.add("oculto");
  if (estado.statsTimer) {
    clearInterval(estado.statsTimer);
    estado.statsTimer = null;
  }
}

async function guardarDefinicoes() {
  const perfil = $("cfg-perfil-modelo").value;
  await api("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ perfil_modelo_ativo: perfil }),
  });
  await carregarAgentes();
  renderizarAbas();
  fecharDefinicoes();
  adicionarMensagem("[Sistema] Perfil de modelo atualizado para: " + perfil, "agente");
}

function limparChat() {
  $("mensagens").innerHTML = "";
}

function mostrarChatVazio() {
  $("mensagens").innerHTML =
    '<div class="vazia" id="chat-vazio"><img src="/assets/neox1-logo.svg" class="vazio-logo" alt=""><p>Escolha ou crie uma conversa para começar.</p></div>';
}

const PREFIX_PIPELINE = "Input vindo do agente anterior (pipeline):\n\n";

function tituloDaConversaAPartirDoTexto(texto) {
  const base = String(texto || "").replace(/\s+/g, " ").trim();
  if (!base) return "Nova conversa";
  return base.slice(0, 52);
}

function acaoParaAgente(agenteId) {
  if (agenteId === "storyboard-creator") return "Cria storyboard para";
  if (agenteId === "video-creator") return "Cria video para";
  if (agenteId === "story-creator") return "Cria historia para";
  return "Continua projeto";
}

function extrairTituloPipeline(textoBruto) {
  const obj = tentarParseJson(textoBruto);
  if (obj && typeof obj.project_title === "string" && obj.project_title.trim()) {
    return obj.project_title.trim();
  }
  const linhas = String(textoBruto || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (linhas.length === 0) return "Projeto";
  return linhas[0].slice(0, 60);
}

function mensagemCurtaPipeline(agenteDestino, textoBruto) {
  const titulo = extrairTituloPipeline(textoBruto);
  return acaoParaAgente(agenteDestino) + " [" + titulo + "]";
}

function formatarMensagemUtilizadorParaUI(texto, agenteId) {
  const bruto = String(texto || "");
  if (!bruto.startsWith(PREFIX_PIPELINE)) return bruto;
  const payload = bruto.slice(PREFIX_PIPELINE.length);
  return mensagemCurtaPipeline(agenteId, payload);
}

function tentarParseJson(texto) {
  const bruto = String(texto || "").trim();
  if (!bruto) return null;
  try {
    return JSON.parse(bruto);
  } catch (_) {
    return null;
  }
}

function resumirStoryCreator(jsonObj) {
  const titulo = jsonObj.project_title || "Historia";
  const tema = ((jsonObj.creative_direction || {}).theme || "").trim();
  const tom = ((jsonObj.creative_direction || {}).tone || "").trim();
  const atos = Array.isArray(jsonObj.acts) ? jsonObj.acts : [];
  const linhas = [];
  linhas.push("Titulo: " + titulo);
  if (tema || tom) linhas.push("Tema/Tom: " + [tema, tom].filter(Boolean).join(" | "));
  linhas.push("");
  for (const ato of atos) {
    const nomeAto = ato.act_title || "Ato";
    linhas.push(nomeAto + ":");
    const cenas = Array.isArray(ato.scenes) ? ato.scenes : [];
    for (const cena of cenas) {
      const sid = cena.scene_id || "Sxx";
      const st = cena.scene_title || "Cena";
      const vd = cena.visual_description || cena.narrative_purpose || "";
      linhas.push("- " + sid + " - " + st);
      if (vd) linhas.push("  " + vd);
    }
    linhas.push("");
  }
  return linhas.join("\n").trim();
}

function formatarRespostaParaUI(agenteId, respostaBruta) {
  if (agenteId !== "story-creator") return String(respostaBruta || "");
  const obj = tentarParseJson(respostaBruta);
  if (!obj || obj.agent !== "story_creator") return String(respostaBruta || "");
  return resumirStoryCreator(obj);
}

// ---------------------------------------------------------------- splash
async function arrancar() {
  let est = null;
  try {
    $("splash-estado").textContent = "A verificar o LM Studio...";
    est = await api("/api/estado", { timeoutMs: 12000 });
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

  const agenteGuardado = localStorage.getItem("agenteAtual");
  estado.autoPipeline = localStorage.getItem("autoPipeline") === "1";

  $("splash-estado").textContent = "A preparar interface...";

  Promise.allSettled([
    carregarProjetos(),
    carregarConversas(),
    carregarAgentes(),
  ]).then(() => {
    if (estado.agentes.length === 0) {
      // Fallback de segurança para desbloquear UI se /api/agentes falhar.
      estado.agentes = [
        { id: "neo-x1", nome: "NEO X1", emoji: "🧠", modelo: (est && est.modelo) || "modelo" },
      ];
      renderizarAbas();
    }

    if (agenteGuardado && estado.agentes.find(a => a.id === agenteGuardado)) {
      estado.agenteAtual = agenteGuardado;
    }

    selecionarAgente(estado.agenteAtual).catch(() => {});
  });

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

// ---------------------------------------------------------------- agentes
async function carregarAgentes() {
  try {
    estado.agentes = await api("/api/agentes");
    renderizarAbas();
  } catch (e) {
    console.error("Erro ao carregar agentes:", e);
  }
}

function renderizarAbas() {
  const container = $("abas-lista");
  container.innerHTML = "";
  for (const agente of estado.agentes) {
    const aba = document.createElement("button");
    aba.className = "aba-agente" + (agente.id === estado.agenteAtual ? " ativa" : "");
    aba.dataset.agenteId = agente.id;
    aba.innerHTML = `
      <span class="aba-emoji">${agente.emoji}</span>
      <span>${agente.nome}</span>
      <span class="aba-modelo">${agente.modelo.split('/').pop().substring(0, 12)}</span>
    `;
    aba.addEventListener("click", () => {
      selecionarAgente(agente.id).catch((e) => console.error(e));
    });
    container.appendChild(aba);
  }
}

async function selecionarAgente(agenteId) {
  const agenteAnterior = estado.agenteAtual;
  if (agenteAnterior && estado.conversaAtual !== null) {
    estado.conversaPorAgente[agenteAnterior] = estado.conversaAtual;
  }

  estado.agenteAtual = agenteId;
  renderizarAbas();

  const agente = estado.agentes.find(a => a.id === agenteId);
  if (agente) {
    $("nome-agente").textContent = agente.nome;
    localStorage.setItem("agenteAtual", agenteId);
  }

  await carregarConversas();

  const conversaGuardada = estado.conversaPorAgente[agenteId];
  const conversaDisponivel = conversaGuardada && estado.conversas.find(c => c.id === conversaGuardada);
  if (conversaDisponivel) {
    await abrirConversa(conversaGuardada, false);
    return;
  }

  if (estado.conversas.length > 0) {
    await abrirConversa(estado.conversas[0].id, false);
  } else {
    estado.conversaAtual = null;
    limparChat();
    mostrarChatVazio();
  }
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
  estado.conversaPorAgente = {};
  limparChat();
  mostrarChatVazio();
  await carregarProjetos();
  await selecionarAgente(estado.agenteAtual);
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
    "/api/conversas?projeto=" + encodeURIComponent(estado.projetoAtual) +
    "&agente=" + encodeURIComponent(estado.agenteAtual)
  );
  const ul = $("lista-conversas");
  ul.innerHTML = "";
  for (const c of estado.conversas) {
    const li = document.createElement("li");
    li.innerHTML =
      "<span class='titulo-conversa'>" + escapar(c.titulo) + "</span>" +
      "<span class='renomear' title='Renomear'>✎</span>" +
      "<span class='apagar' title='Apagar'>✕</span>";
    if (c.id === estado.conversaAtual) li.classList.add("selecionado");
    li.addEventListener("click", (ev) => {
      if (ev.target.classList.contains("renomear")) {
        renomearConversa(c.id, c.titulo);
        return;
      }
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
    body: JSON.stringify({ projeto: estado.projetoAtual, agente: estado.agenteAtual }),
  });
  estado.conversaAtual = c.id;
  estado.conversaPorAgente[estado.agenteAtual] = c.id;
  limparChat();
  mostrarChatVazio();
  await carregarConversas();
  ativarEntrada();
}

async function renomearConversa(id, tituloAtual) {
  const novo = prompt("Novo título da conversa:", tituloAtual || "");
  if (novo === null) return;
  const titulo = novo.trim();
  if (!titulo) {
    alert("O título não pode estar vazio.");
    return;
  }
  await api("/api/conversas/" + id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ titulo }),
  });
  await carregarConversas();
}

async function abrirConversa(id, recarregarLista = true) {
  estado.conversaAtual = id;
  estado.conversaPorAgente[estado.agenteAtual] = id;
  limparChat();
  const historico = await api("/api/conversas/" + id + "/mensagens");
  for (const m of historico) {
    if (m.role === "user") {
      adicionarMensagem(
        formatarMensagemUtilizadorParaUI(m.content, estado.agenteAtual),
        "utilizador"
      );
    }
    else if (m.role === "assistant") {
      estado.ultimaRespostaBrutaPorAgente[estado.agenteAtual] = String(m.content || "");
      adicionarMensagem(
        formatarRespostaParaUI(estado.agenteAtual, m.content),
        "agente"
      );
    }
  }
  if (recarregarLista) await carregarConversas();
  ativarEntrada();
}

async function apagarConversa(id) {
  if (!confirm("Apagar esta conversa?")) return;
  await api("/api/conversas/" + id, { method: "DELETE" });
  if (estado.conversaAtual === id) {
    estado.conversaAtual = null;
    limparChat();
    mostrarChatVazio();
  }
  if (estado.conversaPorAgente[estado.agenteAtual] === id) {
    delete estado.conversaPorAgente[estado.agenteAtual];
  }
  await carregarConversas();
}

function proximoAgentePipeline(agenteId) {
  const ordem = ["story-creator", "storyboard-creator", "video-creator"];
  const idx = ordem.indexOf(agenteId);
  if (idx < 0 || idx >= ordem.length - 1) return null;
  return ordem[idx + 1];
}

async function executarPipelineSequencial(agenteOrigem, textoBase) {
  let agenteAtualPipeline = agenteOrigem;
  let textoAtual = textoBase;

  while (true) {
    const proximo = proximoAgentePipeline(agenteAtualPipeline);
    if (!proximo || !textoAtual) break;

    const meta = estado.agentes.find((a) => a.id === proximo);
    const nomeProximo = (meta && meta.nome) || proximo;

    adicionarMensagem("[Pipeline] A encaminhar resultado para o próximo agente...", "agente");
    await selecionarAgente(proximo);

    if (estado.conversaAtual === null) {
      const c = await api("/api/conversas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projeto: estado.projetoAtual, agente: estado.agenteAtual }),
      });
      estado.conversaAtual = c.id;
      estado.conversaPorAgente[estado.agenteAtual] = c.id;
      await carregarConversas();
    }

    const mensagemPipeline = PREFIX_PIPELINE + textoAtual;
    adicionarMensagem(mensagemCurtaPipeline(proximo, textoAtual), "utilizador");
    const loadingPipeline = criarMensagemLoading("A processar " + nomeProximo + "...");

    let resposta;
    try {
      atualizarMensagemLoading(loadingPipeline, "A carregar modelo e a gerar tokens...");
      resposta = await api("/api/chat", {
        timeoutMs: 600000,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversa_id: estado.conversaAtual,
          mensagem: mensagemPipeline,
          agente: estado.agenteAtual,
        }),
      });
    } catch (e) {
      loadingPipeline.className = "msg erro";
      loadingPipeline.textContent = "ERRO: " + e.message;
      throw e;
    }

    const textoResposta = String(resposta.resposta || "").trim();
    estado.ultimaRespostaBrutaPorAgente[estado.agenteAtual] = textoResposta;
    loadingPipeline.className = "msg agente";
    loadingPipeline.textContent =
      formatarRespostaParaUI(estado.agenteAtual, textoResposta) || "(sem resposta)";
    textoAtual = textoResposta;
    agenteAtualPipeline = proximo;
  }
}

async function obterUltimaRespostaBrutaAtual() {
  const cache = estado.ultimaRespostaBrutaPorAgente[estado.agenteAtual];
  if (cache) return cache;
  if (estado.conversaAtual === null) return "";
  const historico = await api("/api/conversas/" + estado.conversaAtual + "/mensagens");
  for (let i = historico.length - 1; i >= 0; i -= 1) {
    if (historico[i].role === "assistant") {
      return String(historico[i].content || "");
    }
  }
  return "";
}

async function passarAoProximoAgenteManual() {
  const origem = estado.agenteAtual;
  const proximo = proximoAgentePipeline(origem);
  if (!proximo) {
    alert("Este agente não tem próximo passo no pipeline.");
    return;
  }

  const bruto = (await obterUltimaRespostaBrutaAtual()).trim();
  if (!bruto) {
    alert("Não há resposta do agente atual para encaminhar.");
    return;
  }

  adicionarMensagem("[Pipeline] Encaminhamento manual para o próximo agente.", "agente");
  await selecionarAgente(proximo);

  if (estado.conversaAtual === null) {
    const c = await api("/api/conversas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projeto: estado.projetoAtual, agente: estado.agenteAtual }),
    });
    estado.conversaAtual = c.id;
    estado.conversaPorAgente[estado.agenteAtual] = c.id;
    await carregarConversas();
  }

  const mensagemPipeline = PREFIX_PIPELINE + bruto;
  adicionarMensagem(mensagemCurtaPipeline(proximo, bruto), "utilizador");
  const loadingManual = criarMensagemLoading("A preparar resposta do próximo agente...");

  let r;
  try {
    atualizarMensagemLoading(loadingManual, "A carregar modelo e a gerar tokens...");
    r = await api("/api/chat", {
      timeoutMs: 600000,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversa_id: estado.conversaAtual,
        mensagem: mensagemPipeline,
        agente: estado.agenteAtual,
      }),
    });
  } catch (e) {
    loadingManual.className = "msg erro";
    loadingManual.textContent = "ERRO: " + e.message;
    throw e;
  }

  const brutoResposta = String(r.resposta || "");
  estado.ultimaRespostaBrutaPorAgente[estado.agenteAtual] = brutoResposta;
  loadingManual.className = "msg agente";
  loadingManual.textContent = formatarRespostaParaUI(estado.agenteAtual, brutoResposta);
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
        body: JSON.stringify({ projeto: estado.projetoAtual, agente: estado.agenteAtual }),
      });
      estado.conversaAtual = c.id;
      estado.conversaPorAgente[estado.agenteAtual] = c.id;
      const vazio = $("chat-vazio");
      if (vazio) vazio.remove();
      await carregarConversas();

      // Titulo automatico na primeira mensagem da conversa.
      await api("/api/conversas/" + estado.conversaAtual, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: tituloDaConversaAPartirDoTexto(texto) }),
      });
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
  const divAEnviar = criarMensagemLoading("A preparar pedido...");
  try {
    atualizarMensagemLoading(divAEnviar, "A carregar modelo e a gerar tokens...");
    const r = await api("/api/chat", {
      timeoutMs: 600000,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        conversa_id: estado.conversaAtual, 
        mensagem: texto, 
        agente: estado.agenteAtual 
      }),
    });
    const agenteOrigem = estado.agenteAtual;
    const respostaBruta = String(r.resposta || "");
    estado.ultimaRespostaBrutaPorAgente[agenteOrigem] = respostaBruta;
    divAEnviar.className = "msg agente";
    divAEnviar.textContent = formatarRespostaParaUI(agenteOrigem, respostaBruta);
    if (r.agente) {
      const notaAgente = document.createElement("span");
      notaAgente.className = "nota-agente";
      notaAgente.textContent = " (" + r.agente + ")";
      divAEnviar.appendChild(notaAgente);
    }

    if (estado.autoPipeline) {
      const base = respostaBruta.trim();
      if (base) {
        await executarPipelineSequencial(agenteOrigem, base);
      }
    }
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
  $("btn-definicoes").addEventListener("click", () => {
    abrirDefinicoes().catch((e) => alert("Erro: " + e.message));
  });

  $("cfg-fechar").addEventListener("click", fecharDefinicoes);
  $("cfg-guardar").addEventListener("click", () => {
    guardarDefinicoes().catch((e) => alert("Erro ao guardar: " + e.message));
  });

  const chk = $("auto-pipeline");
  if (chk) {
    chk.checked = estado.autoPipeline;
    chk.addEventListener("change", () => {
      estado.autoPipeline = chk.checked;
      localStorage.setItem("autoPipeline", estado.autoPipeline ? "1" : "0");
    });
  }

  const btnPassar = $("btn-passar-proximo");
  if (btnPassar) {
    btnPassar.addEventListener("click", () => {
      passarAoProximoAgenteManual().catch((e) => {
        alert("Erro no pipeline: " + e.message);
      });
    });
  }
}

// ---------------------------------------------------------------- arranque
arrancar();