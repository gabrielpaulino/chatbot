// PM2 — uso em VPS Linux (sem Docker)
// Instale: npm i -g pm2
// Inicie:  pm2 start ecosystem.config.cjs
// Logs:    pm2 logs chatbot
// Boot:    pm2 startup && pm2 save

module.exports = {
  apps: [
    {
      name: "chatbot",
      script: "chatbot.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
