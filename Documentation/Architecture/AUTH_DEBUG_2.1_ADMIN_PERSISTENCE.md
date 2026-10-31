# IA-TB Auth 2.1 — Phase 2 : invariants du dernier ADMIN et persistance

**Date : 14/10/2026** — travail sur `feature/debug-2.1-auth-design`, hors runtime GEN-1.
**Statut : gestionnaire ADMIN opt-in et protections SQL v3 testés sur bases temporaires ; NON activés en production ni sur DEBUG.**

## Implémentation

- `App/Core/Clients/auth21_admin_store.js` : gestion d'authentifiants existants uniquement, ne crée aucune base, aucune clé, aucun premier ADMIN et ne branche aucun endpoint HTTP.
- Toute opération exige **deux conditions indépendantes** : session encore valide ayant rôle `ADMIN` obtenue de `Auth21SessionStore` ET callback d'autorisation de l'opérateur local (contractuellement future CLI SSH). L'absence de callback ou un retour différent de `true` refuse. **Il ne faut jamais fournir un callback toujours vrai sur une route réseau**.
- Méthodes : `listAccounts` (métadonnées non sensibles), `activeAdminCount`, `changeRole`, `setEnabled`, `setClientStatus`, `removeLogin` (ne retire que la connexion, jamais l'identité, la DB wallets ou les références publiques), `resetPassword` (Argon2id asynchrone, audit minimal et révocation).
- Mutations dans des transactions **BEGIN IMMEDIATE** via `better-sqlite3` ; vérification de la session ADMIN une seconde fois dans la transaction, ce qui protège des révocations ou changements de rôle concurrentiels. En cas d'échec de l'audit, la modification est annulée.
- Dernier ADMIN : triggers SQLite v3 sur `UPDATE/DELETE` de `client_accounts` et `clients` empêchent la perte du dernier **ADMIN actif**. **Nouveaux triggers `auth21_last_admin_account_replace` et `auth21_last_admin_client_replace`** protègent aussi les suppressions implicites par `INSERT OR REPLACE` (conflit de `client_id`, nom d'utilisateur, référence externe, email hash). Ces triggers de remplacement sont obligatoires au chargement du module et au diagnostic du schéma v3.
- Toute modification du mot de passe, rôle, état activé ou statut client invalide les sessions via les triggers de sécurité et la version `security_version`.
- Un vieux rôle `SUPERADMIN` reste inchangé et **n'est pas assimilé automatiquement à `ADMIN`** ; création/reconciliation du premier ADMIN depuis une commande locale approuvée à réaliser dans le chantier CLI.

## Tests vérifiés

- [GitHub Actions SUCCESS — P2.2](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38532488254) : **24/24 nouveaux tests ADMIN** et **144/144 Node + 15/15 SQLite Python, soit 159 tests** sans erreur sur Node 22.
- Les cas testés incluent dernière désactivation/rétrogradation/suppression refusées en API et en SQL brut, parent clients protégé, remplacement `INSERT OR REPLACE` par PK ou par index UNIQUE, session locale ADMIN + opérateur OS, test ROLE invalide, maintien des références publiques Wallet, audit atomique, absence de régression de sessions sur changement nul, révocation après reset, persistance après fermeture/réouverture SQLite, conflits de droits pendant Argon2id et snapshot Gate.
- Aucun mot de passe de l'utilisateur ni secret Wallet réel n'a été utilisé ; uniquement des fixtures SQLite et clés client synthétiques.

## Périmètre à NE PAS annoncer terminé

1. Le **premier ADMIN** doit être créé **manuellement** via la future CLI de confiance après sauvegarde et validation par Overflow. Aucune création implicite, aucun mot de passe par défaut et aucune promotion automatique du rôle historique `SUPERADMIN`.
2. Le schéma SQL v3 reste en dehors de `App/Core/Clients/migrations/` ; l'ancien `ClientService.bootstrapDebugUser` et son ancien `upsertAuth` doivent être retirés/adapter avant activation. Le trigger anti-REPLACE refuse volontairement les UPSERTs qui ciblent le dernier ADMIN : ce comportement fail-closed exige une migration des anciens writers.
3. La gestion effective des comptes depuis `iatb-users` via SSH/CLI et la vérification du contexte opérateur Linux ne sont pas implémentées. Le callback local est une frontière de confiance à fournir/tester au chantier CLI, **pas une attestation OS implémentée à ce stade**.
4. Les protections SQL ne rendent pas SQLite inviolable par un processus disposant des droits de DROP TRIGGER ou de remplacement du fichier ; isoler OS, conteneurs et writers avant lancement.
5. Le diagnostic inter-Engines, snapshots cohérents, migrations/retour arrière sur copie autorisée, benchmarks et tests de permissions runtime sont reportés aux étapes de validation prévues, dont Phase 6.

**Conclusion : invariants techniques de dernier ADMIN et persistance vérifiés en banc natif isolé, mais case Phase 2 conservée `[ ]` jusqu'à intégration complète et tests de sécurité.**
