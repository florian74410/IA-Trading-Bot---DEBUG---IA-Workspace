# IA-TB DEBUG 2.1 — Phase 2 : revue de fin d'implémentation progressive

**Date :** 14/10/2026
**Branche :** `feature/debug-2.1-auth-design`
**Décision de qualité :** **PHASE 2 OUVERTE — validation et clôture refusées tant que les critères bloquants ne sont pas satisfaits.**
**Aucune publication du build DEBUG, aucune modification GEN-1, Wallet ou données client réelles.**

## Ce qui est effectivement codé et vérifié

| Composant | Preuve limitée |
| --- | --- |
| Barrière locale Core `SnapshotCoordinator` + `LocalSnapshotWriter` | Allowlist, epoch, ACK, RELEASE/ABORT, timeout, refus par défaut, fixtures |
| SQLite Clients, Settings, Portfolio, Fundamental V3 | Garde facultative `snapshotGate` avec méthode synchrone, création et migrations protégées lorsque le garde est injecté |
| MarketData Registry, API Telemetry, Microstructure SQLite | Garde des écritures, rétention et démarrage ; adaptateurs SQLite simulés |
| Financial, Trading History, Usage Ledger JSONL | Gardes facultatives des écritures et rétention ; véritables fichiers **temporaires** en tests |
| Mosaics Annexes JSON | Garde facultative sur création, remplacement atomique et suppression ; fichiers temporaires en tests |
| `ClientCrypto` | Refus de régénérer silencieusement `client_master.key` lorsqu'un `clients.sqlite` ou un journal `-wal/-shm/-journal` existe ; 6 tests sur clés fictives |
| Schéma v3 proposé **NON ACTIF** | `App/Core/Clients/auth21_proposed_migrations/003_auth21_schema_v3.sql` ; 10 tests SQLite isolés vérifient sessions, préférences scoped, maintien de PBKDF2 et triggers anti-dernier-ADMIN |

**CI au 14/10/2026 :** [workflow P2.2 / Phase 2](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38509073888) : **81/81 tests Node.js réussis** (67 historiques + 8 Mosaics + 6 ClientCrypto) et **10/10 tests Python SQLite pour le projet de schéma** ; [P2.1 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38509073847), [RBAC SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38509073901). Le passage de fixtures ne remplace pas des tests de sauvegarde authentique, migration réelle, benchmark ou sécurité interservices.

## Critères non remplis : pourquoi la Phase 2 n'est PAS close

1. **P2.2 non clos.** Registre effectif des écrivains et contrôle interprocessus `PREPARE/QUIESCED/RELEASE/ABORT` non intégrés dans tous les 13 services ; aucun `snapshotGate` injecté dans les services actifs ; aucune sauvegarde cohérente réelle, restauration globale, contrôle des contournements/restarts, crash tests ni p95/p99. Des écritures non coopératives (`paths.js` à l'import, scripts CLI, Annexes hors MosaicStore, jobs/updates, journaux divers) peuvent encore modifier l'état sans ACK. Conformément à l'arbitrage d'Overflow, ces tests multi-Engines sont prévus lors de la **Phase 6**, avant la Phase 7. **Ne pas cocher P2.2 à ce stade.**
2. **Migrations comptes v3 non déployées.** Le SQL v3 réside volontairement dans `auth21_proposed_migrations`, **hors du répertoire actif** `migrations/`. Il manque un runner de migration transactionnelle avec version-check, sauvegarde, reprise et rollback sur copie, isolation DEBUG/RELEASE, et vérification des dépendances métier par clientId. La présence de triggers en fixtures ne garantit pas la sûreté de comptes réels.
3. **Argon2id non intégré/calibré.** Aucune dépendance Argon2id Node 22 approuvée, aucun hash Argon2id émis, ni benchmark sur le matériel cible. `ClientService` utilise actuellement PBKDF2 pour la vérification des mots de passe ; la proposition de champ `password_algo` n'est pas un moteur de vérification. Il faut permettre la migration PBKDF2 uniquement après un login authentifié, de façon contrôlée.
4. **Sessions/révocation/ownership non implémentés dans le runtime.** Le schéma proposé ne crée ni cookies, ni jetons, ni règles d'expiration appliquées par le serveur ; les méthodes de service et l'isolation du `clientId` restent à développer/tester, comme l'audit des actions.
5. **CLI initial ADMIN + reset DEBUG non implémentés.** Aucun reset d'identités existantes n'est autorisé. Aucun transfert DEBUG → RELEASE ; création administrative initiale contrôlée et protection du dernier ADMIN à valider côté CLI, repository et service. Les triggers ne sont que des preuves de concept sur DB fictives.
6. **Sécurité des clés non entièrement validée.** Le `ClientCrypto` a un verrou conservateur supplémentaire, mais les clés de service créées à l'import de `Core/Shared/paths.js`, les droits de volumes partagés et l'invariant des sauvegardes chiffrées doivent encore être vérifiés sans toucher au Wallet.

## Séquence minimale restante

- **Phase 2, développement :** intégrer Argon2id de façon compatible Node 22, migration contrôlée PBKDF2, comptes/sessions/révocation et préférences par clientId, écriture d'audit ; établir le bootstrap ADMIN et les invariants sécurité côté services/CLI, puis tester les migrations sur copies temporaires.
- **Phase 6, validation convenue :** coordination inter-Engines sur environnement isolé, inventaire exhaustif, tests fautifs/timeout/crash/reprise, copies SQLite Online Backup et fichiers non-SQLite, sauvegarde AES-GCM restaurable, garanties de zéro mutation acceptée perdue, mesures p50/p95/p99, séparation DEBUG/RELEASE et conformité RBAC.
- **Accord final :** clore la Phase 2 uniquement quand tous ses critères techniques et de sécurité sont démontrés ; aucune autorisation implicite de déploiement sur GEN-1.

**Conclusion :** davantage de modules de stockage préparés et testés, mais déclarer « Phase 2 terminée » aujourd'hui donnerait un faux signal de sécurité. La branche reste isolée et le verrou de déploiement d'Overflow demeure en vigueur.
