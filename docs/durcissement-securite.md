# Durcissement sécurité — guide de configuration

## État par défaut (mode dev / faible)

Sans configuration, Modop utilise l'auth maison (bcrypt), les cookies `sameSite=lax` non-secure, et le déploiement distant est **actif**. C'est le mode développement.

## Mode production (règles d'entreprise)

### 1. Variables d'environnement serveur

| Variable | Effet | Valeur prod |
|---|---|---|
| `MODOP_OIDC_ISSUER` | Active le SSO (tout fournisseur OIDC : Entra ID, Keycloak, Google…) | `https://sso.entreprise.fr` |
| `MODOP_OIDC_CLIENT_ID` | Client enregistré chez l'émetteur | fourni par l'IdP |
| `MODOP_OIDC_CLIENT_SECRET` | Si client confidentiel (sinon PKCE public) | fourni par l'IdP |
| `MODOP_OIDC_REDIRECT` | Callback Modop | `https://modop.entreprise.fr/api/auth/oidc/callback` |
| `MODOP_OIDC_ROLE_CLAIM` | Claim contenant les groupes | `groups` / `roles`… |
| `MODOP_OIDC_ADMIN_GROUP` / `_AUTHOR_GROUP` | Valeurs du claim → rôles | ex. `modop-admin` |
| `MODOP_SECURE_COOKIES` | Cookies `secure` (derrière TLS) | `1` |
| `MODOP_SESSION_TTL_HOURS` | Durée de session | `24` |
| `MODOP_ALLOWED_HOSTS` | Allowlist des hôtes acceptés dans `X-Forwarded-Host` (anti-CSRF derrière proxy/tunnel), séparés par des virgules. Vide = aucun contrôle (comportement historique) | — |
| `MODOP_DEPLOY` | `off` désactive totalement /api/deploy (statut inclus) | `off` en prod stricte |
| `MODOP_TOTP_SECRET` | Active la MFA TOTP sur le login local des **admins** (secret base32) — **transitoire** : ne pas activer tant que l'UI de login n'offre pas le champ code (vague 10) ; le login SSO est exempté | secret base32 aléatoire (ex. 20 octets) |

Le SSO est **générique** : aucun fournisseur codé en dur, tout passe par OIDC Discovery. En mode SSO, les mots de passe locaux sont ignorés pour ces comptes (`change-password` refusé) ; le login maison reste disponible en fallback si l'IdP tombe.

**MFA TOTP (v1.7 — transitoire)** : `MODOP_TOTP_SECRET` exige un code TOTP à 6 chiffres pour le login local des comptes **admin** — vérifié après le mot de passe, couvert par le rate-limit login, échecs tracés dans l'audit (`login_mfa_echec`). Mesure transitoire à **secret global partagé** : la version par compte (QR à l'activation, code de secours, anti-replay, auteur optionnel) est planifiée en **vague 10** (issue #9). **Attention** : l'UI de login n'envoie actuellement que email/mot de passe — activer la variable bloque les admins hors de l'interface ; à ne poser qu'une fois le front adapté.

### 2. Reverse proxy TLS

Voir `ops/Caddyfile` : TLS interne, HSTS, en-têtes. Le backend n'écoute que sur `127.0.0.1:3000`.

### 3. Ce qui est déjà actif sans configuration

- Sessions expirantes (24 h par défaut, purge au démarrage) ;
- Rate-limit login : 10 essais / 15 min par IP+email (429 ensuite) ;
- En-têtes : CSP, X-Frame-Options DENY, nosniff, Referrer-Policy ;
- Audit log : login, login échoué, SSO, création/suppression, publication, export — table `audit_log` (conservée 1 an, dans les sauvegardes) ;
- `/api/deploy` : verrouillé par rôle + désactivable entièrement ;
- Conteneur non privilégié, aucune donnée envoyée à un tiers.

### 4. Sauvegardes chiffrées (recommandation)

Les sauvegardes de `update.sh` sont en clair dans le conteneur. En production : export chiffré hors CT, par exemple via cron :

```bash
# /etc/cron.daily/modop-backup (dans le CT)
cd /opt/modop/server
gpg --batch --yes --recipient backup@entreprise.fr -o /tmp/modop-$(date +%F).db.gpg -c modop.db 2>/dev/null || \
  openssl enc -aes-256-cbc -pbkdf2 -in modop.db -out /tmp/modop-$(date +%F).db.enc -pass file:/root/.backupkey
# puis rsync vers le serveur de sauvegarde
```

### 5. Point d'attention supply-chain

Décision (vague 9) : les **scripts d'installation de npm restent activés** (pas de `--ignore-scripts` sur `npm ci`). Rationale : `better-sqlite3` (binding natif) et `esbuild` (binaire, postinstall) en dépendent ; les désactiver casserait l'installation serveur. Compensation : lockfile racine versionné (`npm ci` reproduit exactement), Dependabot quotidien, **porte `npm audit --omit=dev --audit-level=high` en CI** (job `audit` de `.github/workflows/ci-cd.yml`).
