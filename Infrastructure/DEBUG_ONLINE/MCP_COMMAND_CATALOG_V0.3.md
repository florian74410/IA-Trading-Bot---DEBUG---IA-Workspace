# IA-TB MCP — catalogue de commandes v0.3 (proposition)

## Architecture retenue
- Deux services isolés : MCP DEBUG (127.0.0.1:8800, compte iatb-mcp) et MCP Architecture (127.0.0.1:8810, compte iatb-arch-mcp).
- Catalogue de commandes partagé **en code versionné**, mais politiques, identités, chemins, secrets, autorisations et journaux distincts.
- Aucun accès RELEASE depuis DEBUG/Architecture. Aucun accès sudo ni shell arbitraire pour le serveur MCP.
- Ne pas modifier le MCP DEBUG actif avant récupération et audit de son `/opt/iatb-mcp/server.py` (source actuellement non confirmée dans ce dépôt).

## Catalogue de base — à implémenter avec arguments typés
| Famille | Commande | Risque | DEBUG | Architecture |
| --- | --- | --- | --- | --- |
| Diagnostic | `system_status` (uniquement ses propres services) | lecture | oui | oui |
| Diagnostic | `service_logs` (journal filtré, limité, secrets masqués) | lecture | oui | oui |
| Diagnostic | `ports_status` (ports autorisés) | lecture | oui | oui |
| Diagnostic | `disk_memory_status` | lecture | oui | oui |
| Git | `git_status`, `git_diff`, `git_log` | lecture | oui | oui |
| Fichiers | `list_files`, `read_file`, `search_files` | lecture | oui | oui |
| Fichiers | `write_file` (workspace seulement, taille bornée, chemin protégé) | écriture | oui | oui |
| Validation | `run_tests` (IDs de tests connus, sans commande libre) | contrôlée | oui | oui |
| Git | `git_branch`, `git_commit` (workspace uniquement) | écriture | oui | oui |
| Git | `git_fetch` (origin épinglé) | réseau contrôlé | oui | oui |
| Déploiement | `prepare_deploy`, `deploy_status` | lecture | oui | oui |
| Déploiement | `deploy_approved` (SHA + approbation séparée) | sensible | selon politique | selon politique |

## Fonction sur mesure demandée par un agent
Ne **jamais** accepter une chaîne shell passée comme argument d'un outil MCP.
- `custom_request`: crée une requête avec ID aléatoire, environnement, justification, modèle d'opération connu, arguments JSON bornés, diff/impact, expiration 10 minutes. Sans effet d'exécution.
- `custom_preview`: affiche précisément la commande prédéfinie, les fichiers/services affectés, les effets secondaires et le hash de la requête.
- `custom_approve`: l'administrateur humain authentifié approuve sur un canal distinct (interface Admin avec MFA / console SSH locale), en validant le hash exact. Une demande venant du modèle n'est **jamais** une approbation.
- `custom_execute`: consomme un jeton d'approbation à usage unique, lié au compte, à l'ID, au hash, à l'environnement et à l'expiration; rejette si autre argument ou état. Exécution uniquement d'un modèle de commande approuvé sous compte non privilégié, avec timeout, limites de ressources et audit.
- `custom_result`: retourne code de sortie, logs filtrés et identifiant d'audit.
- Les actions de configuration système, sudo, clés, pare-feu, base de données, trading live, déploiement RELEASE et secrets restent interdites par défaut. Les workflows privilégiés éventuels requièrent des exécutables root-owned distincts et un audit additionnel.

## Tests bloquants avant activation
- Path traversal, symlinks, TOCTOU, commandes injectées, arguments malformés, sortie volumineuse, timeouts.
- Rejeu d'approbation, approbation expirée, double approbation simultanée, variation des paramètres après approbation.
- Refus croisé DEBUG -> Architecture et Architecture -> DEBUG ; refus d'accès RELEASE.
- Audit immuable au niveau utilisateur, refus de journaux contenant secrets.
- Tests de refus d'opération privilégiée et d'accès HTTP non authentifié.
- Snapshot de retour arrière et validation de non-régression MCP DEBUG avant toute mise à niveau.

## Phases
1. Inventaire exact des outils et protections du MCP DEBUG existant.
2. Extraction des fonctions utilitaires génériques dans un paquet partagé versionné, sans remplacer le service existant.
3. Implémentation des adaptateurs DEBUG / Architecture avec allowlists spécifiques.
4. Mise en place du circuit d'approbation hors bande et de son journal.
5. Tests sur port de staging, puis migration progressive des deux services.
6. Connexion à ChatGPT uniquement si connecteur MCP authentifié et autorisé disponible.

État : spécification de conception, **aucun changement au VPS effectué**.
