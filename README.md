# Chatbot WhatsApp — Lista de presença FUT

Bot para **grupo de WhatsApp** que gerencia a lista de presença do futebol semanal (toda **quinta-feira**). Os jogadores confirmam ou cancelam presença por palavras-chave; avulsos entram na seção **Suplentes**.

## Tecnologias

| Camada | Tecnologia |
|--------|------------|
| Runtime | Node.js 18+ |
| WhatsApp | [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) (WhatsApp Web, **não** é a API oficial da Meta) |
| Navegador | Puppeteer + Chromium |
| Sessão | `LocalAuth` (pasta `.wwebjs_auth`) |
| Dados | JSON (`lista-presenca.json`) |
| Config | `dotenv` (`.env`) |

> **Nota:** Este projeto **não** usa WhatsApp Cloud API. Funciona como um “aparelho conectado” via QR Code, igual ao WhatsApp Web no navegador.

## Funcionalidades

- Respostas **apenas no grupo** configurado em `GRUPO_ID`
- Lista com **15 titulares**, **4 suplentes** e goleiros fixos (França, Reginaldo)
- Reset automático da lista toda **quinta-feira às 00:00** (fuso `America/Sao_Paulo`)
- Data exibida na lista: **próxima quinta-feira** do calendário (lógica original)
- **Avulsos** sempre na seção Suplentes
- Inclusão de terceiros: `avulso Nome` (ex.: Erik adiciona Vitor)
- Remoção de terceiros: `fora Nome`
- **Importar lista colada**: lê a última `LISTA FUT` enviada no grupo e usa como base

## Comandos no grupo

| Comando | Ação |
|---------|------|
| `dentro` | Confirma presença na lista de **titulares** (vagas 1–15) |
| `avulso` | Você entra como **avulso** em Suplentes |
| `avulso Vitor` | Adiciona **Vitor** como avulso em Suplentes |
| `fora` | Remove sua própria inscrição |
| `fora Vitor` | Remove **Vitor** da lista |
| `lista` | Exibe a lista atual |
| `importar` | Busca a última LISTA FUT nas mensagens recentes do grupo |
| *(colar LISTA FUT)* | Atualiza a base automaticamente ao colar a lista no grupo |
| `idgrupo` | Mostra o ID do grupo (para configurar o `.env`) |

Sinônimos aceitos: `confirmar`, `sim`, `vou` (dentro); `cancelar`, `sair` (fora); `suplente` (avulso).

## Estrutura do projeto

```
chatbot/
├── chatbot.js           # Conexão WhatsApp, eventos, comandos
├── lista-presenca.js    # Regras da lista (dentro, fora, avulso)
├── lista-presenca.json  # Dados persistidos (gerado em runtime)
├── .env                 # GRUPO_ID (não versionar)
├── .env.example
├── ecosystem.config.cjs # PM2 (VPS)
├── Dockerfile           # Deploy com Docker
├── docker-compose.yml
├── reset-session.ps1    # Limpa sessão (Windows)
├── DEPLOY.md            # Guia detalhado de deploy na nuvem
└── package.json
```

## Instalação local

### Pré-requisitos

- [Node.js](https://nodejs.org/) 20 ou 22 (LTS recomendado; evite v24 se houver instabilidade)
- WhatsApp no celular para escanear o QR Code

### Passos

```bash
npm install
cp .env.example .env
```

Edite o `.env`:

```env
GRUPO_ID=120363411702597017@g.us
DEBUG=false
```

Inicie o bot:

```bash
npm start
# ou: node chatbot.js
```

1. Escaneie o **QR Code** exibido no terminal (WhatsApp → Aparelhos conectados → Conectar aparelho).
2. Aguarde `✅ Tudo certo! WhatsApp conectado.`
3. Se ainda não souber o ID do grupo, envie `idgrupo` no grupo e copie o valor para `GRUPO_ID`.
4. Reinicie o bot após alterar o `.env`.

### Scripts npm

| Script | Descrição |
|--------|-----------|
| `npm start` | Inicia o bot |
| `npm run reset` | Remove sessão e cache (Windows) |
| `npm run docker:up` | Sobe com Docker |
| `npm run docker:logs` | Logs do container |

## Lista colada (copiar e colar)

Se alguém colar no grupo uma mensagem no formato da lista, o bot **importa os nomes** e passa a usar essa base nos comandos `dentro`, `fora` e `avulso`.

Exemplo de formato reconhecido:

```
LISTA FUT 04/06

1- Júlio
2- Carlos
...
GOLEIROS
1 - França
2 - Reginaldo

Suplentes
1- Vitor (avulso)
```

Antes de cada comando, o bot também tenta sincronizar com a **última** LISTA FUT do histórico do grupo. Use `importar` para forçar a leitura.

## Exemplo de resposta

```
✅ Erik adicionou Vitor como avulso (suplente 1)!

LISTA FUT 04/06

1- Júlio
2-
...
GOLEIROS

1 - França
2 - Reginaldo

Suplentes

1- Vitor (avulso)
2-
...
```

## Configuração do grupo

O bot **ignora** mensagens fora do grupo definido em `GRUPO_ID`.

Para obter o ID:

1. Com o bot rodando, envie `idgrupo` no grupo desejado.
2. Copie o ID retornado para o `.env`.
3. Reinicie: `node chatbot.js`.

## Problemas comuns

| Problema | Solução |
|----------|---------|
| QR não aparece | Sessão já salva — veja se conectou; ou `npm run reset` |
| Vários QR Codes | Normal até escanear; use o mais recente |
| `browser is already running` | Feche outra instância do bot; `npm run reset` |
| Bot não responde no grupo | Confira `GRUPO_ID` no `.env` e reinicie |
| Timeout / lentidão | Feche Chrome extra; use Node LTS; em VPS use 2 GB+ RAM |

## Deploy 24/7 (nuvem)

Para rodar sem depender do PC, use um **VPS** com PM2 ou Docker.

- Guia completo: **[DEPLOY.md](./DEPLOY.md)**
- Plano sugerido: Hetzner **CX23** (~€ 4/mês, 4 GB RAM)
- PM2: `ecosystem.config.cjs`
- Docker: `docker compose up -d --build`

## Variáveis de ambiente

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `GRUPO_ID` | Sim | ID do grupo (`...@g.us`) |
| `DEBUG` | Não | `true` para logs extras no terminal |
| `SESSION_PATH` | Não | Pasta da sessão (padrão: `./.wwebjs_auth`) |
| `DATA_PATH` | Não | Pasta do `lista-presenca.json` |
| `PUPPETEER_EXECUTABLE_PATH` | Não | Caminho do Chromium (Linux/Docker) |

## Avisos

- Uso de **whatsapp-web.js** não é API oficial; há risco de desconexão ou restrição se violar termos do WhatsApp.
- Mantenha **uma única instância** do bot por número/sessão.
- Não commite `.env`, `.wwebjs_auth` nem `lista-presenca.json` com dados sensíveis.

## Links

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)
- [WhatsApp Cloud API (alternativa oficial)](https://developers.facebook.com/docs/whatsapp/cloud-api)
