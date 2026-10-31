# IA-TB Authenticator DEBUG 2.1 — Point de convergence et portes de sortie

**14 octobre 2026 — Branche `feature/debug-2.1-auth-design` — Pas de déploiement GEN-1.**

## Nouvel élément vérifié

- `App/Core/Clients/auth21_http_boundary.js` : handler **non monté** au serveur, natif Node HTTP et sans nouveau port. Endpoints proposés exclusivement `POST /auth21/login`, `GET /auth21/me`, `POST /auth21/logout`. Login délégué à `Auth21SessionStore.loginWithPassword` (PBKDF2 ou Argon2id selon compte), session validée uniquement par `Authorization: Bearer <token>`, logout en base via `revokeSession`. Aucun header ou cookie de rôle accepté comme preuve d'identité. Requête JSON bornée 4096 octets, champs stricts, pas de route Admin/Wallet/Reprise. Pas de secrets dans les réponses d'erreur ; `Cache-Control: no-store`.
- `App/Tools/Tests/auth21_http_boundary.test.js` : **9/9 tests** sur handler in-process, y compris mauvais mot de passe, entrée malformée ou surdimensionnée, rôle forgé, session obligatoire, déconnexion et 503 lors du gel de writer. Les neuf premiers tests utilisent un mock de `Auth21SessionStore`; les deux tests d'intégration supplémentaires ci-dessous utilisent **la vraie SQLite et Argon2id**.
- [GitHub Actions P2.2 SUCCESS, 38557338823](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38557338823) : **278 Node.js + 15 SQLite Python = 293 tests réussis**, aucun échec.

## Complément validé : HTTP + native SQLite + Argon2id

- `App/Tools/Tests/auth21_session_store.test.js` contient désormais **2 tests end-to-end supplémentaires**, avec le véritable `Auth21SessionStore`, une base SQLite temporaire réellement migrée au schéma proposé v3 et une vérification Argon2id native ; le handler HTTP est appelé **in-process, sans port réseau**.
- Ils vérifient la session dont seul le SHA-256 du jeton est conservé en base, le succès de `/auth21/me`, la révocation par `/auth21/logout`, l'isolement ADMIN/USER, le refus de `?clientId=` et l'invalidation d'une session après modification du rôle en SQLite.
- **[GitHub Actions P2.2 SUCCESS — run 38560724999](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38560724999)** : **280/280 tests Node.js + 15/15 SQLite Python = 295/295 tests réussis**. Le serveur principal et les routes historiques restent strictement hors de cette campagne.

## Nouvelle frontière Core — refus systématique des routes legacy (isolée)

- `App/Core/Clients/auth21_core_route_gate.js` : composant autonome, **pas monté sur `server.js`**, qui accepte uniquement `/auth21/login`, `/auth21/me`, `/auth21/logout` et refuse tout le reste par HTTP 404 avec `Cache-Control: no-store`. Il délègue la vérification des tokens au handler Auth 2.1 existant, sans appel à `session(req)`, aux cookies `sid`, au `localBypass`, ni aux routes Wallet/CP1.
- `App/Tools/Tests/auth21_http_boundary.test.js` : **3 tests supplémentaires** couvrant la suppression du faux bootstrap anonyme, le blocage des cookies ADMIN falsifiés, des routes Update/Wallet/diagnostic et la conservation du parcours Auth 2.1 minimal. Les 3 tests sont in-process, non équivalents à une activation du serveur.
- [GitHub Actions P2.2 — SUCCESS run 38561378158](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38561378158) : **283 tests Node + 15 tests SQLite Python = 298/298 réussis**.
- **Limite principale :** aucune fermeture des anciennes routes sur le serveur existant. La vraie activation nécessite de remplacer le routeur historique, non de simplement ajouter `/auth21/*` à côté de `/api/bootstrap`, sous peine de bypass.

## Déjà disponible, mais NON activé dans l'application

- SQLite schéma v3 de proposition, garde triggers dernier ADMIN, migrateur offline ; Argon2id natif ; sessions et préférences chiffrées ; compte ADMIN opt-in et revue des anciens SUPERADMIN ; sauvegardes et restauration chiffrées sur fixtures ; mode Core trial avec writers locaux.
- Le Core historique `App/Core/Server/server.js` utilise toujours son flux de session existant, une route `/api/bootstrap` indiquant `localBypass:true`, une gestion de session en mémoire (`SESS`) et un `ClientService.resolveSession` utilisant `active_client_id`. En conséquence l'ajout de ce handler ne rend pas le système Auth 2.1 sécurisé par défaut.

## Portes bloquantes pour dire « Authenticator fini »

1. **Migration contrôlée et réversible du stockage réel** après sauvegarde chiffrée et clé originale ; schéma v3 pas encore actif ni compatible avec tous anciens writers.
2. **CLI locale SSH `iatb-users` et attestation opérateur OS** pour créer le premier ADMIN ; ne pas recycler un callback permissif ni créer un compte/password par défaut.
3. **Branchement Gateway/Core end-to-end** : remplacer ou désactiver le contournement `/api/bootstrap`, `active_client_id`, sessions in-memory et le bootstrap DEBUG hors environnements de test, raccorder le nouveau handler aux routes effectives seulement après RBAC.
4. **RBAC/ownership effectif** sur chaque route HTTP/WebSocket/CP1 et sur les Engines ; registre inconnu = refus. Les tests statiques de matrice ne suffisent pas.
5. **Dépendances et packaging runtime** Node 22, argon2, better-sqlite3 : scripts/builds Docker contrôlés, incompatibilités existantes Node 16 réglées, sans déploiement GEN-1.
6. **Phase 6** : tests négatifs inter-Engines, latences Argon2id/p95/p99, sauvegardes multi-ressources, WAL et panne, attaques de sessions, crash/restart, et revue finale d'autorisation avant toute ouverture réseau.

## Séquençage recommandé des prochains lots

**Lot A** : préflight et CLI locale testable sur copie autorisée (pas de vrais secrets). **Lot B** : adaptateur Gateway/Core avec vrai store et tests de HTTP/SQLite, fermeture des contournements legacy. **Lot C** : appliquer RBAC/ownership à chaque route, CP1/WS. **Lot D** : packaging et campagne Phase 6, puis décision humaine d'activation.

**Décision : aucun marqueur `[x]` de clôture Phase 2-7 tant que ces portes restent ouvertes. Pas de merge main/debug/release, pas d'accès Wallet, pas de migration ni de déploiement GEN-1.**
