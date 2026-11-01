# IA-TB Admin Control Center — Publication HTTPS sans OTP

**Cible :** https://ia.iatb.duckdns.org (DuckDNS).
**Statut de cette branche :** code disponible dans GitHub ; l'état réel du service GEN-1 exige une recette externe.
**Périmètre :** panneau ADMIN en lecture seule, sans opérations SSH, Docker, Key Vault, RELEASE ni approbations de permissions.

## Authentification et isolation

- Connexion avec compte `admin` et mot de passe de 16 caractères minimum, hashé avec scrypt dans un fichier privé (0700/0600) hors Git.
- Pas de code TOTP/OTP, pas de QR et pas de `mfa.json` requis. Un ancien fichier TOTP éventuellement laissé sur disque est inutilisé ; ne pas le diffuser.
- Service Python sur `127.0.0.1:18083` seulement, sous `iatb-admin-panel` non privilégié.
- Sessions aléatoires opaques en mémoire, cookie `__Host-` Secure/HttpOnly/SameSite=Strict, expiration après 30 min d'inactivité / 8 h maximum.
- POST authentifiant protégé par Origine HTTPS exacte ; politique CSP stricte, protection des en-têtes, blocage temporaire après huit échecs de connexion sur cinq minutes.
- API de consultation authentifiée uniquement : les mutations d'administration répondent `405`. Les règles déclarées restent `DENIED_NO_CONTROLLER`.
- Caddy termine HTTPS et ne route pas publiquement `/healthz`. Pas d'accès direct WAN au port 18083.

**Risque assumé :** l'absence de second facteur diminue la résistance à la compromission du mot de passe. Utiliser un mot de passe unique de longueur élevée ; envisager une restriction IP/VPN si possible. Ne pas autoriser d'opérations privilégiées depuis cette UI sans réévaluer l'authentification.

## Situation réelle GEN-1

L'installation initiale a détecté `/opt/iatb-admin/AI Agent` et s'est arrêtée sans le remplacer. L'installation parallèle précédente est passée au-delà du DNS et du contrôle des sources, puis s'est arrêtée lors d'une demande TOTP avant Caddy. Le script corrigé ne demande plus de TOTP.

Ne pas effacer l'ancienne installation ni les dossiers de tentative. `upgrade_phase3.sh` installe la nouvelle version sous `/opt/iatb-admin-phase3/releases/<SHA>` et crée son unité séparée `iatb-admin-public`. Il garde `/opt/iatb-admin/AI Agent` et l'unité historique intacts.

## Installation à exécuter une seule fois en SSH administrateur

Une session humaine admin est nécessaire : les droits du relais GitHub Actions `iatb-debug-ci` sont volontairement limités à DEBUG et ne permettent pas de gérer Caddy, systemd ou la première authentification ADMIN.

1. Examiner la PR et le script `AI Agent/AdminPanel/upgrade_phase3.sh`, valider le SHA complet et ses tests.
2. Vérifier le DNS A vers GEN-1, AAAA natif absent ou vérifié, accès Caddy existant, port 18083 libre.
3. Depuis XFCE, exécuter le script à ce SHA approuvé, avec clé SSH existante. Ne jamais partager les mots de passe.
4. Le script confirme la publication, préserve la v1.1, valide le SHA, effectue les contrôles DNS et Caddy, puis utilise le compte de service isolé.
5. Si `credentials.json` existe déjà, le mot de passe est conservé. Sinon, saisir un nouveau mot de passe privé en session SSH.
6. Le script démarre le backend en lecture seule, vérifie `/healthz` en loopback et `401` sur API anonyme, sauvegarde la configuration Caddy, importe le nouveau site, valide puis recharge Caddy.

La branche de travail peut évoluer ; le SHA fourni doit être celui dont la CI de sécurité est **réussie** et qui correspond à la tête de branche. Aucun script n'est autorisé à étendre les droits de `iatb-debug-ci`.

## Recette obligatoire après le rechargement Caddy

- `https://ia.iatb.duckdns.org/login` : certificat valide, champ compte et mot de passe, aucun OTP.
- `https://ia.iatb.duckdns.org/api/overview` sans cookie : HTTP 401.
- `https://ia.iatb.duckdns.org/healthz` : HTTP 404.
- Identifiants corrects : redirection 303 et cookie `__Host-iatb_admin` Secure/HttpOnly/SameSite=Strict.
- Login erroné : refus, jamais accès aux données. Pas de POST d'administration ni accès Docker.
- Tous les autres sites Caddy existants demeurent fonctionnels.
- Services historiques et données RELEASE inchangés.

Les messages `PHASE3_UPGRADE_CADDY_RELOADED` et `PUBLIC_URL=...` signifient **que Caddy a été rechargé**, pas que l'accès externe HTTPS est confirmé. Le déclarer en ligne uniquement après recette externe.

## Rollback

Le script conserve une sauvegarde datée du Caddyfile. Sur erreur, il tente de restaurer l'ancien Caddyfile et d'arrêter le nouveau service ; les sources historiques ne sont pas écrasées. Ne pas supprimer les secrets ou sauvegardes sur erreur. Un administrateur peut rétablir manuellement la configuration depuis le backup après revue et validation.

## Test suivant : déploiement DEBUG depuis ChatGPT

Ce test utilise le **workflow distinct** GitHub Actions → SSH restreint → opérateur DEBUG. Il ne nécessite pas de droits système sur l'UI et ne doit pas pouvoir agir sur RELEASE.
