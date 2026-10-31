# IA-TB DEBUG 2.1 — Phase 2 : sessions, révocation et préférences isolées

**Statut : code opt-in testé sur fixtures natives SQLite, NON branché au serveur DEBUG.**
Date : 14/10/2026 ; branche `feature/debug-2.1-auth-design`. Aucun changement des bases GEN-1, des secrets Wallet ou des services actifs.

## Implémentation

- Nouveau `App/Core/Clients/auth21_session_store.js` : reçoit une connexion SQLite **déjà ouverte**, un `ClientCrypto` existant et une garde `snapshotGate` facultative. Ne crée ni fichiers, ni schéma, ni comptes. Refuse un schéma différent de la proposition v3.
- `loginWithPassword(clientId, password)` vérifie le mot de passe par `password_hasher_v2.js` (PBKDF2 ancien ou Argon2id), puis revalide **dans la transaction SQLite** empreinte, sel, algorithme, rôle, état, horodatage et `security_version` avant de créer une session. Aucun jeton ne naît d'un `clientId` non vérifié.
- Jeton opaque généré avec `crypto.randomBytes(32)`, encodé base64url, communiqué **une seule fois au demandeur** ; table `client_sessions` n'enregistre que SHA-256 (64 caractères hex). Les jetons, mots de passe et empreintes de mot de passe ne figurent pas dans les audits.
- Sessions à durée de vie **absolue**, TTL initial 1 heure et maximum provisoire 12 heures. `verifySession` n'actualise **jamais** `last_seen_at` ni la date d'expiration lors de polling. L'AutoLock 5 minutes, les cookies HttpOnly/SameSite/Secure, les protections CSRF et le TLS seront intégrés/testés à la Phase 3.
- `revokeSession(token)` invalide exclusivement le jeton présenté, et `revokeMySessions(token)` invalide les sessions du client déduit **côté serveur depuis la session vérifiée**, sans permettre de fournir le `clientId` d'un autre compte.
- Préférences via `getPreference/setPreference/deletePreference(token, scope, key)` : `clientId` obtenu exclusivement de la session vérifiée ; stockage `value_enc` via AES-256-GCM existant dans `ClientCrypto`. **GUEST lecture seulement** ; ADMIN/USER peuvent modifier leurs propres préférences. Révocation ou expiration refuse lecture/écriture.
- Deux triggers ajoutés au **schéma proposé v3 seulement** (leur présence est exigée par le module de session et le vérificateur de migration) : modifications de `password_hash`, `password_salt`, `password_iterations`, `password_algo`, `role`, `enabled`, ou `clients.status` augmentent `security_version` et révoquent les sessions existantes dans la transaction SQLite. Aucune conversion automatique `SUPERADMIN` → `ADMIN`.
- Garde facultative `snapshotGate` testée sur émission, révocation et mutations des préférences ; elle **n'est pas encore injectée par le serveur actif**.

## Campagne de tests vérifiée

- [CI P2.2 SUCCESS — run 38530888647](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38531347902) : **81/81 anciens tests Node**, **16/16 migration v3 + CAS**, **23/23 nouveaux tests sessions et préférences** sur SQLite native/Node 22, et **15/15 tests SQLite Python**, soit **135 tests de cette campagne réussis**, zéro échec.
- `App/Tools/Tests/auth21_session_store.test.js` teste : génération de jeton et stockage haché, refus fail-closed si triggers de révocation manquants, absence de révocation sur modifications sans changement réel, erreurs de mot de passe, expiration absolue, révocations simples/globales, invalidation par changements d'identité ou de credentials, conflits de modifications pendant PBKDF2 asynchrone, rollback d'un audit erroné, isolation entre deux `clientId`, chiffrement persistant après réouverture, refus GUEST et writer quiescé.
- **Macro** : Overflow a également confirmé **16/16 tests de migration v3 réussis localement** après correction du test et installation de Node 22 (résultat transmis dans la conversation). Les 21 nouveaux tests sont vérifiés en CI ; une vérification supplémentaire sur Macro demeure facultative.

## Limites bloquantes avant intégration

1. Les triggers, le module de session et la migration v3 sont **non actifs**. La connexion Auth réelle utilise encore l'ancien `ClientService.resolveSession`, dont le fallback global `active_client_id` et le bootstrap implicite ne sont pas adaptés au multiutilisateur.
2. Phase 3 : supprimer les bypass, brancher login/logout/lock/unlock à la Gateway, cookies et CSRF, expiration + AutoLock 5 minutes sur activité réellement humaine, limitation des essais, authentification WebSocket et fermeture fail-closed.
3. Phase 4 : brancher le RBAC effectif côté Core/Router/Engines et vérifier ownership/IDOR ; les contrôles locaux du stockage ne remplacent pas les permissions des routes.
4. Phase 2 : terminer l'intégration contrôlée de la migration au runtime, la dépendance native dans les manifests npm, protection clé maître, administration du dernier ADMIN et création/bootstrap des comptes.
5. Phase 6 : tests inter-Engines et cohérence/réservation des writers, sauvegarde réelle sur copies autorisées, restauration, mesure de performance et validation avant Phase 7.

**Décision de statut : la mise en place des structures et de l'adaptateur de stockage est testée sur fixtures, mais la case de Phase 2 reste [ ] tant que l'intégration effective et les contrôles globaux ne sont pas terminés.**
