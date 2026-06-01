# Chatbot WhatsApp

Bot de exemplo para WhatsApp usando a **API oficial da Meta (WhatsApp Cloud API)** com Node.js e Express.

## Pré-requisitos

- [Node.js](https://nodejs.org/) 18 ou superior
- Conta no [Meta for Developers](https://developers.facebook.com/)
- Número de telefone para testes (pode ser o número de teste gratuito da Meta)

## Passo 1 — Criar app na Meta

1. Acesse [developers.facebook.com](https://developers.facebook.com/) e crie um app do tipo **Business**.
2. Adicione o produto **WhatsApp**.
3. Em **WhatsApp > API Setup**, anote:
   - **Phone number ID**
   - **Temporary access token** (depois gere um token permanente)
4. Em **WhatsApp > Configuration**, adicione seu número pessoal em **To** para poder enviar mensagens de teste.

## Passo 2 — Configurar o projeto

```bash
npm install
cp .env.example .env
```

Edite o arquivo `.env` com seus valores:

```env
WHATSAPP_TOKEN=seu_token
PHONE_NUMBER_ID=seu_phone_number_id
VERIFY_TOKEN=qualquer_string_secreta
PORT=3000
```

## Passo 3 — Expor o servidor local (ngrok)

A Meta precisa alcançar seu webhook pela internet. Em desenvolvimento, use [ngrok](https://ngrok.com/):

```bash
npm run dev
```

Em outro terminal:

```bash
ngrok http 3000
```

Copie a URL HTTPS gerada (ex.: `https://abc123.ngrok-free.app`).

## Passo 4 — Configurar o webhook na Meta

1. Vá em **WhatsApp > Configuration** no painel da Meta.
2. Em **Webhook**, clique em **Edit**.
3. Preencha:
   - **Callback URL:** `https://SUA-URL-NGROK/webhook`
   - **Verify token:** o mesmo valor de `VERIFY_TOKEN` no seu `.env`
4. Clique em **Verify and save**.
5. Inscreva-se no campo **messages**.

## Passo 5 — Testar

Envie uma mensagem do seu WhatsApp para o número de teste da Meta. O bot deve responder com o menu.

Comandos disponíveis:

| Mensagem | Resposta |
|----------|----------|
| `oi` / `olá` | Saudação |
| `menu` | Lista de opções |
| `horario` | Horário de atendimento |
| `ajuda` | Encaminha para atendente |
| `info` | Informações sobre o bot |

## Estrutura do projeto

```
src/
├── index.js      # Servidor Express
├── webhook.js    # Recebe e valida mensagens da Meta
├── whatsapp.js   # Envia mensagens via API
└── chatbot.js    # Lógica de respostas (edite aqui)
```

## Próximos passos

- Integrar IA (OpenAI, Claude, etc.) em `chatbot.js`
- Conectar a um banco de dados para histórico de conversas
- Adicionar botões e listas interativas (mensagens template)
- Migrar de ngrok para um servidor em produção (Railway, Render, AWS, etc.)

## Links úteis

- [Documentação WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Enviar mensagens](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages)
- [Webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks)
