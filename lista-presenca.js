const fs = require("fs");
const path = require("path");

const ARQUIVO_LISTA = path.join(
  process.env.DATA_PATH || __dirname,
  "lista-presenca.json"
);
const TOTAL_JOGADORES = 15;
const TOTAL_SUPLENTES = 4;

const GOLEIROS = ["França", "Reginaldo"];

function getQuintaDaSemana() {
  const agora = new Date();
  const dia = agora.getDay();
  const diferenca = dia <= 4 ? 4 - dia : 4 - dia + 7;
  const quinta = new Date(agora);
  quinta.setHours(12, 0, 0, 0);
  quinta.setDate(agora.getDate() + diferenca);
  return quinta;
}

function getSemanaReferencia() {
  return getQuintaDaSemana().toISOString().slice(0, 10);
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

function formatarLista(dados) {
  const dataFut = formatarDataQuinta(getQuintaDaSemana());
  const linhas = [`LISTA FUT ${dataFut}`, ""];

  for (let i = 0; i < TOTAL_JOGADORES; i++) {
    linhas.push(`${i + 1}- ${dados.jogadores[i] || ""}`.trimEnd());
  }

  linhas.push("", "GOLEIROS", "");
  GOLEIROS.forEach((nome, i) => {
    linhas.push(`${i + 1} - ${nome}`);
  });

  linhas.push("", "Suplentes", "");
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

    if (!encontrado) {
      return {
        ok: false,
        mensagem: `ℹ️ ${alvo} não está na lista desta semana.`,
        listaFormatada: formatarLista(dados),
      };
    }

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

  if (!dados.inscricoes[userId]) {
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
};
