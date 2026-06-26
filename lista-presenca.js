const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");

const ARQUIVO_LISTA = path.join(
  process.env.DATA_PATH || __dirname,
  "lista-presenca.json"
);
const TOTAL_JOGADORES = 15;
const TOTAL_SUPLENTES = 4;
const FUSO_HORARIO = process.env.TZ || "America/Sao_Paulo";

const GOLEIROS = ["França", "Reginaldo"];

/** Data exibida em LISTA FUT — próxima quinta-feira do calendário. */
function getQuintaDaSemana() {
  const agora = new Date();
  const dia = agora.getDay();
  const diferenca = dia <= 4 ? 4 - dia : 4 - dia + 7;
  const quinta = new Date(agora);
  quinta.setHours(12, 0, 0, 0);
  quinta.setDate(agora.getDate() + diferenca);
  return quinta;
}

/** Quinta-feira 00:00 que iniciou o ciclo — usado só para reset semanal. */
function getInicioCiclo() {
  const agora = moment.tz(FUSO_HORARIO);
  const dia = agora.day();
  const diasAtras = dia >= 4 ? dia - 4 : dia + 3;
  return agora.clone().subtract(diasAtras, "days").startOf("day");
}

function getSemanaReferencia() {
  return getInicioCiclo().format("YYYY-MM-DD");
}

function formatarDataQuinta(data) {
  const dd = String(data.getDate()).padStart(2, "0");
  const mm = String(data.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function criarListaVazia() {
  return {
    semanaReferencia: getSemanaReferencia(),
    jogadores: Array(TOTAL_JOGADORES).fill(""),
    suplentes: Array(TOTAL_SUPLENTES).fill(""),
    inscricoes: {},
    ultimaListaMsgId: null,
    ultimaListaImportadaEm: null,
  };
}

function carregarLista() {
  if (!fs.existsSync(ARQUIVO_LISTA)) {
    return criarListaVazia();
  }

  try {
    const dados = JSON.parse(fs.readFileSync(ARQUIVO_LISTA, "utf8"));
    return {
      semanaReferencia: dados.semanaReferencia || getSemanaReferencia(),
      jogadores: Array(TOTAL_JOGADORES)
        .fill("")
        .map((_, i) => dados.jogadores?.[i] || ""),
      suplentes: Array(TOTAL_SUPLENTES)
        .fill("")
        .map((_, i) => dados.suplentes?.[i] || ""),
      inscricoes: dados.inscricoes || {},
      ultimaListaMsgId: dados.ultimaListaMsgId || null,
      ultimaListaImportadaEm: dados.ultimaListaImportadaEm || null,
    };
  } catch {
    return criarListaVazia();
  }
}

function salvarLista(dados) {
  fs.writeFileSync(ARQUIVO_LISTA, JSON.stringify(dados, null, 2), "utf8");
}

function garantirSemanaAtual(dados) {
  const semanaAtual = getSemanaReferencia();
  if (dados.semanaReferencia !== semanaAtual) {
    const nova = criarListaVazia();
    Object.assign(dados, nova);
    salvarLista(dados);
    console.log(
      `🔄 Lista zerada — quinta ${getInicioCiclo().format("DD/MM")} 00:00 (${FUSO_HORARIO})`
    );
  }
  return dados;
}

function normalizarNomeBusca(nome) {
  return nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function chaveAvulso(nome) {
  return `avulso:${normalizarNomeBusca(nome)}`;
}

function nomeJaNaLista(dados, nome) {
  const alvo = normalizarNomeBusca(nome);
  const todos = [...dados.jogadores, ...dados.suplentes].filter(Boolean);
  return todos.some((n) => normalizarNomeBusca(n) === alvo);
}

function encontrarInscricaoPorNome(dados, nome) {
  const alvo = normalizarNomeBusca(nome);

  for (const [key, insc] of Object.entries(dados.inscricoes)) {
    const nomeInsc =
      insc.nome ||
      (insc.tipo === "suplente"
        ? dados.suplentes[insc.slot]
        : dados.jogadores[insc.slot]);

    if (nomeInsc && normalizarNomeBusca(nomeInsc) === alvo) {
      return { key, insc };
    }
  }

  return null;
}

function limparSlot(dados, insc) {
  if (insc.tipo === "suplente") {
    dados.suplentes[insc.slot] = "";
  } else {
    dados.jogadores[insc.slot] = "";
  }
}

function pareceListaFut(texto) {
  if (!texto || texto.length < 20) return false;
  return /lista\s*fut/i.test(texto) && /\d+\s*[-–]\s*.+/i.test(texto);
}

function extrairDataLista(texto) {
  const match = texto.match(/lista\s*fut\s*(\d{1,2})\/(\d{1,2})/i);
  if (!match) return null;

  const dd = parseInt(match[1], 10);
  const mm = parseInt(match[2], 10);
  const anoRef = getQuintaDaSemana().getFullYear();

  return moment.tz(
    `${anoRef}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`,
    "YYYY-MM-DD",
    FUSO_HORARIO
  );
}

function dataExibidaLista() {
  return formatarDataQuinta(getQuintaDaSemana());
}

function listaEhDaSemanaAtual(texto) {
  const dataLista = extrairDataLista(texto);
  if (!dataLista?.isValid()) return false;
  return dataLista.format("DD/MM") === dataExibidaLista();
}

function mensagemEhDaSemanaAtual(msg) {
  if (!msg?.timestamp) return false;
  const enviadaEm = moment.unix(msg.timestamp).tz(FUSO_HORARIO);
  return enviadaEm.isSameOrAfter(getInicioCiclo());
}

function podeImportarLista(texto, msg = null) {
  if (!pareceListaFut(texto) || !listaEhDaSemanaAtual(texto)) return false;
  if (msg && !mensagemEhDaSemanaAtual(msg)) return false;
  return true;
}

function parsearListaDoTexto(texto) {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim());
  const jogadores = Array(TOTAL_JOGADORES).fill("");
  const suplentes = Array(TOTAL_SUPLENTES).fill("");
  const avulsosSlots = new Set();
  let secao = "titulares";

  for (const linha of linhas) {
    if (!linha) continue;
    if (/^lista\s*fut/i.test(linha)) continue;
    if (/^goleiros?/i.test(linha)) {
      secao = "goleiros";
      continue;
    }
    if (/^suplentes?/i.test(linha)) {
      secao = "suplentes";
      continue;
    }

    const match = linha.match(/^(\d+)\s*[-–]\s*(.+)$/i);
    if (!match) continue;

    const num = parseInt(match[1], 10);
    const bruto = match[2].trim();
    const ehAvulso = /\(avulso\)/i.test(bruto);
    const nome = bruto.replace(/\s*\(avulso\)\s*$/i, "").trim();
    if (!nome) continue;

    if (secao === "titulares" && num >= 1 && num <= TOTAL_JOGADORES) {
      jogadores[num - 1] = nome;
    } else if (secao === "suplentes" && num >= 1 && num <= TOTAL_SUPLENTES) {
      suplentes[num - 1] = nome;
      if (ehAvulso) avulsosSlots.add(num - 1);
    }
  }

  const valido =
    jogadores.some(Boolean) || suplentes.some(Boolean);

  return { jogadores, suplentes, avulsosSlots, valido };
}

function reconstruirInscricoes(dados, avulsosSlots) {
  const inscricoes = {};

  dados.suplentes.forEach((nome, slot) => {
    if (!nome) return;
    const ehAvulso = avulsosSlots.has(slot);
    inscricoes[chaveAvulso(nome)] = {
      tipo: "suplente",
      slot,
      nome,
      avulso: ehAvulso,
      importado: true,
    };
  });

  return inscricoes;
}

function importarListaDoTexto(texto, msgId = null) {
  const parsed = parsearListaDoTexto(texto);
  if (!parsed.valido) {
    return {
      ok: false,
      mensagem: "⚠️ Não consegui ler a lista. Use o formato LISTA FUT com linhas 1- Nome.",
    };
  }

  const dados = garantirSemanaAtual(carregarLista());
  dados.jogadores = parsed.jogadores;
  dados.suplentes = parsed.suplentes;
  dados.inscricoes = reconstruirInscricoes(dados, parsed.avulsosSlots);
  if (msgId) dados.ultimaListaMsgId = msgId;
  dados.ultimaListaImportadaEm = new Date().toISOString();
  salvarLista(dados);

  const total =
    dados.jogadores.filter(Boolean).length +
    dados.suplentes.filter(Boolean).length;

  return {
    ok: true,
    mensagem: `📋 Lista importada (${total} nomes). Comandos dentro/fora/avulso usam esta base.`,
    listaFormatada: formatarLista(dados),
    dados,
  };
}

function removerNomeDasListas(dados, nome) {
  const alvo = normalizarNomeBusca(nome);
  let removido = false;

  for (let i = 0; i < dados.jogadores.length; i++) {
    if (dados.jogadores[i] && normalizarNomeBusca(dados.jogadores[i]) === alvo) {
      dados.jogadores[i] = "";
      removido = true;
    }
  }

  for (let i = 0; i < dados.suplentes.length; i++) {
    if (dados.suplentes[i] && normalizarNomeBusca(dados.suplentes[i]) === alvo) {
      dados.suplentes[i] = "";
      removido = true;
    }
  }

  for (const [key, insc] of Object.entries(dados.inscricoes)) {
    const nomeInsc =
      insc.nome ||
      (insc.tipo === "suplente"
        ? dados.suplentes[insc.slot]
        : dados.jogadores[insc.slot]);
    if (nomeInsc && normalizarNomeBusca(nomeInsc) === alvo) {
      delete dados.inscricoes[key];
    }
  }

  return removido;
}

function vincularUsuarioPorNomeNaLista(dados, userId, nome) {
  const alvo = normalizarNomeBusca(nome);

  for (let i = 0; i < dados.jogadores.length; i++) {
    if (
      dados.jogadores[i] &&
      normalizarNomeBusca(dados.jogadores[i]) === alvo &&
      !dados.inscricoes[userId]
    ) {
      dados.inscricoes[userId] = {
        tipo: "jogador",
        slot: i,
        nome: dados.jogadores[i],
        importado: true,
      };
      return { tipo: "jogador", slot: i };
    }
  }

  for (let i = 0; i < dados.suplentes.length; i++) {
    if (
      dados.suplentes[i] &&
      normalizarNomeBusca(dados.suplentes[i]) === alvo &&
      !dados.inscricoes[userId]
    ) {
      const chaveAv = chaveAvulso(dados.suplentes[i]);
      dados.inscricoes[userId] = {
        tipo: "suplente",
        slot: i,
        nome: dados.suplentes[i],
        avulso: Boolean(dados.inscricoes[chaveAv]?.avulso),
        importado: true,
      };
      return { tipo: "suplente", slot: i };
    }
  }

  return null;
}

async function sincronizarUltimaListaDoGrupo(client, grupoId, limite = 60) {
  try {
    const chat = await client.getChatById(grupoId);
    const mensagens = await chat.fetchMessages({ limit: limite });

    for (let i = mensagens.length - 1; i >= 0; i--) {
      const m = mensagens[i];
      const corpo = m.body || "";
      if (!podeImportarLista(corpo, m)) continue;

      const msgId = m.id?._serialized || m.id;
      const dados = garantirSemanaAtual(carregarLista());
      if (dados.ultimaListaMsgId === msgId) {
        return { importado: false, dados, jaSincronizada: true };
      }

      const resultado = importarListaDoTexto(corpo, msgId);
      return { importado: resultado.ok, dados: resultado.dados, resultado };
    }

    return {
      importado: false,
      dados: garantirSemanaAtual(carregarLista()),
      nenhumaListaSemana: true,
    };
  } catch (err) {
    console.warn("⚠️ Falha ao sincronizar lista do grupo:", err.message);
    return { importado: false, dados: carregarLista() };
  }
}

function formatarLista(dados) {
  const dataFut = formatarDataQuinta(getQuintaDaSemana());
  const linhas = [`*LISTA FUT ${dataFut}*`, ""];

  for (let i = 0; i < TOTAL_JOGADORES; i++) {
    linhas.push(`${i + 1}- ${dados.jogadores[i] || ""}`.trimEnd());
  }

  linhas.push("", "*GOLEIROS*", "");
  GOLEIROS.forEach((nome, i) => {
    linhas.push(`${i + 1} - ${nome}`);
  });

  linhas.push("", "*Suplentes*", "");
  for (let i = 0; i < TOTAL_SUPLENTES; i++) {
    const nome = dados.suplentes[i] || "";
    const ehAvulso = Object.values(dados.inscricoes).some(
      (ins) => ins.tipo === "suplente" && ins.slot === i && ins.avulso
    );
    const sufixo = nome && ehAvulso ? " (avulso)" : "";
    linhas.push(`${i + 1}- ${nome}${sufixo}`.trimEnd());
  }

  return linhas.join("\n");
}

function confirmarPresenca(userId, nome) {
  const dados = garantirSemanaAtual(carregarLista());

  if (!dados.inscricoes[userId] && nomeJaNaLista(dados, nome)) {
    const vinculo = vincularUsuarioPorNomeNaLista(dados, userId, nome);
    if (vinculo) {
      salvarLista(dados);
      const tipoLabel = vinculo.tipo === "suplente" ? "suplente" : "titular";
      return {
        ok: true,
        mensagem: `✅ ${nome}, você já estava na lista importada — vinculado como ${tipoLabel} ${vinculo.slot + 1}!`,
        listaFormatada: formatarLista(dados),
      };
    }
  }

  if (dados.inscricoes[userId]) {
    const insc = dados.inscricoes[userId];
    const { slot, tipo, nome: nomeSalvo } = insc;
    const posicao = slot + 1;
    const nomeNaLista =
      nomeSalvo ||
      (tipo === "suplente" ? dados.suplentes[slot] : dados.jogadores[slot]);
    const tipoLabel =
      tipo === "suplente"
        ? insc.avulso
          ? "avulso"
          : "suplente"
        : "titular";

    return {
      ok: false,
      mensagem: `ℹ️ ${nomeNaLista}, você já está confirmado na posição ${posicao} (${tipoLabel}).`,
      listaFormatada: formatarLista(dados),
    };
  }

  const slotTitular = dados.jogadores.findIndex((n) => !n);
  if (slotTitular !== -1) {
    dados.jogadores[slotTitular] = nome;
    dados.inscricoes[userId] = { tipo: "jogador", slot: slotTitular, nome };
    salvarLista(dados);
    return {
      ok: true,
      mensagem: `✅ ${nome}, presença confirmada na posição ${slotTitular + 1}!`,
      listaFormatada: formatarLista(dados),
    };
  }

  return {
    ok: false,
    mensagem:
      `❌ Lista de titulares lotada.\n` +
      `${nome}, use *avulso* para entrar como suplente ou *avulso Nome* para incluir alguém.`,
    listaFormatada: formatarLista(dados),
  };
}

function confirmarAvulso(solicitanteId, solicitanteNome, nomeTerceiro = null) {
  const dados = garantirSemanaAtual(carregarLista());
  const ehTerceiro = Boolean(nomeTerceiro?.trim());
  const nomeLista = ehTerceiro ? nomeTerceiro.trim() : solicitanteNome;
  const chave = ehTerceiro ? chaveAvulso(nomeLista) : solicitanteId;

  if (nomeJaNaLista(dados, nomeLista)) {
    return {
      ok: false,
      mensagem: `ℹ️ ${nomeLista} já está na lista desta semana.`,
      listaFormatada: formatarLista(dados),
    };
  }

  if (dados.inscricoes[chave]) {
    const { slot } = dados.inscricoes[chave];
    return {
      ok: false,
      mensagem: `ℹ️ ${nomeLista} já está nos suplentes (posição ${slot + 1}).`,
      listaFormatada: formatarLista(dados),
    };
  }

  if (!ehTerceiro && dados.inscricoes[solicitanteId]) {
    const insc = dados.inscricoes[solicitanteId];
    const tipoLabel = insc.tipo === "suplente" ? "suplente/avulso" : "titular";
    return {
      ok: false,
      mensagem: `ℹ️ ${solicitanteNome}, você já está na lista como ${tipoLabel}. Use *fora* antes de entrar como avulso.`,
      listaFormatada: formatarLista(dados),
    };
  }

  const slotSuplente = dados.suplentes.findIndex((n) => !n);
  if (slotSuplente === -1) {
    return {
      ok: false,
      mensagem: `❌ Suplentes lotados. Não foi possível adicionar ${nomeLista} como avulso.`,
      listaFormatada: formatarLista(dados),
    };
  }

  dados.suplentes[slotSuplente] = nomeLista;
  dados.inscricoes[chave] = {
    tipo: "suplente",
    slot: slotSuplente,
    nome: nomeLista,
    avulso: true,
    ...(ehTerceiro && {
      adicionadoPor: solicitanteId,
      adicionadoPorNome: solicitanteNome,
    }),
  };
  salvarLista(dados);

  const mensagem = ehTerceiro
    ? `✅ ${solicitanteNome} adicionou ${nomeLista} como avulso (suplente ${slotSuplente + 1})!`
    : `✅ ${nomeLista} confirmado como avulso (suplente ${slotSuplente + 1})!`;

  return {
    ok: true,
    mensagem,
    listaFormatada: formatarLista(dados),
  };
}

function desconfirmarPresenca(userId, nomeSolicitante, nomeAlvo = null) {
  const dados = garantirSemanaAtual(carregarLista());

  if (nomeAlvo?.trim()) {
    const alvo = nomeAlvo.trim();
    const encontrado = encontrarInscricaoPorNome(dados, alvo);

    if (encontrado) {
      const { key, insc } = encontrado;
      const posicao = insc.slot + 1;
      const tipoLabel =
        insc.tipo === "suplente"
          ? insc.avulso
            ? "avulso"
            : "suplente"
          : "titular";

      limparSlot(dados, insc);
      delete dados.inscricoes[key];
      salvarLista(dados);

      return {
        ok: true,
        mensagem: `❌ ${nomeSolicitante} removeu ${alvo} da lista (${tipoLabel} ${posicao}).`,
        listaFormatada: formatarLista(dados),
      };
    }

    if (removerNomeDasListas(dados, alvo)) {
      salvarLista(dados);
      return {
        ok: true,
        mensagem: `❌ ${nomeSolicitante} removeu ${alvo} da lista importada.`,
        listaFormatada: formatarLista(dados),
      };
    }

    return {
      ok: false,
      mensagem: `ℹ️ ${alvo} não está na lista desta semana.`,
      listaFormatada: formatarLista(dados),
    };
  }

  if (!dados.inscricoes[userId]) {
    if (removerNomeDasListas(dados, nomeSolicitante)) {
      salvarLista(dados);
      return {
        ok: true,
        mensagem: `❌ ${nomeSolicitante}, presença cancelada na lista importada.`,
        listaFormatada: formatarLista(dados),
      };
    }

    return {
      ok: false,
      mensagem: `ℹ️ ${nomeSolicitante}, você não está na lista desta semana.`,
      listaFormatada: formatarLista(dados),
    };
  }

  const insc = dados.inscricoes[userId];
  const posicao = insc.slot + 1;
  limparSlot(dados, insc);
  delete dados.inscricoes[userId];
  salvarLista(dados);

  return {
    ok: true,
    mensagem: `❌ ${nomeSolicitante}, presença cancelada (posição ${posicao} liberada).`,
    listaFormatada: formatarLista(dados),
  };
}

module.exports = {
  confirmarPresenca,
  confirmarAvulso,
  desconfirmarPresenca,
  formatarLista,
  carregarLista,
  garantirSemanaAtual,
  getQuintaDaSemana,
  getInicioCiclo,
  pareceListaFut,
  podeImportarLista,
  importarListaDoTexto,
  sincronizarUltimaListaDoGrupo,
};
