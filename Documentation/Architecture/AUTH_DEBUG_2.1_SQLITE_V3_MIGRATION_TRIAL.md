# IA-TB DEBUG 2.1 — Phase 2 : migration SQLite v3 et conversion CAS (prototype isolé)

**Date :** 14/10/2026 — branche `feature/debug-2.1-auth-design`.
**État : prototype isolé de migration / CAS validé sur fixtures CI Node 22 ; NON INTÉGRÉ au runtime.**
**Aucune migration active, aucune base réelle, aucune donnée Wallet et aucun déploiement GEN-1 touchés.**

## Périmètre réellement réalisé

- `App/Tools/CI/auth21_v3_migration_trial.js` : prototype d'application du SQL v3 avec `BEGIN IMMEDIATE / COMMIT`, rollback à l'échec dans la transaction, vérification du schéma préexistant, de l'intégrité SQLite et des clés étrangères, sauvegarde SQLite cohérente avant mutation et idempotence sur schéma v3 complet. Le module exige un fichier SQLite situé dans un dossier temporaire `iatb-auth21-v3-*`, et refuse toute DB hors fixture.
- `App/Tools/CI/auth21_credential_upgrade_trial.js` : prototype de vérification asynchrone du mot de passe PBKDF2 existant, hachage Argon2id natif, puis mise à jour transactionnelle conditionnelle (`CAS`) de la seule empreinte si le hash historique, le sel, les itérations, le rôle, l'état actif, l'horodatage et la version de sécurité sont encore inchangés. Audit écrit dans la même transaction, sans secret ; conflit = refus (`AUTH21_STALE_ACCOUNT`). Le code n'est appelé par aucun serveur.
- `App/Tools/Tests/auth21_v3_migration_trial.test.js` : **16 scénarios Node.js préparés** pour backup et reprise, migration idempotente, injection de SQL invalide et rollback, conversion authentifiée, erreur d'audit, races reset/rôle/version et gel du writer. **Ces 16 scénarios ont été exécutés avec succès en CI Node 22 après correction de l'accès `password_hash` dans un test**.
- Le schéma `App/Core/Clients/auth21_proposed_migrations/003_auth21_schema_v3.sql` est **toujours exclu du répertoire de migrations actives** : un appel normal à `ClientRepository.init()` ne l'applique pas.

## Preuves obtenues

- [CI P2.2 mise à jour](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38529194438) : **97/97 tests Node.js** (81 précédents + 16 nouveaux tests natifs de migration SQLite v3/CAS Argon2id) et **15/15 tests SQLite Python** réussis sous Node.js 22. Les tests Node ciblent les nouveaux modules sur de vrais fichiers SQLite temporaires avec bibliothèques natives, pas l'application en fonctionnement.
- `[CI P2.1](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38524995361)` et `[CI RBAC](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38524995146)` : SUCCESS.
- La cryptographie Argon2id/PBKDF2 avait indépendamment réussi **11/11 tests natifs Node 22** dans `[Auth KDF CI](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38521734959)` ; ce succès ne vaut pas validation du CAS Node.
- Le workflow autonome `auth-p2-v3-migration-trial.yml` n'a pas été créé. À la place, **les tests natifs ont été intégrés au workflow P2.2 existant**, et leur exécution a été confirmée. Le premier essai manuel de Macro était à 15/16 sous Node 18.19.1 ; la seule assertion échouée utilisait `passwordHash` au lieu du nom SQLite `password_hash`, corrigé dans le commit `0d9b2c1`. Macro doit encore être mis à jour vers Node 22 pour les tests locaux compatibles avec la cible.

## Points bloquants — ne pas cocher le jalon

1. **Validé sur CI Node 22 :** 16/16 tests natifs avec `better-sqlite3@12.4.1` et `argon2@0.45.1` sur répertoires temporaires. Reste à revalider localement sur Macro après passage à Node 22 et à vérifier le comportement de bout en bout dans une application isolée.
2. Finaliser la migration transactionnelle de production avec sauvegarde/restauration d'une copie explicitement autorisée, rollback après échec de validation post-COMMIT, inventaire de tous les writers et respect de `snapshotGate`.
3. Intégrer la lecture de `password_algo` dans `ClientRepository`, le CAS avec preuve de login validé, et les écritures d'audit sans secrets, en préservant les rôles et les données métier.
4. Installer la dépendance native dans `App/package.json` + lockfile de façon reproductible, sans dégrader Node 22 ni le lancement du build ; calibrer mémoire/concurrence/latences.
5. Intégrer les sessions, la révocation et la protection du dernier ADMIN dans le service/CLI ; exécuter les tests multi-Engines Phase 6 selon décision d'Overflow.

**Verdict : prototype de migration SQLite v3 / CAS testé avec succès sur fixtures natives ; activation et sécurité d'intégration non validées, Phase 2 et P2.2 TOUJOURS OUVERTS.**
