# IA-TB AI Agent — Admin Panel v1.0

## Fonctionnalités livrées

- HTML5, CSS électrique bleu, JavaScript natif : navigation responsive, animations discrètes, recherche, filtres et inspecteur.
- Python standard : API JSON GET, compte ADMIN distinct (hachage scrypt), service lié à 127.0.0.1:18082.
- Memory : consultation SQLite facultative en lecture seule, bornée à 100 entrées.
- Soul : GET /api/soul autorise exclusivement identity.md, behavior.md, personality.json, objectives.json.
- Journal : GET /api/journal rapproche les événements réels d'audit et de demandes. Aucun raisonnement privé du modèle n'est affiché ou inventé.
- Rules et Skills : affichage de déclarations, jamais des autorisations exécutables.
- Toute opération HTTP POST/PUT/PATCH/DELETE : refusée.

## Tests

Depuis la racine du dépôt :

```bash
python3 -m unittest discover -s "AI Agent/Tests" -p 'test_*.py' -v
python3 -m py_compile 'AI Agent/AdminPanel/server.py'
node --check 'AI Agent/AdminPanel/app.js'
```

## Déploiement recommandé — PHASE 1 (SSH uniquement)

**Non déployé à ce stade.** La CI de ce dépôt est build-only et aucun accès shell général à GEN-1 n'est accordé à l'agent.

1. Revoir et approuver le SHA exact du commit dans une Pull Request.
2. Copier une version vérifiée du dossier AI Agent vers un emplacement privé dédié du VPS, indépendant de RELEASE et des volumes Docker.
3. Créer l'utilisateur Linux de service `iatb-admin-panel` sans sudo ni groupe docker.
4. Déposer le code en lecture seule pour le service ; créer une zone de secrets privée 0700, séparée du Git public.
5. Initialiser le compte via `python3 "AI Agent/AdminPanel/server.py" init-admin --credential-file /var/lib/iatb-admin-panel/credentials.json` sous l'identité du service.
6. Valider le modèle systemd `AI Agent/AdminPanel/systemd/iatb-admin-panel.service.example` puis le démarrer sur 127.0.0.1:18082.
7. Vérifier les réponses 401/200, host allowlist, GET JSON, et que POST donne 405.
8. Sur un poste ADMIN habilité, créer un tunnel SSH humain restreint : `ssh -N -L 18082:127.0.0.1:18082 ADMIN_SSH@GEN1`, puis visiter `http://127.0.0.1:18082`.

**Ne pas utiliser l'identité SSH limitée aux opérations de déploiement pour ouvrir un port-forward.**
Les identifiants d'administration ne sont jamais dans l'URL, les logs ou le dépôt.

## Déploiement HTTPS via Caddy — PHASE 2

Cible : `https://ia.iatb.duckdns.org` ; ce nom résolvait vers 169.58.177.163 lors des vérifications réalisées par l'administrateur.

**Interdiction de brancher directement le backend actuel sur le Caddy public** : l'authentification Basic ne suffit pas pour la surface Internet souhaitée, et le Host actuel n'autorise que localhost. Ajouter d'abord une protection d'accès privée (VPN) et une authentification forte distincte (MFA) avec session et audit serveur, puis faire une revue de sécurité. Vérifier les en-têtes Host / X-Forwarded-*, cookies et CSRF.

Inspecter la configuration Caddy actuelle et préserver ses routes `iatb`, `hardware`, `architecture`, `trading` ; ne jamais remplacer tout le Caddyfile sans sauvegarde, validation et rollback.

## À compléter

- Gateway indépendant vérifiant grants et quotas au point d'exécution.
- Édition Memory et Soul via proposition GitHub puis CI et approbation, pas d'écriture directe par l'agent.
- Connecteurs GitHub et diagnostics VPS par opérations SSH allowlistées.
- Journal général temps réel (SSE) avec résumés décisionnels explicitement produits.
- Recette de sécurité, sauvegardes et intégration serveur sur GEN-1.

## Limites

Le statut d'un événement `APPROVED` en base ne confère aucun privilège technique.
Les bases facultatives ne doivent exposer ni secrets ni données RELEASE.
Le journal ne contient pas la chaîne de pensée privée de ChatGPT ; uniquement des événements vérifiables et des résumés déclarés.
