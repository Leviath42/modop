#!/usr/bin/env bash
# hardening-tunnel.sh — durcissement sécurité + tunnel Cloudflare pour Modop.
# À exécuter DANS le conteneur (CT Proxmox), en root.
#
# Usage :
#   bash scripts/hardening-tunnel.sh                    # tout : durcissement + tunnel
#   bash scripts/hardening-tunnel.sh --security-only    # durcissement uniquement
#   bash scripts/hardening-tunnel.sh --tunnel-only      # tunnel uniquement
#
# Prérequis tunnel :
#   - un domaine géré par Cloudflare (ex. mondomaine.fr)
#   - le premier lancement ouvre un lien de login Cloudflare (navigateur)
#
# Ce que fait le script :
#   1. Cookies sécurisés + sessions courtes (environnement pm2 persistant)
#   2. Pare-feu local minimal : seuls SSH (22) et le trafic établi sont
#      acceptés ; le port 3000 reste inaccessible depuis l'extérieur du CT —
#      tout passe par le tunnel Cloudflare (sortie HTTPS, zéro port ouvert)
#   3. Installation de cloudflared, création du tunnel "modop", DNS,
#      configuration, service systemd, healthcheck via l'URL publique
#
# IMPORTANT (non automatisable en CLI) : activez Cloudflare Access sur
# l'hôte modop.<domaine> dans le dashboard Cloudflare (Zero Trust > Access >
# Applications) pour exiger une authentification avant d'atteindre Modop.

set -euo pipefail

APP_DIR="/opt/modop"
TUNNEL_NAME="modop"
CF_DOMAIN="${CF_DOMAIN:-}"
CF_HOSTNAME="${CF_HOSTNAME:-}"
SECURITY_ONLY=0
TUNNEL_ONLY=0

[ "${1:-}" = "--security-only" ] && SECURITY_ONLY=1
[ "${1:-}" = "--tunnel-only" ] && TUNNEL_ONLY=1

log() { printf '[setup] %s\n' "$*"; }
die() { printf '[setup] ERREUR : %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "à exécuter en root dans le conteneur"
[ -d "$APP_DIR" ] || die "$APP_DIR introuvable — installez d'abord via scripts/proxmox-install.sh"

# ---------------------------------------------------------------------------
# 1. Durcissement application
# ---------------------------------------------------------------------------
if [ "$TUNNEL_ONLY" = "0" ]; then
  log "durcissement : cookies sécurisés + sessions 12 h (pm2 env persistant)"
  ECO="$APP_DIR/server/ecosystem.config.cjs"
  if [ -f "$ECO" ] && ! grep -q "MODOP_SECURE_COOKIES" "$ECO"; then
    python3 - "$ECO" <<'PYEOF'
import re, sys
p = sys.argv[1]
s = open(p).read()
s = s.replace('        PORT: process.env.PORT ?? "3000",',
'''        PORT: process.env.PORT ?? "3000",
        MODOP_SECURE_COOKIES: "1",
        MODOP_SESSION_TTL_HOURS: "12",''')
open(p, "w").write(s)
print("ecosystem: secure cookies + TTL sessions 12 h")
PYEOF
  fi

  log "durcissement : pare-feu local (ufw si disponible, sinon nftables)"
  if command -v ufw >/dev/null 2>&1; then
    ufw --force reset >/dev/null
    ufw default deny incoming >/dev/null
    ufw default allow outgoing >/dev/null
    ufw allow 22/tcp >/dev/null      # SSH entrant
    ufw --force enable >/dev/null
    log "ufw actif : entrant limité à SSH, sortant libre (tunnel inclus)"
  else
    # nftables minimal : politique par défaut identique
    nft list table inet filter >/dev/null 2>&1 || true
    cat > /etc/nftables.conf <<'NFT'
table inet filter {
  chain input {
    type filter hook input priority 0; policy drop;
    ct state established,related accept
    iif "lo" accept
    tcp dport 22 accept
    ip protocol icmp accept
  }
  chain forward { type filter hook forward priority 0; policy drop; }
  chain output { type filter hook output priority 0; policy accept; }
}
NFT
    systemctl enable nftables >/dev/null 2>&1 || true
    systemctl restart nftables >/dev/null 2>&1 || nft -f /etc/nftables.conf
    log "nftables actif : entrant limité à SSH, sortant libre"
  fi

  log "durcissement : sshd (PasswordAuthentication conservé sur LAN, root sans mot de passe si clés présentes)"
  if [ -n "$(find /root/.ssh -name 'authorized_keys' -size +0c 2>/dev/null)" ]; then
    sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config || true
    systemctl reload sshd 2>/dev/null || service ssh reload 2>/dev/null || true
    log "sshd : clés détectées, mots de passe SSH désactivés"
  else
    log "sshd : aucune clé détectée, mots de passe conservés (ajoutez une clé SSH ensuite)"
  fi

  log "relance de l'application avec le nouvel environnement"
  pm2 delete modop >/dev/null 2>&1 || true
  pm2 start "$APP_DIR/server/ecosystem.config.cjs" >/dev/null
  pm2 save >/dev/null
  sleep 2
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health || true)
  [ "$CODE" = "200" ] || die "l'application ne répond plus (HTTP $CODE) — pm2 logs modop"
  log "application redémarrée, healthcheck 200"
fi

[ "$SECURITY_ONLY" = "1" ] && { log "durcissement terminé (--security-only)"; exit 0; }

# ---------------------------------------------------------------------------
# 2. Tunnel Cloudflare
# ---------------------------------------------------------------------------
log "installation de cloudflared"
if ! command -v cloudflared >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL --retry 3 https://pkg.cloudflare.com/cloudflare-main.gpg \
      -o /usr/share/keyrings/cloudflare-main.gpg
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" \
      > /etc/apt/sources.list.d/cloudflared.list
    apt-get update -qq && apt-get install -y -qq cloudflared >/dev/null
  else
    die "apt indisponible — installez cloudflared manuellement : https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  fi
fi
cloudflared --version

# Login si nécessaire (ouvre un lien à valider dans le navigateur)
if [ ! -d /root/.cloudflared ] || [ ! -f /root/.cloudflared/cert.pem ]; then
  log "login Cloudflare requis — ouvrez le lien affiché et autorisez le domaine"
  cloudflared tunnel login
fi

# Domaine
if [ -z "$CF_DOMAIN" ]; then
  read -rp "Votre domaine Cloudflare (ex. mondomaine.fr) : " CF_DOMAIN
fi
[ -n "$CF_DOMAIN" ] || die "domaine requis"
if [ -z "$CF_HOSTNAME" ]; then
  read -rp "Sous-domaine pour Modop (défaut : modop) : " CF_HOSTNAME
  CF_HOSTNAME="${CF_HOSTNAME:-modop}"
fi
FQDN="$CF_HOSTNAME.$CF_DOMAIN"
log "hôte public cible : $FQDN"

# Tunnel
if ! cloudflared tunnel info "$TUNNEL_NAME" >/dev/null 2>&1; then
  cloudflared tunnel create "$TUNNEL_NAME"
  log "tunnel $TUNNEL_NAME créé"
fi
TUNNEL_ID=$(cloudflared tunnel info "$TUNNEL_NAME" 2>/dev/null | grep -oE '[a-f0-9-]{36}' | head -1)
[ -n "$TUNNEL_ID" ] || die "identifiant du tunnel introuvable"
CRED="/root/.cloudflared/$TUNNEL_ID.json"

# DNS
cloudflared tunnel route dns "$TUNNEL_NAME" "$FQDN" 2>/dev/null \
  || log "route DNS déjà présente (ok)"

# Configuration
cat > /root/.cloudflared/config.yml <<YML
tunnel: $TUNNEL_ID
credentials-file: $CRED
originRequest:
  connectTimeout: 10s
  httpHostHeader: localhost
ingress:
  - hostname: $FQDN
    service: http://localhost:3000
    originRequest:
      httpHostHeader: localhost
  - service: http_status:404
YML
log "configuration écrite (/root/.cloudflared/config.yml)"

# Service systemd (redémarrage automatique)
cloudflared service install >/dev/null 2>&1 || true
systemctl enable cloudflared >/dev/null 2>&1 || true
systemctl restart cloudflared || service cloudflared restart || die "service cloudflared impossible à démarrer"
sleep 5
systemctl is-active cloudflared >/dev/null 2>&1 && log "service cloudflared actif" || die "cloudflared inactif — journalctl -u cloudflared"

# Healthcheck via le tunnel (peut nécessiter quelques secondes de propagation DNS)
log "healthcheck via le tunnel (propagation DNS possible)"
CODE=000
for _ in 1 2 3 4 5 6 7 8 9 10; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$FQDN/api/health" || true)
  [ "$CODE" = "200" ] && break
  sleep 5
done
if [ "$CODE" = "200" ]; then
  log "healthcheck public : https://$FQDN → 200"
else
  log "ATTENTION : HTTP $CODE sur https://$FQDN (propagation DNS ? testez dans 1-2 min)"
fi

cat <<MSG

=========================================================
 Modop est en ligne : https://$FQDN

 FAITES MAINTENANT (dashboard Cloudflare, non automatisable) :
 1. Zero Trust > Access > Applications > Add > Self-hosted
    - Domaine : $FQDN
    - Policy : Allow > Emails autorisés (les vôtres)
    → protège l'app par une authentification Cloudflare
 2. SSL/TLS : mode "Full" recommandé.

 Pare-feu : entrant limité à SSH — le port 3000 n'est PAS
 exposé, tout passe par le tunnel (connexion sortante).
=========================================================
MSG
