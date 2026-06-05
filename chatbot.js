// =====================================
// IMPORTAÇÕES
// =====================================
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const {
  confirmarPresenca,
  confirmarAvulso,
  desconfirmarPresenca,
  formatarLista,
  carregarLista,
  garantirSemanaAtual,
  pareceListaFut,
  podeImportarLista,
  importarListaDoTexto,
  sincronizarUltimaListaDoGrupo,
} = require("./lista-presenca");

// =====================================
// GRUPO PERMITIDO (somente este grupo)
// =====================================
function normalizarGrupoId(id) {
  if (!id) return null;
  const limpo = id.trim().replace(/^["']+/, "").replace(/["';]+$/g, "");
  if (limpo.endsWith("@g.us")) return limpo;
  return `${limpo}@g.us`;
}

// Aceita GRUPO_ID ou ID_GRUPO (nome que alguns usam por engano)
const GRUPO_ID = normalizarGrupoId(
  process.env.GRUPO_ID || process.env.ID_GRUPO
);

const DEBUG = process.env.DEBUG === "true";

// =====================================
// CONFIGURAÇÃO DO CLIENTE
// =====================================
const puppeteerArgs = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-features=IsolateOrigins,site-per-process,MemorySaverMode",
  "--memory-pressure-off",
];

if (process.env.PUPPETEER_EXECUTABLE_PATH) {
  puppeteerArgs.push("--disable-software-rasterizer");
}

const isLinux = process.platform === 'linux';

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    ...(isLinux && {
      executablePath: '/usr/bin/chromium-browser'
    }),
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  }
});

let contadorQr = 0;

// =====================================
// QR CODE
// =====================================
client.on("qr", (qr) => {
  contadorQr += 1;
  console.log(`\n📲 QR Code (${contadorQr}) — escaneie o mais recente no WhatsApp:\n`);
  qrcode.generate(qr, { small: true });
});

// =====================================
// WHATSAPP CONECTADO
// =====================================
client.on("ready", async () => {
  garantirSemanaAtual(carregarLista());
  console.log("✅ Tudo certo! WhatsApp conectado.");
  console.log(
    "📋 Comandos: dentro | avulso | fora | lista | importar | (colar LISTA FUT)"
  );

  if (!GRUPO_ID) {
    console.warn("\n⚠️  GRUPO_ID não definido no arquivo .env");
    console.warn("    Crie o arquivo .env na pasta do projeto (não use só o .env.example)");
    console.warn('    Exemplo: GRUPO_ID=120363411702597017@g.us');
    console.warn('    Envie "idgrupo" no grupo desejado para obter o ID.\n');

    try {
      const chats = await client.getChats();
      const grupos = chats.filter((c) => c.isGroup);
      if (grupos.length > 0) {
        console.log("Grupos encontrados:");
        grupos.forEach((g) => {
          console.log(`  • ${g.name}: ${g.id._serialized}`);
        });
        console.log("");
      }
    } catch (err) {
      console.warn("Não foi possível listar grupos:", err.message);
    }
  } else {
    try {
      const chat = await client.getChatById(GRUPO_ID);
      console.log(`📌 Grupo ativo: ${chat.name || GRUPO_ID}`);
    } catch {
      console.log(`📌 Grupo ativo (ID): ${GRUPO_ID}`);
    }
  }
});

// =====================================
// DESCONEXÃO
// =====================================
client.on("disconnected", (reason) => {
  console.log("⚠️ Desconectado:", reason);
});

client.on("auth_failure", (msg) => {
  console.error("❌ Falha na autenticação:", msg);
});

// =====================================
// INICIALIZA
// =====================================
client.initialize().catch((error) => {
  console.error("❌ Erro ao iniciar o WhatsApp Web:", error.message);

  if (error.message.includes("already running")) {
    console.error(
      "\nOutra instância do Chrome/bot ainda usa a pasta de sessão.\n" +
        "Execute: npm run reset\nDepois: node chatbot.js\n"
    );
  } else {
    console.error("\nTente: npm run reset && node chatbot.js\n");
  }

  process.exit(1);
});

// =====================================
// HELPERS
// =====================================
function comTimeout(promise, ms, fallback = null) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function obterNomeRapido(msg) {
  return (
    msg._data?.notifyName ||
    msg._data?.pushname ||
    (typeof msg._data?.author === "object" ? msg._data?.author?.name : null) ||
    null
  );
}

async function obterNomeNoGrupo(msg, userId) {
  try {
    const chat = await comTimeout(client.getChatById(msg.from), 8000, null);
    if (!chat?.isGroup) return null;

    const participante = chat.participants?.find((p) => {
      const id = p.id?._serialized || p.id;
      return id === userId;
    });

    if (!participante) return null;

    const contato = participante.contact || participante;
    return (
      contato.pushname ||
      contato.name ||
      contato.shortName ||
      participante.name ||
      null
    );
  } catch {
    return null;
  }
}

async function obterNomeUsuario(msg, userId) {
  const nomeRapido = obterNomeRapido(msg);
  if (nomeRapido?.trim()) return nomeRapido.trim();

  const nomeGrupo = await obterNomeNoGrupo(msg, userId);
  if (nomeGrupo?.trim()) return nomeGrupo.trim();

  const contato = await comTimeout(
    client.getContactById(userId),
    8000,
    null
  );
  if (contato) {
    const nome =
      contato.pushname || contato.name || contato.shortName || null;
    if (nome?.trim()) return nome.trim();
  }

  const contatoMsg = await comTimeout(msg.getContact(), 8000, null);
  if (contatoMsg) {
    const nome =
      contatoMsg.pushname || contatoMsg.name || contatoMsg.shortName || null;
    if (nome?.trim()) return nome.trim();
  }

  return "Jogador";
}

async function enviarResposta(msg, texto) {
  await client.sendMessage(msg.from, texto);
}

let filaMensagens = Promise.resolve();

function processarNaFila(tarefa) {
  filaMensagens = filaMensagens
    .then(tarefa)
    .catch((err) => console.error("❌ Erro na fila:", err.message || err));
  return filaMensagens;
}

function analisarMensagem(texto) {
  const bruto = texto.trim();
  const lower = bruto.toLowerCase().replace(/[!.,?…]+$/g, "");
  const partes = bruto.split(/\s+/);
  const palavra = partes[0].toLowerCase();
  const resto = partes.slice(1).join(" ").trim() || null;

  if (/^(dentro|confirmar|confirmo)$/i.test(palavra)) {
    return { comando: "dentro", nomeAlvo: null };
  }
  if (/^(fora|desconfirmar|cancelar|sair|)$/i.test(palavra)) {
    return { comando: "fora", nomeAlvo: resto };
  }
  if (/^(lista|listar)$/i.test(lower)) {
    return { comando: "lista", nomeAlvo: null };
  }
  if (/^(avulso|suplente)$/i.test(palavra)) {
    return { comando: "avulso", nomeAlvo: resto };
  }
  if (/^(idgrupo)$/i.test(palavra) || lower === "id do grupo") {
    return { comando: "idgrupo", nomeAlvo: null };
  }
  if (/^(importar|sync|sincronizar)$/i.test(palavra)) {
    return { comando: "importar", nomeAlvo: null };
  }

  return null;
}

function obterIdParticipante(msg) {
  return (
    msg.author ||
    msg.id?.participant ||
    msg._data?.author?._serialized ||
    msg._data?.author ||
    null
  );
}

function ehGrupoPermitido(msg) {
  const idGrupo = msg.from;
  return idGrupo === GRUPO_ID;
}

// =====================================
// MENSAGENS — APENAS NO GRUPO CONFIGURADO
// =====================================
client.on("message", (msg) => {
  processarNaFila(async () => {
    if (msg.type !== "chat") return;

    const texto = msg.body || "";
    const ehGrupo = msg.from.endsWith("@g.us");
    const noGrupoAtivo = ehGrupo && GRUPO_ID && ehGrupoPermitido(msg);

    // Lista colada no grupo — só da semana atual (quinta 00:00 em diante)
    if (noGrupoAtivo && pareceListaFut(texto) && !analisarMensagem(texto)) {
      if (!podeImportarLista(texto, msg)) {
        if (DEBUG) {
          console.log("[debug] Lista ignorada (semana antiga ou data diferente)");
        }
        return;
      }

      const msgId = msg.id?._serialized || msg.id;
      const dadosAtual = garantirSemanaAtual(carregarLista());
      if (dadosAtual.ultimaListaMsgId !== msgId) {
        const resultado = importarListaDoTexto(texto, msgId);
        console.log(
          `📋 Lista importada (${msg.fromMe ? "bot" : "membro"}): ${resultado.mensagem}`
        );
      }
      return;
    }

    if (msg.fromMe) return;

    const parsed = analisarMensagem(texto);
    if (!parsed) return;

    const { comando, nomeAlvo } = parsed;

    if (DEBUG) {
      console.log("[debug]", {
        comando,
        de: msg.from,
        autor: obterIdParticipante(msg),
        texto,
      });
    }

    if (comando === "idgrupo") {
      if (!ehGrupo) {
        await enviarResposta(
          msg,
          "⚠️ Envie idgrupo dentro do grupo de futebol para obter o ID."
        );
        return;
      }

      await enviarResposta(
        msg,
        `🆔 ID deste grupo:\n\n${msg.from}\n\n` +
          `Copie para o arquivo .env:\nGRUPO_ID=${msg.from}`
      );
      return;
    }

    if (!GRUPO_ID) {
      console.warn(
        "⚠️ Comando ignorado: defina GRUPO_ID no arquivo .env e reinicie o bot."
      );
      return;
    }

    if (!ehGrupo) return;

    if (!ehGrupoPermitido(msg)) {
      if (DEBUG) {
        console.log(
          `[debug] Grupo errado. Esperado: ${GRUPO_ID} | Recebido: ${msg.from}`
        );
      }
      return;
    }

    const userId = obterIdParticipante(msg);
    if (!userId) {
      console.warn(
        "⚠️ Não foi possível identificar quem enviou a mensagem no grupo."
      );
      return;
    }

    const nome = await obterNomeUsuario(msg, userId);

    let resposta;

    if (comando === "importar") {
      const sync = await sincronizarUltimaListaDoGrupo(client, GRUPO_ID, 100);
      if (sync.importado && sync.resultado) {
        resposta = `${sync.resultado.mensagem}\n\n${sync.resultado.listaFormatada}`;
      } else if (sync.jaSincronizada) {
        const dados = garantirSemanaAtual(carregarLista());
        resposta = `ℹ️ Lista desta semana já estava sincronizada.\n\n${formatarLista(dados)}`;
      } else {
        const quinta = formatarLista(garantirSemanaAtual(carregarLista())).split("\n")[0];
        resposta =
          `⚠️ Nenhuma LISTA FUT *desta semana* no histórico do grupo.\n` +
          `Procuro listas com cabeçalho igual a: ${quinta}\n` +
          `enviadas após quinta-feira 00:00.\n\n` +
          `Use *dentro* para começar lista vazia ou cole a lista atualizada no grupo.`;
      }
    } else if (comando === "dentro") {
      const resultado = confirmarPresenca(userId, nome);
      resposta = `${resultado.mensagem}\n\n${resultado.listaFormatada}`;
    } else if (comando === "avulso") {
      const resultado = confirmarAvulso(userId, nome, nomeAlvo);
      resposta = `${resultado.mensagem}\n\n${resultado.listaFormatada}`;
    } else if (comando === "fora") {
      const resultado = desconfirmarPresenca(userId, nome, nomeAlvo);
      resposta = `${resultado.mensagem}\n\n${resultado.listaFormatada}`;
    } else if (comando === "lista") {
      const dados = garantirSemanaAtual(carregarLista());
      resposta = formatarLista(dados);
    }

    const logAlvo = nomeAlvo ? ` → ${nomeAlvo}` : "";
    console.log(`📋 ${comando}${logAlvo} por ${nome} (${userId})`);
    console.log("📤 Enviando resposta no grupo...");

    await enviarResposta(msg, resposta);

    console.log("✅ Resposta enviada no grupo");
  });
});
