# Deploy na nuvem (24/7)

Este bot usa **Chrome + WhatsApp Web** (`whatsapp-web.js`). Precisa de um servidor que rode **o tempo todo** (não serve serverless que “dorme”).

## Opções recomendadas

| Opção | Custo aprox. | Dificuldade | Indicado para |
|-------|----------------|-------------|----------------|
| **VPS + Docker** | R$ 25–50/mês | Média | Melhor custo/benefício |
| **VPS + PM2** | R$ 25–50/mês | Média | Quem prefere Linux direto |
| Railway / Render | ~US$ 5–15/mês | Fácil | Pode exigir plano pago (RAM) |
| PC de casa 24h | Grátis | Fácil | Não é nuvem, mas funciona |

Provedores de VPS: [Hetzner](https://www.hetzner.com), [DigitalOcean](https://www.digitalocean.com), [Contabo](https://contabo.com), [Hostinger VPS](https://www.hostinger.com.br/vps).

---

## Caminho 1 — Docker (recomendado)

### 1. Criar um VPS (Ubuntu 22/24)

- Mínimo: **1 GB RAM**, 1 vCPU  
- Acesso SSH

### 2. Instalar Docker no servidor

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# saia e entre de novo no SSH
```

### 3. Enviar o projeto para o servidor

No seu PC (Git ou SCP):

```bash
git clone SEU_REPOSITORIO
# ou: scp -r chatbot usuario@IP_DO_SERVIDOR:/home/usuario/
```

### 4. Configurar `.env` no servidor

```env
GRUPO_ID=120363411702597017@g.us
DEBUG=false
```

### 5. Subir o bot

```bash
cd chatbot
docker compose up -d --build
```

### 6. Escanear o QR (só na primeira vez)

```bash
docker compose logs -f
```

Escaneie o QR Code que aparecer nos logs. Depois que conectar, a sessão fica salva no volume `chatbot-data` e **não precisa escanear de novo** em reinícios normais.

### Comandos úteis

```bash
docker compose logs -f      # ver logs
docker compose restart    # reiniciar
docker compose down         # parar
docker compose up -d        # iniciar de novo
```

---

## Caminho 2 — VPS com PM2 (sem Docker)

### 1. No servidor Ubuntu

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs chromium-browser
```

### 2. Projeto e dependências

```bash
cd ~/chatbot
npm install
cp .env.example .env
# edite .env com GRUPO_ID
```

### 3. Variáveis para o Chromium do sistema

```bash
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
export SESSION_PATH=/home/usuario/chatbot/.wwebjs_auth
```

### 4. PM2

```bash
sudo npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 logs chatbot
```

Após escanear o QR:

```bash
pm2 save
pm2 startup
```

O bot sobe automaticamente se o servidor reiniciar.

---

## Primeira conexão na nuvem

1. Suba o bot e abra os **logs** (`docker compose logs -f` ou `pm2 logs`).  
2. Escaneie o QR com o WhatsApp do número do bot.  
3. Confirme `✅ Tudo certo! WhatsApp conectado.` nos logs.  
4. Teste `dentro` no grupo.

**Importante:** não apague a pasta/volume `.wwebjs_auth` — é a sessão logada.

---

## Migrar sessão do PC para a nuvem (opcional)

Se já conectou no PC e quer evitar novo QR:

1. Pare o bot no PC.  
2. Copie a pasta `.wwebjs_auth` para o servidor (no mesmo caminho do `SESSION_PATH`).  
3. Suba o bot na nuvem.

---

## Cuidados

- **Não use plano gratuito que hiberna** — o WhatsApp desconecta.  
- Mantenha **`.env` fora do Git** (já está no `.gitignore`).  
- `whatsapp-web.js` não é API oficial: evite spam; risco de bloqueio se abusar.  
- Para produção “empresarial”, considere migrar para **WhatsApp Cloud API (Meta)**.

---

## Atualizar o bot no servidor

```bash
cd chatbot
git pull
docker compose up -d --build
# ou: pm2 restart chatbot
```

A lista `lista-presenca.json` no volume/disco é preservada entre deploys.
