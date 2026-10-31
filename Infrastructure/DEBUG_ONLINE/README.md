# IA-TB DEBUG Online — architecture et garde-fous

**Statut : préparation, NON DÉPLOYÉ.** Branche de base `2.5.3` (DEV). Le point d'entrée HTTPS `trading.debug.iatb.dns.org` n'est pas encore activé.

## Objectif

1. Modifier le code dans GitHub sur une branche de travail dédiée.
2. Construire et tester le code sur un runner GitHub hébergé, sans secrets du VPS.
3. Après validation explicite d'un commit SHA, déployer son image dans un conteneur Docker **DEBUG** isolé sur GEN-1.
4. Afficher le statut de déploiement, les tests de santé et disposer d'un retour arrière.
5. Exposer uniquement l'interface de test authentifiée sur `https://trading.debug.iatb.dns.org`.

## Ce qui existe déjà (31 octobre 2026)

- Branch source `2.5.3`, `App/Dockerfile.app` (image *build-only* : aucun processus lancé automatiquement).
- 39 conteneurs anciens DEBUG/TEST supprimés, 26 conteneurs R1/v2.1.1 conservés.
- Workspace `/srv/iatb-mcp-workspace/IA-TB` et MCP local `127.0.0.1:8800` v0.2 fonctionnel, mais **sans accès Docker**.
- Sauvegardes anciennes `/srv/iatb-debug/Backups/reset-20261031T042422Z`.

## Frontières de sécurité OBLIGATOIRES

- Aucun montage de `/var/run/docker.sock` dans le MCP ou le runtime IA-TB.
- Aucun `sudo docker` générique pour `iatb-mcp`.
- CI sur runners **GitHub-hosted** ; jamais de runner auto-hébergé doté d'accès au VPS pour ce dépôt public.
- Le futur contrôleur de déploiement accepte uniquement : SHA Git approuvé, projet Compose `iatb-debug-online`, chemin applicatif DEBUG approuvé. Aucune commande shell arbitraire, aucun nom de projet variable fourni par l'IA.
- Aucune suppression de volumes. Toute sauvegarde doit être vérifiée avant un changement de schéma.
- Variables `IATB_TRADING_LIVE=0`, et tests exigeant l'absence de toute mutation réelle de broker.
- DEBUG possède **ses propres comptes, certificats, bases et secrets**. Ne pas monter la clé maître ou le fichier ADMIN de RELEASE, même en lecture seule.
- L'accès public HTTPS doit exiger Auth21/login actif ; vérifier cookies sécurisés, en-têtes proxy, CSRF, origin et WebSockets avant publication.
- Caddy reste sous contrôle de l'administrateur GEN-1 ; ne jamais remplacer son fichier global sans lire/valider la configuration existante.
- MCP reste lié au loopback et possède uniquement l'accès au workspace source (pas aux dossiers secrets, RELEASE ni au socket Docker).
- Ne jamais publier de tokens, clés privées, dump SQL ou fichiers de session dans Git.

## Architecture prévue

```text
ChatGPT -> GitHub (branche de travail + PR)
                  |
              CI GitHub-hosted
                  |
            approbation commit SHA
                  |
             deploy DEBUG restreint
                  |
             Docker IA-TB 2.5.3+
                  |
       127.0.0.1:18000 (UI DEBUG)
                  |
              Caddy HTTPS
                  |
       trading.debug.iatb.dns.org
```

## Bloquants à résoudre AVANT de servir la page

1. **DNS** : confirmer la possession du nom `iatb.dns.org`, la possibilité d'enregistrer `trading.debug.iatb.dns.org` chez le fournisseur DDNS, l'enregistrement A vers GEN-1 et l'absence de mauvaise entrée AAAA.
2. **Runtime** : `App/Dockerfile.app` est une image source sans service démarré. Produire un Compose complet audité et un véritable démarrage multi-services avec Node 22.
3. **Bind réseau** : `App/UI/Gateway/ui_service.js` écoute actuellement `127.0.0.1` dans son espace réseau ; une publication Docker de port ne suffit pas. Prévoir un bind UI opt-in sécurisé sans exposer les autres moteurs.
4. **Auth HTTPS** : le lanceur local `start_auth21_local_safe.command` est configuré pour `localhost` ; il n'est pas une recette de production HTTPS derrière proxy. Tester un profil DEBUG dédié, origine HTTPS, cookies, CSRF, utilisateur ADMIN de test non-prod.
5. **Données** : préparer un répertoire `/srv/iatb-debug/private` **neuf**, réservé au runtime DEBUG, avec des permissions adaptées. Ne pas réutiliser `/var/lib/iatb` ni la base historique.
6. **Déploiement** : installer un contrôleur avec privilèges limités à DEBUG, puis des secrets GitHub de déploiement isolés et un environnement protégé `debug-online`. Jamais d'accès shell générique depuis un workflow public.
7. **Test HTTPS** : valider Caddy, certificats, l'URL publique, la connexion Auth21, l'API santé et le retour arrière avant de déclarer le site en ligne.

## Tests et statut

Le workflow `.github/workflows/iatb-debug-online-ci.yml` lance seulement une vérification statique et la construction de l'image. **Aucun job ne déploie sur le VPS** à ce stade. Ce verrou est intentionnel.

Le fichier `Caddyfile.example` est un exemple **non activé** et dépend d'un certificat backend local fiable.

## Suite

Compléter un runtime DEBUG réellement démarrable et ses tests d'intégration (UI, Core, Router, 12 services), puis implémenter le contrôleur et la promotion manuelle. Ne toucher ni aux données historiques ni à RELEASE.
