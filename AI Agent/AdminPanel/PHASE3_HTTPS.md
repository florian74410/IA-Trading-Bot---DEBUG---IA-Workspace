# Phase 3 — Publication HTTPS protégée de IA-TB Admin (GEN-1)

**Code et recette disponibles sur branche work/ai-agent-admin-phase3. NON publié sur GEN-1 par cette branche.**
Site souhaité : https://ia.iatb.duckdns.org.
Important : l'application v1.1 utilise Basic Auth seulement sur SSH loopback; elle ne doit jamais être publiée directement sur Internet.

## Ce que Phase 3 apporte
- Nouveau backend public_server.py indépendant de la route Basic Auth privée v1.1.
- Mot de passe admin vérifié par scrypt + second facteur TOTP à 6 chiffres.
- Session opaque aléatoire, cookie __Host- Secure / HttpOnly / SameSite=Strict.
- Expiration sur inactivité et durée absolue, sessions en mémoire volatiles.
- Vérification exacte de Host + Origin HTTPS pour les POST.
- CSRF pour la déconnexion; refus de toute mutation d'administration.
- API et données de consultation **read-only**; permissions restent DENIED_NO_CONTROLLER.
- Serveur Python limité à 127.0.0.1:18083, Caddy public à HTTPS seulement.
- Caddy doit bloquer /healthz sur Internet. Pas de backend public sur port 18083.

## Limites à connaître
- Ceci est **une première phase publique en lecture seule**, pas un Permission Manager capable d'approuver des droits.
- Le secret TOTP est initialisé manuellement **sur GEN-1**, jamais dans Git ou GitHub Actions.
- Le mécanisme n'est pas une authentification WebAuthn/passkey et n'offre pas de compte multi-utilisateur.
- Le verrouillage global après plusieurs échecs peut générer un déni de service temporaire : surveiller les journaux et limiter l'accès par réseau privé/allowlist si nécessaire.
- La session et les protections anti-rejeu TOTP sont en mémoire : redémarrer le serveur invalide les sessions; les instances multiples ne sont pas autorisées.
- Aucun accès Docker, sudo, RELEASE ni ordre de trading.
- Les données des bases SQLite optionnelles doivent être **expurgées avant mise à disposition du panneau**.

## Prérequis réels (à vérifier sur GEN-1)
1. Contrôler résolution DNS A/AAAA de ia.iatb.duckdns.org vers le VPS (ne pas supposer la résolution).
2. Vérifier les sites Caddy existants; ne pas écraser /etc/caddy/Caddyfile.
3. Vérifier état des ports 80/443 et émission Let's Encrypt ACME ou équivalent.
4. Revoir le commit approuvé, vérifier tests CI et inventaire des comptes/ACL.
5. L'opérateur humain dispose d'une session admin dédiée; compte SSH CI **ne peut pas** changer Caddy, les comptes Linux et systemd.
6. L'administrateur conserve les secrets en dehors du dépôt.

## Installation Phase 3 (un seul opérateur humain pour initialisation)
La procédure détaillée de l'installation privée v1.1 est DEPLOY_V11.md.
Ne pas activer HTTPS avant validation du service isolé.

Sur un clone GitHub vérifié à un SHA précis, créer l'archive de code :

    REV=<SHA_COMPLET_APPORTE_PAR_CI>
    git archive --format=tar "$REV" 'AI Agent' > iatb-admin-phase3.tar
    sha256sum iatb-admin-phase3.tar

Transférer l'archive par le canal administrateur sécurisé, comparer SHA256 côté GEN-1,
puis installer dans /opt/iatb-admin root-owned (répertoire versionné ou sauvegardé).
Créer/vérifier l'identité Linux non privilégiée iatb-admin-panel et
le répertoire privé /var/lib/iatb-admin-panel (0700, propriétaire du service).

Une seule fois, sous l'identité Linux de service avec terminal interactif :

    sudo -u iatb-admin-panel python3 '/opt/iatb-admin/AI Agent/AdminPanel/server.py' init-admin --credential-file /var/lib/iatb-admin-panel/credentials.json
    sudo -u iatb-admin-panel python3 '/opt/iatb-admin/AI Agent/AdminPanel/public_server.py' init-mfa --mfa-file /var/lib/iatb-admin-panel/mfa.json

Le premier ordre n'est nécessaire que si les identifiants ne sont pas déjà initialisés.
Le deuxième affiche un secret TOTP à enregistrer hors ligne et demande un code de vérification.
Ne jamais copier ces données dans une issue, un log CI ou un chat.

Installer l'unité systemd revue :

    sudo install -o root -g root -m 0644 '/opt/iatb-admin/AI Agent/AdminPanel/systemd/iatb-admin-public.service.example' /etc/systemd/system/iatb-admin-public.service
    sudo systemd-analyze verify /etc/systemd/system/iatb-admin-public.service
    sudo systemctl daemon-reload
    sudo systemctl start iatb-admin-public
    sudo systemctl is-active --quiet iatb-admin-public
    sudo ss -ltnp '( sport = :18083 )'
    curl --fail -H 'Host: ia.iatb.duckdns.org' http://127.0.0.1:18083/healthz

### Recette localhost obligatoire avant ouverture au WAN
- GET / sans session → 303 /login.
- GET /api/overview sans session → 401.
- POST /login sans Origin: https://ia.iatb.duckdns.org → 403.
- POST /login avec mot de passe erroné ou mauvais code TOTP → échec.
- Authentification valide (réelle) → 303 + cookie Secure/HttpOnly/SameSite=Strict.
- Requête avec cookie → /api/overview 200, execution: false.
- POST/PUT/PATCH/DELETE sur permissions/requests → 405.
- Aucune écoute sur 0.0.0.0:18083, aucun accès au Docker socket ou RELEASE.

### Activation Caddy, **après** validation de la recette
L'admin inspecte la configuration réelle (sudo cat /etc/caddy/Caddyfile), la sauvegarde
avec un nom unique et lit les sites existants iatb, hardware, architecture, trading.
Il vérifie qu'aucun bloc ia.iatb.duckdns.org concurrent n'existe.

Installer et relire la nouvelle configuration :

    sudo install -o root -g root -m 0644 '/opt/iatb-admin/AI Agent/AdminPanel/caddy/iatb-admin-phase3.caddy.example' /etc/caddy/iatb-admin-phase3.caddy

Ajouter une seule ligne au Caddyfile principal si elle n'existe pas déjà :

    import /etc/caddy/iatb-admin-phase3.caddy

Puis :

    sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
    sudo systemctl reload caddy

Vérifier depuis un client externe HTTPS (certificat valide, pas -k) :
- https://ia.iatb.duckdns.org affiche la connexion, **pas des données sans connexion**.
- /healthz est inaccessible publiquement.
- Le mot de passe + code TOTP sont obligatoires.
- Les autres domaines publics existants restent disponibles.
- Répondre à la demande de déploiement uniquement après validation de tous ces points.

### Retour arrière
En cas d'échec : retirer **uniquement l'import dédié** après restauration/revue du Caddyfile sauvegardé,
valider et recharger Caddy; stopper iatb-admin-public, revenir à l'archive du précédent SHA.
Ne pas supprimer la DB, les identifiants ni les sauvegardes. Ne toucher à aucun service RELEASE.

## Séparation d'avec les déploiements DEBUG
Après la mise en ligne initiale, la démonstration autonome ChatGPT → GitHub Actions
→ SSH → contrôleur DEBUG reste une opération **distincte**. L'opérateur actuellement
installé ne permet pas l'installation ni la modification de ce service Admin.
Ne jamais accorder de shell ou de sudo générique pour rendre ce test possible.
