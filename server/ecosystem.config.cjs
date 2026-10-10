// Configuration pm2 pour le déploiement conteneur (CT Proxmox).
// Lancement : pm2 start /opt/modop/server/ecosystem.config.cjs
// HOST 0.0.0.0 : accès depuis le LAN (le CT est isolé par le réseau Proxmox ;
// pour un accès plus restreint, voir docs/durcissement-securite.md — reverse
// proxy + pare-feu, le backend peut alors repasser sur 127.0.0.1).
module.exports = {
  apps: [
    {
      name: "modop",
      cwd: __dirname,
      script: "node",
      args: "dist/index.js",
      env: {
        HOST: process.env.MODOP_HOST ?? "0.0.0.0",
        PORT: process.env.PORT ?? "3000",
      },
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
