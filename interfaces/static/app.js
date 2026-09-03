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
  ultimasFrases: {},
  referenciaFachadaAtual: null,
  comfyRenderAtivo: false,
  storyboardResultados: {},
  storyboardSelecionados: {},
  storyboardCards: {},
  storyboardUltimoJson: null,
  statsTimer: null,
};

const $ = (id) => document.getElementById(id);

const MESSAGE_TEMPLATES = {
  "neo-x1": {
    welcome: {
      a: ["Estou pronto", "Estou disponivel", "Estou aqui", "Estou operacional", "Ja estou contigo"],
      b: ["para ajudar-te", "para tratar disto", "para resolver isso", "para avancar contigo", "para executar o teu pedido"],
      c: ["ja.", "agora.", "com clareza.", "sem ruido.", "de forma objetiva."],
    },
    success: {
      a: ["Conclui", "Fechei", "Terminei", "Entreguei", "Resolvi"],
      b: ["o pedido", "a tarefa", "esta etapa", "o que pediste", "o bloco atual"],
      c: [".", ". Podes validar.", ". Seguimos.", ". Proximo passo.", ". Sem falhas."],
    },
    thinking: {
      a: ["Estou a analisar", "Estou a processar", "Estou a validar", "Estou a estruturar", "Estou a preparar"],
      b: ["o teu pedido", "o contexto", "os requisitos", "esta resposta", "os dados"],
      c: ["agora.", "com rigor.", "sem adivinhar.", "com foco.", "e ja volto."],
    },
    error: {
      a: ["Falhei", "Bati num erro", "Nao consegui concluir", "Interrompi a execucao", "Perdi esta ronda"],
      b: ["nesta etapa", "neste pedido", "na chamada ao servico", "durante o processamento", "nesta operacao"],
      c: [".", ". Tenta outra vez.", ". Corrige e envio de novo.", ". Preciso de novo input.", ". Vamos repetir."],
    },
  },
  "story-creator": {
    welcome: {
      a: ["Estou no set", "Sou o realizador desta ronda", "Ja estou em modo camera", "Estou pronto para rodar", "Estou sentado na cadeira de realizador"],
      b: ["diz-me", "entrega-me", "manda-me", "alinha comigo", "fecha comigo"],
      c: ["o tema em uma linha.", "o conflito principal.", "o briefing sem floreados.", "a ideia central.", "a tua visao narrativa."],
    },
    success: {
      a: ["Cortei", "Fechei a cena", "Aprovei a narrativa", "Montei isto", "Tranquei o guiao"],
      b: ["com ritmo", "com impacto", "com tensao", "sem gordura", "com pulso"],
      c: [".", ". Proxima cena.", ". Isto aguenta publico.", ". Segue para storyboard.", ". Nao toques."],
    },
    thinking: {
      a: ["Estou a montar", "Estou a decupar", "Estou a afinar", "Estou a ensaiar", "Estou a bloquear"],
      b: ["o arco", "as cenas", "o ritmo", "o conflito", "a progressao"],
      c: ["sem pieguice.", "com pulso.", "para prender o publico.", "sem cenas mortas.", "com intencao."],
    },
    error: {
      a: ["Perdi a toma", "Quebrei o tom", "Saimos do guiao", "Falhei a cena", "Parti a continuidade"],
      b: ["neste bloco", "neste ato", "nesta cena", "na progressao", "no conflito"],
      c: [".", ". Repetimos com criterio.", ". Ajusta o briefing.", ". Volto a rodar.", ". Preciso de nova direcao."],
    },
  },
  "storyboard-creator": {
    welcome: {
      a: ["Estou pronto", "Estou ligado", "Ja abri o quadro", "Estou em modo desenho", "Estou com energia"],
      b: ["para desenhar", "para visualizar", "para montar", "para transformar", "para dar forma"],
      c: ["a tua ideia.", "essa cena.", "o teu roteiro.", "o teu conceito.", "o teu briefing visual."],
    },
    success: {
      a: ["Fechei o storyboard", "Alinhei os quadros", "Tranquei os prompts", "Arrumei a composicao", "Entreguei os planos"],
      b: ["com estilo", "com leitura clara", "com ritmo visual", "com luz no ponto", "sem ruido"],
      c: [".", ". Ficou fixe.", ". Ja podes produzir.", ". Segue para video.", ". Pronto para render."],
    },
    thinking: {
      a: ["Estou a escolher", "Estou a alinhar", "Estou a refinar", "Estou a testar", "Estou a equilibrar"],
      b: ["enquadramentos", "paleta e luz", "camera e lente", "ritmo visual", "detalhe"],
      c: ["com boa vibe.", "sem perder clareza.", "sem fugir ao estilo.", "para ficar bonito e util.", "e ja te mostro."],
    },
    error: {
      a: ["Tropecei", "Entortei o quadro", "Falhei a composicao", "Quebrei a leitura", "A cena nao fechou"],
      b: ["neste plano", "neste bloco", "nesta ligacao", "na paleta", "na coerencia"],
      c: [".", ". Ajusto e volto.", ". Limpo o prompt e repito.", ". Manda de novo.", ". Corrijo ja."],
    },
  },
  "video-creator": {
    welcome: {
      a: ["Estou aqui", "Pronto", "Fala", "Diz", "Resume"],
      b: ["o salto", "a transicao", "os parametros", "o movimento", "o essencial"],
      c: ["sem novela.", "em uma linha.", "sem poesia.", "direto.", "e eu trato."],
    },
    success: {
      a: ["Fechei", "Conclui", "Entreguei", "Resolvi", "Tranquei"],
      b: ["a transicao", "o bloco", "o timing", "o movimento", "o pedido"],
      c: [".", ". Funciona.", ". Proximo.", ". Renderiza.", ". Nao compliques."],
    },
    thinking: {
      a: ["Estou a calcular", "Estou a ajustar", "Estou a sincronizar", "Estou a fechar", "Estou a tratar"],
      b: ["frames", "timing", "curva", "movimento", "passagem"],
      c: ["sem floreados.", "em seco.", "com foco no resultado.", "sem conversa.", "e ja termino."],
    },
    error: {
      a: ["Falhei", "Bloqueei", "Quebrei", "Interrompi", "Nao passei"],
      b: ["no salto", "na transicao", "nos parametros", "no timing", "na execucao"],
      c: [".", ". Revê o input.", ". Corrige e repete.", ". Manda dados limpos.", ". Tenta outra vez."],
    },
  },
};

const DIRECT_MESSAGES = {
  "neo-x1": {
    welcome: [
      "Estou de volta. Diz-me o que precisas.",
      "Estou pronto. Envia o pedido com clareza.",
      "Estou aqui para resolver isso contigo.",
      "Estou operacional. Qual e a prioridade?",
      "Estou a ouvir. Diz-me o objetivo.",
    ],
    success: [
      "Conclui. Podes validar.",
      "Fechei esta etapa. Seguimos.",
      "Resolvi isso. Proximo passo.",
      "Entreguei o resultado. Sem ruido.",
      "Terminei. Diz-me o seguinte.",
    ],
    thinking: [
      "Estou a analisar o teu pedido.",
      "Estou a processar os requisitos.",
      "Estou a validar antes de responder.",
      "Estou a estruturar a melhor saida.",
      "Estou a fechar os detalhes agora.",
    ],
    error: [
      "Falhei nesta etapa. Tenta outra vez.",
      "Bati num erro tecnico. Repete o envio.",
      "Nao consegui concluir isto agora.",
      "Interrompi por falha de processamento.",
      "Perdi esta ronda. Corrige e volta a enviar.",
    ],
  },
  "story-creator": {
    welcome: [
      "Estou no set. Diz-me o tema em uma linha.",
      "Sou o realizador agora. Manda o briefing.",
      "Estou pronto para rodar. Qual e o conflito?",
      "Estou com a camara na mao. Fecha a ideia central.",
      "Estou a dirigir isto. Nao me tragas ruído.",
    ],
    success: [
      "Fechei a cena. Proxima.",
      "Cortei. Ficou com impacto.",
      "Tranquei o guiao. Segue para storyboard.",
      "Montei isto com ritmo. Nao mexas.",
      "Aprovei a narrativa. Vamos rodar.",
    ],
    thinking: [
      "Estou a montar o arco sem pieguice.",
      "Estou a decupar as cenas com pulso.",
      "Estou a afinar o conflito para prender publico.",
      "Estou a ensaiar a progressao dramatica.",
      "Estou a cortar gordura narrativa agora.",
    ],
    error: [
      "Perdi a toma nesta cena.",
      "Quebrei o tom. Preciso de novo briefing.",
      "Saiu do guiao. Repetimos com criterio.",
      "Falhei a continuidade neste ato.",
      "Parti o conflito. Ajusta e volto a rodar.",
    ],
  },
  "storyboard-creator": {
    welcome: [
      "Estou pronto para desenhar isto contigo.",
      "Ja abri o quadro. Manda a cena.",
      "Estou em modo visual. Bora montar.",
      "Estou ligado. Transformo isso em imagem.",
      "Estou com energia. Passa-me o briefing visual.",
    ],
    success: [
      "Fechei o storyboard. Ficou fixe.",
      "Alinhei os quadros. Ja da para produzir.",
      "Tranquei os prompts. Segue para video.",
      "Arrumei a composicao. Tudo legivel.",
      "Entreguei os planos. Pronto para render.",
    ],
    thinking: [
      "Estou a escolher enquadramentos com boa vibe.",
      "Estou a alinhar luz, paleta e foco.",
      "Estou a refinar para ficar bonito e util.",
      "Estou a testar a leitura visual agora.",
      "Estou a equilibrar estilo e clareza.",
    ],
    error: [
      "Tropecei neste plano.",
      "Entortei o quadro. Corrijo ja.",
      "Falhei a composicao nesta ligacao.",
      "Quebrei a coerencia visual.",
      "A cena nao fechou. Manda de novo.",
    ],
  },
  "video-creator": {
    welcome: [
      "Estou aqui. Diz o essencial.",
      "Pronto. Resume a transicao.",
      "Fala direto. Sem novela.",
      "Diz os parametros e eu trato.",
      "Estou em seco. Um pedido por vez.",
    ],
    success: [
      "Fechei a transicao. Funciona.",
      "Conclui o timing. Proximo.",
      "Entreguei o movimento. Renderiza.",
      "Resolvi este salto. Nao compliques.",
      "Tranquei o bloco. Segue.",
    ],
    thinking: [
      "Estou a calcular frames. Sem conversa.",
      "Estou a ajustar timing em seco.",
      "Estou a sincronizar a passagem agora.",
      "Estou a fechar a curva temporal.",
      "Estou a tratar disto com foco no resultado.",
    ],
    error: [
      "Falhei no salto. Revê o input.",
      "Bloqueei nesta transicao.",
      "Quebrei o timing. Corrige e repete.",
      "Interrompi a execucao. Dados insuficientes.",
      "Nao passei esta ronda. Manda limpo.",
    ],
  },
};

const MIX_WEIGHTS = {
  "neo-x1": {
    welcome: 0.35,
    success: 0.3,
    thinking: 0.25,
    error: 0.35,
  },
  "story-creator": {
    welcome: 0.75,
    success: 0.7,
    thinking: 0.7,
    error: 0.75,
  },
  "storyboard-creator": {
    welcome: 0.6,
    success: 0.6,
    thinking: 0.55,
    error: 0.6,
  },
  "video-creator": {
    welcome: 0.85,
    success: 0.8,
    thinking: 0.8,
    error: 0.85,
  },
};

function bancoMensagensAtual() {
  return MESSAGE_TEMPLATES[estado.agenteAtual] || MESSAGE_TEMPLATES["neo-x1"];
}

function bancoMensagensDiretasAtual() {
  return DIRECT_MESSAGES[estado.agenteAtual] || DIRECT_MESSAGES["neo-x1"];
}

function pesoMensagensDiretas(chave) {
  const pesos = MIX_WEIGHTS[estado.agenteAtual] || MIX_WEIGHTS["neo-x1"];
  const bruto = Number(pesos && pesos[chave]);
  if (!Number.isFinite(bruto)) return 0.55;
  if (bruto < 0) return 0;
  if (bruto > 1) return 1;
  return bruto;
}

function escolherItemAleatorio(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

function gerarFraseCombinada(modelo, fallback) {
  if (!modelo || !Array.isArray(modelo.a) || !Array.isArray(modelo.b) || !Array.isArray(modelo.c)) {
    return fallback;
  }

  return [escolherItemAleatorio(modelo.a), escolherItemAleatorio(modelo.b), escolherItemAleatorio(modelo.c)]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function gerarFrase(chave, fallback) {
  const combinado = bancoMensagensAtual()[chave];
  const diretas = bancoMensagensDiretasAtual()[chave] || [];
  const pesoDiretas = pesoMensagensDiretas(chave);

  const memoriaChave = estado.agenteAtual + ":" + chave;
  const historico = Array.isArray(estado.ultimasFrases[memoriaChave])
    ? estado.ultimasFrases[memoriaChave]
    : [];

  let frase = fallback;
  for (let i = 0; i < 50; i += 1) {
    const usarDireta = diretas.length > 0 && Math.random() < pesoDiretas;
    frase = usarDireta
      ? escolherItemAleatorio(diretas)
      : gerarFraseCombinada(combinado, fallback);
    if (!historico.includes(frase)) break;
  }

  historico.push(frase);
  if (historico.length > 24) historico.shift();
  estado.ultimasFrases[memoriaChave] = historico;
  return frase;
}

function fraseBoasVindas() {
  return gerarFrase("welcome", "Bem-vindo.");
}

function fraseSucesso() {
  return gerarFrase("success", "Concluido.");
}

function frasePensar() {
  return gerarFrase("thinking", "A processar...");
}

function fraseErro() {
  return gerarFrase("error", "Ocorreu um erro.");
}

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

function urlConteudoFicheiro(projeto, nome, forcarDownload = false) {
  const p = encodeURIComponent(String(projeto || "geral"));
  const n = encodeURIComponent(String(nome || ""));
  const d = forcarDownload ? "1" : "0";
  return "/api/ficheiros/conteudo?projeto=" + p + "&nome=" + n + "&download=" + d;
}

function formatarTamanho(bytes) {
  const v = Number(bytes || 0);
  if (v < 1024) return v + " B";
  if (v < 1024 * 1024) return (v / 1024).toFixed(1) + " KB";
  if (v < 1024 * 1024 * 1024) return (v / (1024 * 1024)).toFixed(1) + " MB";
  return (v / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function adicionarMensagem(texto, classe) {
  const div = document.createElement("div");
  div.className = "msg " + classe;
  div.innerHTML = escapar(texto);
  $("mensagens").appendChild(div);
  $("mensagens").scrollTop = $("mensagens").scrollHeight;
}

function limparEstadoStoryboardVisual() {
  estado.storyboardResultados = {};
  estado.storyboardSelecionados = {};
  estado.storyboardCards = {};
  estado.storyboardUltimoJson = null;
}

function chaveShotStoryboard(sceneId, shotId) {
  return String(sceneId || "Sxx") + "::" + String(shotId || "SHxx");
}

function listarStoryboardDisponiveis() {
  return Object.values(estado.storyboardResultados).filter((r) => r && r.saida_nome);
}

function listarStoryboardSelecionados() {
  return listarStoryboardDisponiveis().filter((r) => estado.storyboardSelecionados[chaveShotStoryboard(r.scene_id, r.shot_id)] !== false);
}

function atualizarResumoSelecaoStoryboard() {
  if (estado.agenteAtual !== "storyboard-creator") return;
  const disponiveis = listarStoryboardDisponiveis().length;
  const selecionados = listarStoryboardSelecionados().length;
  if (disponiveis === 0) return;
  const msg = "[Storyboard] Selecionados para Video Creator: " + selecionados + "/" + disponiveis;
  const el = $("ref-fachada-estado");
  if (el) el.textContent = msg;
}

function criarOuAtualizarCardStoryboardResultado(resultado) {
  if (!resultado || !resultado.saida_nome) return;
  const key = chaveShotStoryboard(resultado.scene_id, resultado.shot_id);
  estado.storyboardResultados[key] = resultado;
  if (!(key in estado.storyboardSelecionados)) {
    estado.storyboardSelecionados[key] = !!resultado.aprovado;
  }

  const projeto = estado.projetoAtual;
  let card = estado.storyboardCards[key];

  if (!card) {
    card = document.createElement("div");
    card.className = "msg agente msg-story-shot";
    card.dataset.shotKey = key;

    const titulo = document.createElement("div");
    titulo.className = "story-shot-titulo";
    card.appendChild(titulo);

    const img = document.createElement("img");
    img.className = "story-shot-preview";
    img.alt = "Storyboard shot";
    card.appendChild(img);

    const meta = document.createElement("div");
    meta.className = "story-shot-meta";
    card.appendChild(meta);

    const acoes = document.createElement("div");
    acoes.className = "story-shot-acoes";

    const lbl = document.createElement("label");
    lbl.className = "story-shot-select";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.addEventListener("change", () => {
      estado.storyboardSelecionados[key] = cb.checked;
      atualizarResumoSelecaoStoryboard();
      atualizarBotoesPipelineUI();
    });
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(" Usar no Video Creator"));
    acoes.appendChild(lbl);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-ref-replace";
    btn.textContent = "Regenerar shot";
    btn.addEventListener("click", () => {
      regenerarShotStoryboard(key).catch((e) => {
        adicionarMensagem("[Storyboard] " + fraseErro() + " Detalhe: " + e.message, "erro");
      });
    });
    acoes.appendChild(btn);

    card.appendChild(acoes);
    $("mensagens").appendChild(card);
    estado.storyboardCards[key] = card;
  }

  const tituloEl = card.querySelector(".story-shot-titulo");
  const imgEl = card.querySelector(".story-shot-preview");
  const metaEl = card.querySelector(".story-shot-meta");
  const cbEl = card.querySelector(".story-shot-select input");

  if (tituloEl) {
    tituloEl.textContent = "Shot " + String(resultado.scene_id || "Sxx") + " / " + String(resultado.shot_id || "SHxx");
  }
  if (imgEl) {
    imgEl.src = urlConteudoFicheiro(projeto, resultado.saida_nome, false) + "&t=" + Date.now();
  }
  if (metaEl) {
    const score = Number(resultado.score || 0).toFixed(3);
    const coverage = Number(resultado.coverage || 0).toFixed(3);
    const spill = Number(resultado.spill || 0).toFixed(3);
    const estadoAprov = resultado.aprovado ? "APROVADO" : "NAO APROVADO";
    metaEl.textContent = estadoAprov + " | score=" + score + " | coverage=" + coverage + " | spill=" + spill;
  }
  if (cbEl) {
    cbEl.checked = estado.storyboardSelecionados[key] !== false;
  }

  $("mensagens").scrollTop = $("mensagens").scrollHeight;
  atualizarResumoSelecaoStoryboard();
  atualizarBotoesPipelineUI();
}

function atualizarResultadosStoryboardNoChat(job) {
  const resultados = Array.isArray(job && job.resultados) ? job.resultados : [];
  for (const item of resultados) {
    if (item && item.saida_nome) {
      criarOuAtualizarCardStoryboardResultado(item);
    }
  }
}

function _mdc(a, b) {
  let x = Math.abs(Number(a) || 0);
  let y = Math.abs(Number(b) || 0);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function formatarProporcao(width, height) {
  const w = Number(width || 0);
  const h = Number(height || 0);
  if (!w || !h) return "--";
  const d = _mdc(w, h);
  const sw = Math.max(1, Math.round(w / d));
  const sh = Math.max(1, Math.round(h / d));
  return sw + ":" + sh;
}

function calcularMetaImagem(ficheiro) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(ficheiro);
      const img = new Image();
      img.onload = () => {
        const width = Number(img.naturalWidth || 0);
        const height = Number(img.naturalHeight || 0);
        URL.revokeObjectURL(url);
        resolve({ width, height, proporcao: formatarProporcao(width, height) });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ width: 0, height: 0, proporcao: "--" });
      };
      img.src = url;
    } catch (_) {
      resolve({ width: 0, height: 0, proporcao: "--" });
    }
  });
}

function atualizarLabelUploadReferencia(habilitarSubstituicao) {
  const label = $("btn-ref-upload");
  if (!label) return;
  label.textContent = habilitarSubstituicao
    ? "Substituir imagem de referencia"
    : "+ Imagem de referencia";
}

function abrirSeletorReferenciaFachada() {
  const input = $("input-referencia-fachada");
  if (!input) return;
  input.click();
}

function abrirPreviewImagemReferencia(info) {
  const modal = $("modal-preview-imagem");
  const img = $("preview-imagem-src");
  const nome = $("preview-imagem-nome");
  const resolucao = $("preview-imagem-resolucao");
  const acoes = $("preview-imagem-acoes");
  const linkTransferir = $("preview-imagem-transferir");
  if (!modal || !img || !nome || !resolucao) return;

  const src = String((info && info.previewUrl) || "");
  if (!src) return;
  const n = String((info && info.nome) || "Imagem de referencia");
  const w = Number((info && info.width) || 0);
  const h = Number((info && info.height) || 0);
  const p = String((info && info.proporcao) || formatarProporcao(w, h));

  img.onload = null;
  if (w <= 0 || h <= 0) {
    img.onload = () => {
      const rw = Number(img.naturalWidth || 0);
      const rh = Number(img.naturalHeight || 0);
      if (rw > 0 && rh > 0) {
        resolucao.textContent = rw + " x " + rh + " px • proporcao " + formatarProporcao(rw, rh);
      }
    };
  }

  img.src = src;
  if (w <= 0 && h <= 0 && img.complete) {
    const rw = Number(img.naturalWidth || 0);
    const rh = Number(img.naturalHeight || 0);
    if (rw > 0 && rh > 0) {
      resolucao.textContent = rw + " x " + rh + " px • proporcao " + formatarProporcao(rw, rh);
    }
  }
  img.alt = n;
  nome.textContent = n;
  if (w > 0 && h > 0) {
    resolucao.textContent = w + " x " + h + " px • proporcao " + p;
  } else {
    resolucao.textContent = "Resolucao indisponivel";
  }

  const eBlobLocal = src.startsWith("blob:");
  if (acoes) {
    acoes.classList.toggle("oculto", eBlobLocal);
  }
  if (!eBlobLocal) {
    const link = urlConteudoFicheiro(estado.projetoAtual, n, true);
    if (linkTransferir) linkTransferir.href = link;
    modal.dataset.fileName = n;
  } else {
    modal.dataset.fileName = "";
  }

  modal.classList.remove("oculto");
  modal.setAttribute("aria-hidden", "false");
}

function fecharPreviewImagemReferencia() {
  const modal = $("modal-preview-imagem");
  const img = $("preview-imagem-src");
  if (!modal || !img) return;
  modal.classList.add("oculto");
  modal.setAttribute("aria-hidden", "true");
  modal.dataset.fileName = "";
  img.src = "";
}

function adicionarMensagemReferenciaVisual(info) {
  const nome = String((info && info.nome) || "imagem");
  const previewUrl = String((info && info.previewUrl) || "");
  const substituida = !!(info && info.substituida);
  const width = Number((info && info.width) || 0);
  const height = Number((info && info.height) || 0);
  const proporcao = String((info && info.proporcao) || formatarProporcao(width, height));

  const card = document.createElement("div");
  card.className = "msg agente msg-referencia";
  card.tabIndex = 0;

  const titulo = document.createElement("div");
  titulo.className = "msg-ref-titulo";
  titulo.textContent = substituida
    ? "Imagem de referencia substituida"
    : "Imagem de referencia carregada";
  card.appendChild(titulo);

  if (previewUrl) {
    const img = document.createElement("img");
    img.className = "msg-ref-preview";
    img.alt = "Imagem de referencia: " + nome;
    img.src = previewUrl;
    card.appendChild(img);
  }

  const nomeEl = document.createElement("div");
  nomeEl.className = "msg-ref-nome";
  nomeEl.textContent = nome;
  card.appendChild(nomeEl);

  const metaEl = document.createElement("div");
  metaEl.className = "msg-ref-meta";
  if (width > 0 && height > 0) {
    metaEl.textContent = "Resolucao: " + width + " x " + height + " px • Proporcao: " + proporcao;
  } else {
    metaEl.textContent = "Resolucao: indisponivel";
  }
  card.appendChild(metaEl);

  const acoes = document.createElement("div");
  acoes.className = "msg-ref-acoes";

  const btnSubstituir = document.createElement("button");
  btnSubstituir.type = "button";
  btnSubstituir.className = "btn-ref-replace";
  btnSubstituir.textContent = "Substituir imagem";
  btnSubstituir.addEventListener("click", abrirSeletorReferenciaFachada);
  acoes.appendChild(btnSubstituir);

  card.appendChild(acoes);

  const abrirPreview = () => {
    abrirPreviewImagemReferencia({ nome, previewUrl, width, height, proporcao });
  };
  card.addEventListener("click", (ev) => {
    if (ev.target && ev.target.closest(".btn-ref-replace")) return;
    abrirPreview();
  });
  card.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      abrirPreview();
    }
  });

  $("mensagens").appendChild(card);
  $("mensagens").scrollTop = $("mensagens").scrollHeight;
}

function criarMensagemLoading(texto) {
  const div = document.createElement("div");
  div.className = "msg agente msg-loading";
  div.innerHTML =
    '<div class="loading-glow">' + escapar(texto || frasePensar()) + '</div>' +
    '<div class="loading-dots" aria-hidden="true"><span></span><span></span><span></span></div>';
  $("mensagens").appendChild(div);
  $("mensagens").scrollTop = $("mensagens").scrollHeight;
  iniciarCicloLoading(div);
  return div;
}

function atualizarMensagemLoading(div, texto) {
  if (!div) return;
  const t = div.querySelector(".loading-glow");
  if (t) t.textContent = texto || frasePensar();
}

function iniciarCicloLoading(div) {
  if (!div) return;
  pararCicloLoading(div);

  const tick = () => {
    if (!div.isConnected || !div.classList.contains("msg-loading")) {
      pararCicloLoading(div);
      return;
    }
    atualizarMensagemLoading(div, frasePensar());
    const atraso = 3000 + Math.floor(Math.random() * 3001);
    div._loadingTimer = setTimeout(tick, atraso);
  };

  const primeiroAtraso = 3000 + Math.floor(Math.random() * 3001);
  div._loadingTimer = setTimeout(tick, primeiroAtraso);
}

function pararCicloLoading(div) {
  if (!div || !div._loadingTimer) return;
  clearTimeout(div._loadingTimer);
  div._loadingTimer = null;
}

function finalizarLoadingSucesso(div, textoFinal, notaExtra) {
  if (!div) return;
  pararCicloLoading(div);
  div.className = "msg agente";
  div.textContent = textoFinal;
  if (notaExtra) {
    const nota = document.createElement("span");
    nota.className = "nota-agente";
    nota.textContent = " (" + notaExtra + ")";
    div.appendChild(nota);
  }
}

function finalizarLoadingErro(div, detalhe) {
  if (!div) return;
  pararCicloLoading(div);
  div.className = "msg erro";
  div.textContent = fraseErro() + " Detalhe: " + detalhe;
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
  adicionarMensagem("[Sistema] " + fraseSucesso() + " Perfil de modelo atualizado para: " + perfil, "agente");
}

function limparChat() {
  $("mensagens").innerHTML = "";
  limparEstadoStoryboardVisual();
}

const AGENT_BACKGROUND_IMAGES = {
  "neo-x1": "/assets/neox1-logo.png",
  "story-creator": "/assets/Story%20Creator.PNG",
  "story-creator-maker": "/assets/Story%20Creator.PNG",
  "storyboard-creator": "/assets/Storyboard%20Maker.PNG",
  "storyboard-maker": "/assets/Storyboard%20Maker.PNG",
  "video-creator": "/assets/Video%20Director.PNG",
  "video-director": "/assets/Video%20Director.PNG",
};

function obterImagemAgente(agenteId) {
  const id = String(agenteId || "").toLowerCase();
  if (AGENT_BACKGROUND_IMAGES[id]) return AGENT_BACKGROUND_IMAGES[id];

  const info = estado.agentes.find((a) => String(a.id || "").toLowerCase() === id);
  const nome = String((info && info.nome) || "").toLowerCase();
  if (nome.includes("storyboard")) return AGENT_BACKGROUND_IMAGES["storyboard-maker"];
  if (nome.includes("video") || nome.includes("director")) return AGENT_BACKGROUND_IMAGES["video-director"];
  if (nome.includes("story")) return AGENT_BACKGROUND_IMAGES["story-creator"];

  return AGENT_BACKGROUND_IMAGES["neo-x1"];
}

function atualizarImagemFundoAgente() {
  const src = obterImagemAgente(estado.agenteAtual);
  const selo = $("agente-selo-img");
  if (selo) {
    selo.src = src;
    selo.alt = "";
  }
}

function mostrarChatVazio() {
  $("mensagens").innerHTML =
    '<div class="vazia" id="chat-vazio"><p>' + escapar(fraseBoasVindas()) + '</p></div>';
}

const PREFIX_PIPELINE = "Input vindo do agente anterior (pipeline):\n\n";
const EXTENSOES_IMAGEM = [
  ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".exr",
];
const PADROES_FACHADA_PREFERENCIAL = [
  "outline", "contour", "lineart", "wireframe", "ao", "ambientocclusion",
  "ambient_occlusion", "facade", "fachada", "building", "edificio",
];

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

function eImagem(nome) {
  const n = String(nome || "").toLowerCase();
  return EXTENSOES_IMAGEM.some((ext) => n.endsWith(ext));
}

function eReferenciaFachadaPreferencial(nome) {
  const n = String(nome || "").toLowerCase();
  return PADROES_FACHADA_PREFERENCIAL.some((p) => n.includes(p));
}

async function listarImagensDoProjeto() {
  const ficheiros = await api(
    "/api/ficheiros?projeto=" + encodeURIComponent(estado.projetoAtual)
  );
  return (ficheiros || []).filter((f) => eImagem(f.nome));
}

function escolherReferenciaFachada(imagens) {
  const lista = Array.isArray(imagens) ? imagens : [];
  if (!lista.length) return null;
  const pref = lista.filter((f) => eReferenciaFachadaPreferencial(f.nome));
  return pref.length > 0 ? pref[0] : lista[0];
}

function precisaReferenciaFachadaAgora() {
  return estado.agenteAtual === "storyboard-creator" || !!estado.autoPipeline;
}

async function atualizarEstadoReferenciaFachadaUI() {
  const el = $("ref-fachada-estado");
  if (!el) return;

  if (!precisaReferenciaFachadaAgora()) {
    el.classList.remove("alerta", "ok");
    el.textContent = "Imagem de referencia opcional neste modo. Recomendada para storyboard/comfyui.";
    atualizarLabelUploadReferencia(!!estado.referenciaFachadaAtual);
    return;
  }

  try {
    const imagens = await listarImagensDoProjeto();
    if (imagens.length === 0) {
      el.classList.remove("ok");
      el.classList.add("alerta");
      el.textContent = "Imagem de referencia em falta. Anexa outline/render AO para continuar no storyboard.";
      estado.referenciaFachadaAtual = null;
      atualizarLabelUploadReferencia(false);
      return;
    }
    const pref = imagens.filter((f) => eReferenciaFachadaPreferencial(f.nome));
    const escolhida = escolherReferenciaFachada(imagens);
    estado.referenciaFachadaAtual = escolhida.nome;
    el.classList.remove("alerta");
    el.classList.add("ok");
    atualizarLabelUploadReferencia(true);
    el.textContent = pref.length > 0
      ? "Imagem de referencia pronta: " + pref[0].nome
      : "Imagem anexada: " + imagens[0].nome + " (recomendado outline/AO para melhor resultado).";
  } catch (_) {
    el.classList.remove("ok");
    el.classList.add("alerta");
    el.textContent = "Nao consegui validar as referencias agora.";
    atualizarLabelUploadReferencia(!!estado.referenciaFachadaAtual);
  }
}

function blocoReferenciaFachada(imagens) {
  if (!Array.isArray(imagens) || imagens.length === 0) return "";
  const preferenciais = imagens.filter((f) => eReferenciaFachadaPreferencial(f.nome));
  const lista = (preferenciais.length > 0 ? preferenciais : imagens)
    .slice(0, 10)
    .map((f) => "- " + f.nome)
    .join("\n");

  return [
    "",
    "Referencias de fachada anexadas neste projeto:",
    lista,
    "",
    "Instrucao tecnica:",
    "- Prioriza outlines/render AO da fachada para manter proporcoes reais.",
    "- Se houver varias referencias, escolhe a mais limpa e frontal como base.",
    "- Mantem consistencia com a fachada real durante todos os shots.",
  ].join("\n");
}

async function garantirReferenciaFachadaParaStoryboard() {
  const imagens = await listarImagensDoProjeto();
  if (imagens.length > 0) {
    await atualizarEstadoReferenciaFachadaUI();
    return { ok: true, imagens };
  }

  await atualizarEstadoReferenciaFachadaUI();

  adicionarMensagem(
    "[Storyboard Maker] Antes de continuar, anexa uma imagem de referencia junto ao campo de escrita. Formatos: PNG, JPG, WEBP, TIFF, EXR. Preferencial: outline/lineart ou render AO da fachada.",
    "erro"
  );
  return { ok: false, imagens: [] };
}

function tentarParseJson(texto) {
  const bruto = String(texto || "").trim();
  if (!bruto) return null;

  const candidatos = [bruto];

  // Caso comum: resposta envolvida em markdown ```json ... ```.
  const blocoJson = bruto.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (blocoJson && blocoJson[1]) {
    candidatos.push(String(blocoJson[1]).trim());
  }

  // Fallback: extrai do primeiro "{" até ao último "}".
  const idxIni = bruto.indexOf("{");
  const idxFim = bruto.lastIndexOf("}");
  if (idxIni >= 0 && idxFim > idxIni) {
    candidatos.push(bruto.slice(idxIni, idxFim + 1).trim());
  }

  const vistos = new Set();
  for (const candidato of candidatos) {
    if (!candidato || vistos.has(candidato)) continue;
    vistos.add(candidato);
    try {
      return JSON.parse(candidato);
    } catch (_) {
      // tentar próximo candidato
    }
  }

  return null;
}

function resumirStoryCreator(jsonObj) {
  const progress = jsonObj.progress || "historia_completa";
  const titulo = jsonObj.project_title || "Historia";
  const linhas = [];

  // Se ainda em investigação, mostra as perguntas
  if (progress === "investigacao") {
    linhas.push("📋 Investigação — Preparando contexto...");
    linhas.push("");
    const questions = Array.isArray(jsonObj.questions) ? jsonObj.questions : [];
    if (questions.length > 0) {
      linhas.push("Perguntas:");
      for (const q of questions) {
        linhas.push("• " + String(q));
      }
    }
    return linhas.join("\n").trim();
  }

  // Se história completa, mostra estrutura formatada
  const tema = ((jsonObj.creative_direction || {}).theme || "").trim();
  const tom = ((jsonObj.creative_direction || {}).tone || "").trim();
  const atos = Array.isArray(jsonObj.acts) ? jsonObj.acts : [];

  linhas.push("📖 " + titulo);
  if (tema || tom) linhas.push("Tema/Tom: " + [tema, tom].filter(Boolean).join(" | "));
  linhas.push("");

  for (const ato of atos) {
    const nomeAto = ato.act_title || "Ato";
    linhas.push("🎬 " + nomeAto + " — " + (ato.objective || ""));
    const cenas = Array.isArray(ato.scenes) ? ato.scenes : [];
    for (const cena of cenas) {
      const sid = cena.scene_id || "Sxx";
      const st = cena.scene_title || "Cena";
      const vd = cena.visual_description || cena.narrative_purpose || "";
      const dur = cena.duration_seconds ? " (" + cena.duration_seconds + "s)" : "";
      linhas.push("  " + sid + " — " + st + dur);
      if (vd) linhas.push("     " + vd);
    }
    linhas.push("");
  }

  return linhas.join("\n").trim();
}

function resumirStoryboardCreator(jsonObj) {
  const titulo = jsonObj.project_title || "Storyboard";
  const style = jsonObj.global_style || {};
  const shots = Array.isArray(jsonObj.shots) ? jsonObj.shots : [];
  const linhas = [];

  linhas.push("🎨 " + titulo);

  const visualStyle = String(style.visual_style || "").trim();
  const palette = Array.isArray(style.color_palette)
    ? style.color_palette.map((c) => String(c || "").trim()).filter(Boolean)
    : [];
  const lighting = String(style.lighting_language || "").trim();

  const resumoStyle = [visualStyle, lighting].filter(Boolean).join(" | ");
  if (resumoStyle) linhas.push("Estilo/Luz: " + resumoStyle);
  if (palette.length > 0) linhas.push("Paleta: " + palette.slice(0, 4).join(", "));
  linhas.push("");

  if (shots.length === 0) {
    linhas.push("Sem shots no output. Ajusta o pedido e volta a gerar.");
    return linhas.join("\n").trim();
  }

  linhas.push("Shots (" + shots.length + "):");
  for (const shot of shots) {
    const sceneId = String(shot.scene_id || "Sxx");
    const shotId = String(shot.shot_id || "SHxx");
    const purpose = String(shot.purpose || "").trim();

    let linha = "• " + sceneId + " / " + shotId;
    if (purpose) linha += " — " + purpose;
    linhas.push(linha);
  }

  return linhas.join("\n").trim();
}

function formatarRespostaParaUI(agenteId, respostaBruta) {
  if (agenteId !== "story-creator" && agenteId !== "storyboard-creator") {
    return String(respostaBruta || "");
  }

  const obj = tentarParseJson(respostaBruta);
  if (!obj || !obj.agent) return String(respostaBruta || "");

  if (agenteId === "story-creator" && obj.agent === "story_creator") {
    return resumirStoryCreator(obj);
  }

  if (agenteId === "storyboard-creator" && obj.agent === "storyboard_creator") {
    return resumirStoryboardCreator(obj);
  }

  return String(respostaBruta || "");
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
  atualizarImagemFundoAgente();
}

async function selecionarAgente(agenteId) {
  const agenteAnterior = estado.agenteAtual;
  if (agenteAnterior && estado.conversaAtual !== null) {
    estado.conversaPorAgente[agenteAnterior] = estado.conversaAtual;
  }

  const agenteExiste = estado.agentes.find((a) => a.id === agenteId);
  const agenteEfetivo = agenteExiste
    ? agenteId
    : ((estado.agentes[0] && estado.agentes[0].id) || "neo-x1");

  estado.agenteAtual = agenteEfetivo;
  atualizarImagemFundoAgente();
  renderizarAbas();

  const agente = estado.agentes.find(a => a.id === agenteEfetivo);
  if (agente) {
    $("nome-agente").textContent = agente.nome;
    localStorage.setItem("agenteAtual", agenteEfetivo);
  }

  await carregarConversas();

  const conversaGuardada = estado.conversaPorAgente[agenteEfetivo];
  const conversaDisponivel = conversaGuardada && estado.conversas.find(c => c.id === conversaGuardada);
  if (conversaDisponivel) {
    await abrirConversa(conversaGuardada, false);
  } else if (estado.conversas.length > 0) {
    await abrirConversa(estado.conversas[0].id, false);
  } else {
    estado.conversaAtual = null;
    limparChat();
    mostrarChatVazio();
  }

  atualizarAcaoPrincipalUI();
  atualizarBotoesPipelineUI();
  atualizarEstadoReferenciaFachadaUI().catch(() => {});
  atualizarImagemFundoAgente();
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
  estado.referenciaFachadaAtual = null;
  limparEstadoStoryboardVisual();
  limparChat();
  mostrarChatVazio();
  await carregarProjetos();
  await selecionarAgente(estado.agenteAtual);
  ativarEntrada();
  atualizarEstadoReferenciaFachadaUI().catch(() => {});
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
      const obj = tentarParseJson(m.content || "");
      if (obj && obj.agent === "storyboard_creator") {
        estado.storyboardUltimoJson = obj;
      }
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

function atualizarAcaoPrincipalUI() {
  const btn = $("btn-comfyui-render");
  const btnPdf = $("btn-storyboard-pdf");
  if (!btn) return;
  if (btnPdf) btnPdf.classList.add("oculto");

  btn.classList.remove("btn-storyboard-tool", "btn-story-tool", "btn-video-tool");

  if (estado.agenteAtual === "story-creator") {
    btn.classList.add("btn-story-tool");
    btn.disabled = false;
    btn.title = "Gerar PDF da historia atual";
    btn.innerHTML = '<span class="storyboard-glyph" aria-hidden="true"></span><span>Gerar PDF da Historia</span>';
    return;
  }

  if (estado.agenteAtual === "video-creator") {
    btn.classList.add("btn-video-tool");
    btn.disabled = false;
    btn.title = "Geracao de videos (em breve)";
    btn.innerHTML = '<span class="storyboard-glyph" aria-hidden="true"></span><span>Gerar Videos</span>';
    return;
  }

  if (estado.agenteAtual === "storyboard-creator") {
    btn.classList.add("btn-storyboard-tool");
    btn.disabled = false;
    btn.title = "Gerar storyboard com workflow ComfyUI";
    btn.innerHTML = '<span class="storyboard-glyph" aria-hidden="true"></span><span>Gerar Storyboard</span>';
    if (btnPdf) btnPdf.classList.remove("oculto");
    return;
  }

  btn.disabled = true;
  btn.title = "Acao indisponivel para este agente";
  btn.innerHTML = '<span class="storyboard-glyph" aria-hidden="true"></span><span>Acao indisponivel</span>';
}

function atualizarBotoesPipelineUI() {
  const btnPassar = $("btn-passar-proximo");
  if (!btnPassar) return;

  const proximo = proximoAgentePipeline(estado.agenteAtual);
  if (!proximo) {
    btnPassar.classList.add("oculto");
    btnPassar.disabled = true;
    return;
  }

  const info = estado.agentes.find((a) => a.id === proximo);
  const nome = info && info.nome ? info.nome : proximo;
  btnPassar.classList.remove("oculto");
  if (estado.agenteAtual === "storyboard-creator" && proximo === "video-creator") {
    const aprovados = listarStoryboardDisponiveis().length;
    const selecionados = listarStoryboardSelecionados().length;
    if (aprovados > 0) {
      btnPassar.textContent = "Enviar " + selecionados + "/" + aprovados + " ao [" + nome + "]";
    } else {
      btnPassar.textContent = "Enviar ao [" + nome + "]";
    }
  } else {
    btnPassar.textContent = "Enviar ao [" + nome + "]";
  }
  btnPassar.disabled = false;
}

async function executarPipelineSequencial(agenteOrigem, textoBase) {
  let agenteAtualPipeline = agenteOrigem;
  let textoAtual = textoBase;

  while (true) {
    const proximo = proximoAgentePipeline(agenteAtualPipeline);
    if (!proximo || !textoAtual) break;

    const meta = estado.agentes.find((a) => a.id === proximo);
    const nomeProximo = (meta && meta.nome) || proximo;

    let imagensFachada = [];
    if (proximo === "storyboard-creator") {
      const ver = await garantirReferenciaFachadaParaStoryboard();
      if (!ver.ok) break;
      imagensFachada = ver.imagens;
    }

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

    let mensagemPipeline = PREFIX_PIPELINE + textoAtual;
    if (proximo === "storyboard-creator") {
      mensagemPipeline += blocoReferenciaFachada(imagensFachada);
    }
    adicionarMensagem(mensagemCurtaPipeline(proximo, textoAtual), "utilizador");
    const loadingPipeline = criarMensagemLoading(nomeProximo + ": " + frasePensar());

    let resposta;
    try {
      atualizarMensagemLoading(loadingPipeline, frasePensar());
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
      finalizarLoadingErro(loadingPipeline, e.message);
      throw e;
    }

    const textoResposta = String(resposta.resposta || "").trim();
    estado.ultimaRespostaBrutaPorAgente[estado.agenteAtual] = textoResposta;
    const objStoryboard = tentarParseJson(textoResposta);
    if (objStoryboard && objStoryboard.agent === "storyboard_creator") {
      estado.storyboardUltimoJson = objStoryboard;
    }
    finalizarLoadingSucesso(
      loadingPipeline,
      formatarRespostaParaUI(estado.agenteAtual, textoResposta) || "(sem resposta)",
      fraseSucesso()
    );
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

async function obterUltimaRespostaBrutaDoAgente(agenteId) {
  const cache = estado.ultimaRespostaBrutaPorAgente[agenteId];
  if (cache) return String(cache);

  const conversaId = estado.conversaPorAgente[agenteId];
  if (!conversaId) return "";

  const historico = await api("/api/conversas/" + conversaId + "/mensagens");
  for (let i = historico.length - 1; i >= 0; i -= 1) {
    const item = historico[i];
    if (item.role === "assistant") {
      const bruto = String(item.content || "");
      estado.ultimaRespostaBrutaPorAgente[agenteId] = bruto;
      return bruto;
    }
  }
  return "";
}

async function exportarHistoriaParaPdf() {
  const bruto = (await obterUltimaRespostaBrutaDoAgente("story-creator")).trim();
  if (!bruto) {
    alert("Sem historia para exportar. Gera primeiro no Story Creator.");
    return;
  }

  // Valida se a resposta é JSON com progress=historia_completa
  const jsonObj = tentarParseJson(bruto);
  if (jsonObj && jsonObj.agent === "story_creator") {
    const progress = jsonObj.progress || "historia_completa";
    if (progress === "investigacao") {
      alert("A história ainda está em investigação. Responde às perguntas do Story Creator primeiro.");
      return;
    }
  }

  const conteudo = formatarRespostaParaUI("story-creator", bruto).trim() || bruto;
  const titulo = (jsonObj && jsonObj.project_title) ? jsonObj.project_title : (extrairTituloPipeline(bruto) || "Historia");

  const loading = criarMensagemLoading("A gerar PDF da historia...");
  try {
    const r = await api("/api/story/export-pdf", {
      timeoutMs: 45000,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projeto: estado.projetoAtual,
        titulo,
        conteudo,
      }),
    });
    await atualizarFicheiros();
    finalizarLoadingSucesso(
      loading,
      "PDF da historia gerado: " + String(r.nome || "historia.pdf"),
      fraseSucesso()
    );
  } catch (e) {
    finalizarLoadingErro(loading, e.message);
  }
}

async function executarAcaoPrincipalAgente() {
  if (estado.agenteAtual === "story-creator") {
    await exportarHistoriaParaPdf();
    return;
  }
  if (estado.agenteAtual === "video-creator") {
    adicionarMensagem("[Video Director] Geracao de videos ainda nao implementada. Vamos integrar a seguir.", "agente");
    return;
  }
  await iniciarRenderComfyUI();
}

function resumoStatusComfy(job) {
  const total = Number(job.total || 0);
  const ok = Number(job.concluido || 0);
  const falhados = Number(job.falhados || 0);
  const shotAtual = Number(job.shot_atual || 0);
  const tentativa = Number(job.tentativa || 1);
  const fase = String(job.fase || job.status || "queued");
  return "ComfyUI " + fase + " • " + ok + "/" + total + " aprovados • falhados: " + falhados + " • shot " + shotAtual + "/" + total + " • tentativa " + tentativa;
}

async function acompanharJobComfy(jobId, divStatus) {
  while (true) {
    const job = await api("/api/comfyui/render-batch/" + encodeURIComponent(jobId), { timeoutMs: 15000 });
    atualizarMensagemLoading(divStatus, resumoStatusComfy(job));
    atualizarResultadosStoryboardNoChat(job);

    if (job.status === "done" || job.status === "done_with_errors") {
      const total = Number(job.total || 0);
      const ok = Number(job.concluido || 0);
      const falhados = Number(job.falhados || 0);
      finalizarLoadingSucesso(
        divStatus,
        "ComfyUI concluido: " + ok + "/" + total + " imagens aprovadas.",
        falhados > 0 ? ("falhadas: " + falhados) : "sem falhas"
      );
      await atualizarFicheiros();
      atualizarResumoSelecaoStoryboard();
      atualizarBotoesPipelineUI();
      return;
    }

    if (job.status === "failed") {
      finalizarLoadingErro(divStatus, String(job.erro || "falha desconhecida"));
      return;
    }

    await esperar(1500);
  }
}

async function iniciarRenderComfyUI() {
  if (estado.comfyRenderAtivo) return;

  const brutoStoryboard = (await obterUltimaRespostaBrutaDoAgente("storyboard-creator")).trim();
  if (!brutoStoryboard) {
    alert("Sem storyboard para renderizar. Gera primeiro no Storyboard Maker.");
    return;
  }

  const storyboardJson = tentarParseJson(brutoStoryboard);
  if (!storyboardJson) {
    alert("A ultima resposta do Storyboard Maker nao esta em JSON valido.");
    return;
  }
  estado.storyboardUltimoJson = storyboardJson;

  const ver = await garantirReferenciaFachadaParaStoryboard();
  if (!ver.ok) return;
  const referencia = escolherReferenciaFachada(ver.imagens);
  if (!referencia) {
    alert("Nao encontrei imagem de referencia no projeto.");
    return;
  }

  estado.comfyRenderAtivo = true;
  const btn = $("btn-comfyui-render");
  if (btn) btn.disabled = true;

  const loading = criarMensagemLoading("ComfyUI: a preparar lote de storyboard...");

  try {
    const resposta = await api("/api/comfyui/render-batch", {
      timeoutMs: 30000,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projeto: estado.projetoAtual,
        referencia_nome: referencia.nome,
        storyboard: storyboardJson,
      }),
    });

    atualizarMensagemLoading(loading, "ComfyUI: job " + resposta.job_id + " em fila...");
    await acompanharJobComfy(String(resposta.job_id), loading);
  } catch (e) {
    finalizarLoadingErro(loading, e.message);
  } finally {
    estado.comfyRenderAtivo = false;
    if (btn) btn.disabled = false;
  }
}

async function regenerarShotStoryboard(shotKey) {
  const base = estado.storyboardResultados[shotKey];
  if (!base || !base.prompt) {
    alert("Nao encontrei dados do shot para regenerar.");
    return;
  }
  if (estado.comfyRenderAtivo) {
    alert("Ja existe uma renderizacao em curso. Aguarda terminar.");
    return;
  }

  const ver = await garantirReferenciaFachadaParaStoryboard();
  if (!ver.ok) return;
  const referencia = escolherReferenciaFachada(ver.imagens);
  if (!referencia) {
    alert("Nao encontrei imagem de referencia no projeto.");
    return;
  }

  estado.comfyRenderAtivo = true;
  const btn = $("btn-comfyui-render");
  if (btn) btn.disabled = true;

  const loading = criarMensagemLoading("ComfyUI: a regenerar " + shotKey + "...");
  try {
    const resposta = await api("/api/comfyui/render-batch", {
      timeoutMs: 30000,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projeto: estado.projetoAtual,
        referencia_nome: referencia.nome,
        shots: [
          {
            scene_id: base.scene_id,
            shot_id: base.shot_id,
            prompt: base.prompt,
            seed: base.seed,
          },
        ],
      }),
    });
    atualizarMensagemLoading(loading, "ComfyUI: job " + resposta.job_id + " em fila...");
    await acompanharJobComfy(String(resposta.job_id), loading);
  } catch (e) {
    finalizarLoadingErro(loading, e.message);
  } finally {
    estado.comfyRenderAtivo = false;
    if (btn) btn.disabled = false;
  }
}

async function exportarStoryboardVisualPdf() {
  const selecionados = listarStoryboardSelecionados();
  const aprovados = listarStoryboardDisponiveis();
  const temSelecaoExplicita = Object.keys(estado.storyboardSelecionados).length > 0;
  const itens = temSelecaoExplicita ? selecionados : (selecionados.length > 0 ? selecionados : aprovados);
  if (itens.length === 0) {
    alert("Sem imagens selecionadas para exportar no PDF visual.");
    return;
  }

  const brutoStoryboard = (await obterUltimaRespostaBrutaDoAgente("storyboard-creator")).trim();
  const storyboardJson = tentarParseJson(brutoStoryboard) || estado.storyboardUltimoJson || {};
  const titulo = String(storyboardJson.project_title || "Storyboard Visual");

  const loading = criarMensagemLoading("A gerar PDF visual do storyboard...");
  try {
    const r = await api("/api/storyboard/export-pdf", {
      timeoutMs: 60000,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projeto: estado.projetoAtual,
        titulo,
        itens: itens.map((x) => ({
          scene_id: x.scene_id,
          shot_id: x.shot_id,
          prompt: x.prompt,
          output: x.saida_nome,
        })),
      }),
    });
    await atualizarFicheiros();
    finalizarLoadingSucesso(
      loading,
      "PDF visual gerado: " + String(r.nome || "storyboard_visual.pdf"),
      fraseSucesso()
    );
  } catch (e) {
    finalizarLoadingErro(loading, e.message);
  }
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

  let pacoteStoryboardVideo = null;
  if (origem === "storyboard-creator" && proximo === "video-creator") {
    const storyboardJson = tentarParseJson(bruto) || estado.storyboardUltimoJson;
    const selecionados = listarStoryboardSelecionados();
    const aprovados = listarStoryboardDisponiveis();
    const temSelecaoExplicita = Object.keys(estado.storyboardSelecionados).length > 0;
    const usados = temSelecaoExplicita ? selecionados : (selecionados.length > 0 ? selecionados : aprovados);
    if (usados.length === 0) {
      alert("Sem imagens selecionadas para enviar ao Video Creator.");
      return;
    }
    pacoteStoryboardVideo = {
      agent: "storyboard_package",
      project_title: extrairTituloPipeline(bruto),
      storyboard: storyboardJson || bruto,
      selected_renders: usados.map((x) => ({
        scene_id: x.scene_id,
        shot_id: x.shot_id,
        output: x.saida_nome,
        prompt: x.prompt,
        seed: x.seed,
      })),
    };
  }

  let imagensFachada = [];
  if (proximo === "storyboard-creator") {
    const ver = await garantirReferenciaFachadaParaStoryboard();
    if (!ver.ok) return;
    imagensFachada = ver.imagens;
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

  let mensagemPipeline = PREFIX_PIPELINE + bruto;
  if (pacoteStoryboardVideo) {
    mensagemPipeline = PREFIX_PIPELINE + JSON.stringify(pacoteStoryboardVideo, null, 2);
    adicionarMensagem(
      "[Pipeline] A enviar "
        + pacoteStoryboardVideo.selected_renders.length
        + " imagens selecionadas para o Video Creator.",
      "agente"
    );
  }
  if (proximo === "storyboard-creator") {
    mensagemPipeline += blocoReferenciaFachada(imagensFachada);
  }
  adicionarMensagem(mensagemCurtaPipeline(proximo, bruto), "utilizador");
  const loadingManual = criarMensagemLoading(frasePensar());

  let r;
  try {
    atualizarMensagemLoading(loadingManual, frasePensar());
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
    finalizarLoadingErro(loadingManual, e.message);
    throw e;
  }

  const brutoResposta = String(r.resposta || "");
  estado.ultimaRespostaBrutaPorAgente[estado.agenteAtual] = brutoResposta;
  const objStoryboardManual = tentarParseJson(brutoResposta);
  if (objStoryboardManual && objStoryboardManual.agent === "storyboard_creator") {
    estado.storyboardUltimoJson = objStoryboardManual;
  }
  finalizarLoadingSucesso(
    loadingManual,
    formatarRespostaParaUI(estado.agenteAtual, brutoResposta),
    fraseSucesso()
  );
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
      adicionarMensagem(fraseErro() + " Erro ao criar conversa: " + e.message, "erro");
      return;
    }
  }
  $("btn-enviar").disabled = true;
  $("entrada").value = "";
  adicionarMensagem(texto, "utilizador");
  const divAEnviar = criarMensagemLoading(frasePensar());
  try {
    atualizarMensagemLoading(divAEnviar, frasePensar());
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
    const objStoryboardChat = tentarParseJson(respostaBruta);
    if (objStoryboardChat && objStoryboardChat.agent === "storyboard_creator") {
      estado.storyboardUltimoJson = objStoryboardChat;
    }
    const textoFinal = formatarRespostaParaUI(agenteOrigem, respostaBruta);
    if (r.agente) {
      finalizarLoadingSucesso(divAEnviar, textoFinal, r.agente + " • " + fraseSucesso());
    } else {
      finalizarLoadingSucesso(divAEnviar, textoFinal, fraseSucesso());
    }

    if (estado.autoPipeline) {
      const base = respostaBruta.trim();
      if (base) {
        await executarPipelineSequencial(agenteOrigem, base);
      }
    }
  } catch (e) {
    finalizarLoadingErro(divAEnviar, e.message);
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
  div.innerHTML = "";

  if (!ficheiros.length) {
    div.textContent = "Sem ficheiros.";
    return;
  }

  for (const f of ficheiros) {
    const card = document.createElement("div");
    card.className = "ficheiro-card";

    const preview = document.createElement("div");
    preview.className = "ficheiro-preview";

    if (eImagem(f.nome)) {
      const img = document.createElement("img");
      img.src = urlConteudoFicheiro(estado.projetoAtual, f.nome, false);
      img.alt = f.nome;
      preview.appendChild(img);
    } else {
      const tipo = document.createElement("span");
      tipo.className = "ficheiro-tipo";
      tipo.textContent = (String(f.nome).split(".").pop() || "file").toUpperCase();
      preview.appendChild(tipo);
    }

    const info = document.createElement("div");
    info.className = "ficheiro-info";
    info.innerHTML =
      '<div class="ficheiro-nome" title="' + escapar(f.nome) + '">' + escapar(f.nome) + "</div>" +
      '<div class="ficheiro-meta">' + escapar(formatarTamanho(f.tamanho)) + "</div>";

    const acoes = document.createElement("div");
    acoes.className = "ficheiro-acoes";

    const btnTransferir = document.createElement("a");
    btnTransferir.className = "btn-ficheiro-acao";
    btnTransferir.textContent = "Transferir";
    btnTransferir.href = urlConteudoFicheiro(estado.projetoAtual, f.nome, true);
    btnTransferir.addEventListener("click", (ev) => {
      ev.stopPropagation();
    });
    acoes.appendChild(btnTransferir);

    const btnApagar = document.createElement("button");
    btnApagar.type = "button";
    btnApagar.className = "btn-ficheiro-acao perigo";
    btnApagar.textContent = "Apagar";
    btnApagar.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (!confirm("Apagar ficheiro '" + f.nome + "'?")) return;
      try {
        await api("/api/ficheiros/apagar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projeto: estado.projetoAtual, nome: f.nome }),
        });
        await atualizarFicheiros();
        await atualizarEstadoReferenciaFachadaUI();
      } catch (e) {
        alert("Erro ao apagar: " + e.message);
      }
    });
    acoes.appendChild(btnApagar);

    card.appendChild(preview);
    card.appendChild(info);
    card.appendChild(acoes);

    if (eImagem(f.nome)) {
      card.addEventListener("click", () => {
        abrirPreviewImagemReferencia({
          nome: f.nome,
          previewUrl: urlConteudoFicheiro(estado.projetoAtual, f.nome, false),
          width: 0,
          height: 0,
          proporcao: "--",
        });
      });
    } else {
      card.addEventListener("click", () => {
        window.open(urlConteudoFicheiro(estado.projetoAtual, f.nome, false), "_blank", "noopener");
      });
    }

    div.appendChild(card);
  }
}

async function carregarFicheiro(ev) {
  const ficheiro = ev.target.files[0];
  if (!ficheiro) return;

  let haviaReferencia = false;
  try {
    const imagensAntes = await listarImagensDoProjeto();
    haviaReferencia = imagensAntes.length > 0;
  } catch (_) {
    haviaReferencia = !!estado.referenciaFachadaAtual;
  }

  const fd = new FormData();
  fd.append("projeto", estado.projetoAtual);
  fd.append("ficheiro", ficheiro);
  try {
    const upload = await api("/api/upload", { method: "POST", body: fd });
    const previewUrl = URL.createObjectURL(ficheiro);
    const meta = await calcularMetaImagem(ficheiro);
    estado.referenciaFachadaAtual = String((upload && upload.nome) || ficheiro.name || "");
    adicionarMensagemReferenciaVisual({
      nome: estado.referenciaFachadaAtual,
      previewUrl,
      substituida: haviaReferencia,
      width: meta.width,
      height: meta.height,
      proporcao: meta.proporcao,
    });
    await atualizarFicheiros();
    await atualizarEstadoReferenciaFachadaUI();
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
  $("input-referencia-fachada").addEventListener("change", carregarFicheiro);
  const modalPreview = $("modal-preview-imagem");
  if (modalPreview) {
    modalPreview.addEventListener("click", (ev) => {
      if (ev.target === modalPreview) fecharPreviewImagemReferencia();
    });
  }
  const btnFecharPreview = $("preview-imagem-fechar");
  if (btnFecharPreview) {
    btnFecharPreview.addEventListener("click", fecharPreviewImagemReferencia);
  }
  const btnApagarPreview = $("preview-imagem-apagar");
  if (btnApagarPreview) {
    btnApagarPreview.addEventListener("click", async () => {
      const modal = $("modal-preview-imagem");
      const nome = modal ? String(modal.dataset.fileName || "") : "";
      if (!nome) return;
      if (!confirm("Apagar ficheiro '" + nome + "'?")) return;
      try {
        await api("/api/ficheiros/apagar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projeto: estado.projetoAtual, nome }),
        });
        fecharPreviewImagemReferencia();
        await atualizarFicheiros();
        await atualizarEstadoReferenciaFachadaUI();
      } catch (e) {
        alert("Erro ao apagar: " + e.message);
      }
    });
  }
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") fecharPreviewImagemReferencia();
  });
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
      atualizarEstadoReferenciaFachadaUI().catch(() => {});
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

  const btnComfy = $("btn-comfyui-render");
  if (btnComfy) {
    btnComfy.addEventListener("click", () => {
      executarAcaoPrincipalAgente().catch((e) => {
        alert("Erro: " + e.message);
      });
    });
  }

  const btnStoryboardPdf = $("btn-storyboard-pdf");
  if (btnStoryboardPdf) {
    btnStoryboardPdf.addEventListener("click", () => {
      exportarStoryboardVisualPdf().catch((e) => {
        alert("Erro ao exportar PDF visual: " + e.message);
      });
    });
  }

  atualizarAcaoPrincipalUI();
  atualizarBotoesPipelineUI();
  atualizarEstadoReferenciaFachadaUI().catch(() => {});
  atualizarImagemFundoAgente();
}

// ---------------------------------------------------------------- arranque
arrancar();