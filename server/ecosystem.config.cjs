// Configuration pm2 — lançable depuis n'importe quel répertoire :
//   pm2 start /opt/modop/server/ecosystem.config.cjs
// Le cwd est figé ici, donc "npm start" s'exécute toujours dans server/.
module.exports = {
  apps: [
    {
      name: "modop",
      cwd: __dirname,
      script: "node",
      args: "dist/index.js",
      env: {
        PORT: process.env.PORT ?? "3000",
      },
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
