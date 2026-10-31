# IA-TB DEBUG 2.1 — P2.2 — Coordination des écrivains et reprise cohérente interservices

> **État : OUVERT**, non implémenté dans les 13 services. Hérite explicitement des obligations sorties du périmètre de [P2.1 (prototype sur fixtures clôturé)](AUTH_DEBUG_2.1_P21_FIXTURE_VALIDATION_REPORT.md).  
> **Références :** [P1.5 Backup/Restore](AUTH_DEBUG_2.1_BACKUP_RESTORE_CONTRACT.md), [protocole de gel](AUTH_DEBUG_2.1_COHERENT_SNAPSHOT_BARRIER.md), [inventaire préliminaire](AUTH_DEBUG_2.1_SQLITE_WRITER_INVENTORY.md), [audit GEN-1](../Security/AUTH_DEBUG_2.1_STORAGE_AUDIT.md).  
> **Interdiction :** **aucun nouveau Docker DEBUG sur GEN-1 avant Auth 2.1 intégralement testé et approuvé** ; ne pas manipuler Wallet, clé Wallet ou compte réel.

## Objectif

Transformer la barrière de démonstration P2.1 en une **coordination applicable à tous les écrivains de données critiques**, avec rollback et résilience aux crashs, mesurée en performance, sans réduire l'isolation de sécurité. Un simple lock `flock` ne suffit **pas** : les writers du runtime n'y participent pas actuellement, et des fichiers JSONL/Annexes sont modifiés hors SQLite.

Le prototype P2.1 reste test-only. **P2.2 devra concevoir puis tester le mécanisme runtime sur un banc isolé** avant tout déploiement ou opération sur un jeu réel.

## Décision de mise en œuvre minimale (Overflow — 14/10/2026)

- **Pas de surarchitecture :** intégrer un coordinateur unique et léger dans Core, avec un registre minimal des ressources/écrivains et des acquittements d'arrêt/reprise. Réutiliser les canaux et cycles de vie existants ; pas de nouveau conteneur, broker, moteur de workflow, protocole distribué générique ou abstraction supplémentaire sans nécessité démontrée.
- **Développement progressif :** protéger d'abord les chemins d'écriture critiques et vérifier au fil de l'eau leurs tests unitaires, fixtures, erreurs et sauvegardes locales. Le registre pourra être étendu uniquement lorsqu'un écrivain réel est confirmé, sans supposer qu'il est exhaustif.
- **Tests inter-Engines en fin de développement :** conserver les tests de cohérence, d'isolation, de permissions, de crash/restart et de contournement **multi-Engines** pour une campagne complète à la fin de l'intégration Auth 2.1 (Phase 6) sur banc isolé, avant tout passage à la Phase 7. Jusqu'alors, P2.2 demeure **OUVERT**, même si ses composants sont codés et leurs tests unitaires réussissent.
- **Aucun raccourci de sûreté :** une sauvegarde globale n'est pas autorisée ni qualifiée « cohérente » tant que les writers concernés ne sont pas réellement coordonnés et validés. ABORT/fail-closed en cas de writer inconnu ou non coopératif. Wallet et GEN-1 restent intouchés ; interdiction de déployer un nouveau Docker DEBUG maintenue.

## Avancement d'implémentation — prototype isolé (14/10/2026)

- **Ajouté :** `App/Core/Backup/snapshot_coordinator.js`, module Node 22 sans dépendance, **non instancié et non importé par les services actifs**. Aucun accès à une DB, au réseau, au Wallet, aux secrets ou à GEN-1.
- **Contrat minimal :** allowlist d'écrivains connue, `prepare(epoch)` avec ACK `{epoch, writerId, pending:0}`, appel de capture uniquement après tous les ACK, puis `release(epoch)` ; `abort(epoch)` en cas d'échec. Refus d'un writer absent, inconnu ou sans acquittement ; état `BLOCKED` si la libération/annulation échoue.
- **Vérification locale :** 10/10 tests unitaires Node 22 réussis avec callbacks simulés, sans moteurs ni fichiers persistants. Voir `App/Tools/Tests/snapshot_coordinator.test.js`, exécuté par `.github/workflows/auth-p22-coordinator-fixtures.yml` ; **[GitHub Actions P2.2 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38504080153)** (Node 22, syntaxe et fixtures).
- **Limites :** ce prototype ne fige **aucun véritable writer** et ne prouve ni la cohérence interservices, ni la restauration, ni le contrôle des writer/restarts ou les performances. Les `prepare` tardifs doivent respecter l'invalidation d'epoch après ABORT : à implémenter et tester dans chaque participant lors de l'intégration. **Aucune sauvegarde réelle n'est autorisée** par ce module.
- **P2.2 — Clients et Settings (14/10/2026) :** ajout de `LocalSnapshotWriter` dans `snapshot_coordinator.js` et d'un paramètre facultatif `snapshotGate` dans `App/Core/Clients/client_repository.js` et `App/Core/Settings/sqlite_settings_store.js`. Gèle **tous les accès SQL par leurs API** (y compris les lectures potentiellement créatrices de fichiers) et les réinitialisations tant que l'epoch est détenue, sans queue ni microservice. `SettingsStore` ne peut pas transformer silencieusement ce refus en valeurs par défaut via ses lectures de confort. `App/Core/Server/server.js` **ne transmet pas** `snapshotGate` : aucune activation sur le runtime existant. Tests de faux stores : `App/Tools/Tests/core_snapshot_writers.test.js` (6 cas) + coordinateur (10 cas), **[CI P2.2 Node 22 — SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38504944618)**. Sans SQLite réelle, sans secrets, sans Wallet et sans GEN-1.
- **Portfolio — extension opt-in (14/10/2026) :** `App/Portfolio/Engine/portfolio_store.js` accepte désormais `snapshotGate` facultatif comme Clients/Settings. Contrôle AVANT toute création de dossier/connexion SQLite et à l'entrée de ses méthodes SQL (y compris `compactSnapshots`, migrations/initialisation et fermeture). Aucune modification des données de trades, des références Wallet ni de la politique de rétention ; aucune injection dans `portfolio_service.js` : fonctionnement du Portfolio existant conservé. `App/Tools/Tests/portfolio_snapshot_writer.test.js` ajoute six tests sur un adaptateur SQLite simulé et sans données réelles : compatibilité sans garde, refus préinitialisation, refus de toutes les méthodes pendant le gel, reprise après RELEASE et ABORT, générations successives. Workflow Node 22 étendu ; **[CI P2.2 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38505549291)** (22 tests unitaires : 10 coordinateur + 6 Clients/Settings + 6 Portfolio). Les [contrôles P2.1](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38505549301) et [RBAC](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38505549300) sont également au vert. **Validation limitée aux fixtures.** Aucun Engine démarré et aucun déploiement.
- **Limites et suite :** les tests CI prouvent le refus d'écritures sur les entrées des classes instrumentées avec des adaptateurs factices, pas l'absence de chemins contournant ces classes ni une pause interprocessus. La finalisation de l'inventaire des accès directs, la coordination des autres Engines, la reprise d'un service pendant le gel, les snapshots chiffrés restaurables et la charge p95/p99 restent **non validées**. Les tests complets multi-Engines sont reportés à la Phase 6, avant Phase 7.

## P2.2 — Fundamental Engine : garde SQLite facultatif (14/10/2026)

- **Code ajouté :** `App/Fundamental/Engine/database_core.js` accepte `new Storage({snapshotGate})` (absence de `snapshotGate` = comportement actuel inchangé). Contrôle avant la création du répertoire de données, l'ouverture SQLite, les migrations de démarrage et à l'entrée des **54 méthodes** `Storage.prototype`, y compris écritures de feeds, événements, traductions, synthèses et lectures exposées au stockage. Contrôle JS léger, aucune dépendance nouvelle.
- **Tests isolés :** `App/Tools/Tests/fundamental_snapshot_writer.test.js` (6 cas) : construction sans garde, garde invalide, refus d'initialisation pendant gel, couverture automatique de chaque méthode, parcours coordinateur RELEASE et ABORT. Modules Paths et SQLite **simulés** pendant les tests, sans accès aux secrets ni aux DB réelles. **[CI P2.2 Node 22 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38506185261)** — 28 tests à cette étape (10 coordinateur + 6 Clients/Settings + 6 Portfolio + 6 Fundamental), désormais complétés par 5 tests de migration legacy (voir ci-dessous).
- **Migration legacy (corrigée sur branche de conception) :** `App/Fundamental/Engine/database.js` ne lance plus `migrateLegacy()` au simple import ; celle-ci s'exécute dans le constructeur de stockage **après** contrôle facultatif du `snapshotGate`, mais **avant** l'ouverture SQLite. La logique de migration `fundamental.db`, `-wal` et `-shm` reste inchangée. **5 tests supplémentaires** simulent intégralement le système de fichiers : import sans mutation, gel avant accès disque, migration legacy avec/sans cible existante, garde invalide. **[CI Node 22 SUCCESS — 33 tests P2.2](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38506378250)**. Aucune migration réelle exécutée. **Limite :** `Core/Shared/paths.js` possède encore des effets de bord au chargement hors du périmètre de cette garde ; ses démarrages et les écrivains externes doivent être inventoriés/protégés avant activation. Les services actifs n'injectent actuellement aucun garde ; aucune sauvegarde globale ni pause interprocessus n'est validée.
- **Calendrier approuvé :** continuer par MarketData et les autres écrivains sur fixtures, puis valider globalement les Engines à la Phase 6. Aucun Docker DEBUG GEN-1, aucune modification Wallet ou de données persistantes réelles.

## Extension P2.2 — MarketData SQLite (14/10/2026)

- **Implémenté sur branche de conception :** `App/MarketData/Registry/market_registry.js`, `App/MarketData/Storage/api_telemetry_store.js` et `App/MarketData/Storage/microstructure_store.js` acceptent chacun `snapshotGate` **facultatif**, avec validation avant l'initialisation/connexion SQLite et refus d'accès à l'entrée des méthodes de stockage (`Registry` : 10 ; `Telemetry` : 12 ; `Microstructure` : 13, plus alias `save`). Le contrôle est léger et synchrone, sans nouveau conteneur, broker ni signature par tick.
- **Chemins couverts quand le garde est injecté :** upsert Registry ; télémétrie API et stream ; snapshots microstructure, liquidations, open interest et liquidité DEX ; initialisation et migrations implicites ; rétention `prune()` et purge `purgeManual()`. Les méthodes qui renvoient normalement `false` lors d'une erreur SQLite lèvent explicitement `SNAPSHOT_WRITE_QUIESCED` **avant leurs blocs `try/catch`** ; aucune opération acceptée ne doit être silencieusement perdue lors d'une future coordination.
- **Tests unitaires :** `App/Tools/Tests/marketdata_snapshot_writers.test.js` utilise une fausse couche SQLite et vérifie compatibilité sans garde, refus avant ouverture SQLite/accès au disque, couverture des méthodes publiques de chaque store, arrêt/reprise multi-writers avec le coordinateur, ABORT et validation des gardes. **12 tests supplémentaires, total [45/45 SUCCESS sur Node 22](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38507092477)**. Contrôles [P2.1 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38507092480) et [RBAC SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38507092471) également.
- **Limites :** aucun `snapshotGate` injecté dans les services MarketData actifs, aucun gel des processus indépendants, aucun snapshot global, aucune validation du chemin `Financial/financial_store.js` JSONL (append/rename/rétention), aucune qualification de « reconstructible » ou exclusion de sauvegarde approuvée. Les coûts p95/p99 restent à mesurer sur banc isolé au jalon final Phase 6 ; le comportement courant n'est pas changé sans injection du garde. GEN-1 et Wallet inchangés.

## Extension P2.2 — Financial Store JSONL (14/10/2026)

- **Implémenté sur la seule branche de conception :** `App/MarketData/Financial/financial_store.js` accepte `snapshotGate` facultatif. Refus explicite `SNAPSHOT_WRITE_QUIESCED` **avant** le chargement `_load`, la mutation en mémoire `set`, les ajouts `persist` (append), le compactage `_prune` (fichier temporaire + rename) et la purge explicite `purge`. Contrôle dans le constructeur avant le premier accès au fichier. La lecture du cache (`get`, `list`, `freshness`) reste possible pendant le gel.
- **Tests sur fichiers éphémères réels :** `App/Tools/Tests/financial_jsonl_snapshot_writer.test.js` crée exclusivement des fichiers temporaires `financial_snapshots.jsonl` sur runner CI. **9 tests** couvrent fonctionnement sans garde, rejet d'un garde invalide, ouverture interdite pendant gel, absence de mutation en mémoire ou sur disque pendant gel, coordination RELEASE/ABORT sur le fichier, rotation conservant 24 entrées, purge avec confirmation, et génération successive. **[GitHub Actions P2.2 Node 22 : 54/54 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38507498886)** ; [P2.1 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38507499011) ; [RBAC SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38507498957).
- **Limites maintenues :** le garde n'est **pas injecté dans le service actif**, aucun export/chiffrement/restore n'a été effectué et les écritures externes ou interprocessus restent non coordonnées. Les erreurs I/O existantes de `persist`, `_prune` et `purge` restent traitées par leur logique historique (certaines capturées avec `lastError`) ; **aucune garantie nouvelle de durabilité après erreur disque n'est revendiquée**. La cohérence globale et les politiques de reprise/perte de mutation acceptée seront vérifiées avant activation, lors des tests finaux Phase 6. Les journaux Trading, Usage et autres fichiers non-SQLite sont encore à inventorier/protéger, sans toucher au Wallet.

## Extension P2.2 — journaux Trading History et Usage Ledger JSONL (14/10/2026)

- **Trading :** `App/services/trading-engine/history-store.js` accepte `snapshotGate` facultatif dans son constructeur existant `(root,opt)`. Le garde valide l'entrée avant création de répertoire, refuse `append(x)` tant qu'une génération de snapshot est gelée, et permet `list()` en lecture du journal stable. Aucun changement au format JSONL ni au contrat sans garde.
- **Usage :** `App/Core/Services/usage_ledger_v1.js` accepte un deuxième argument **facultatif** `new Ledger(root,{snapshotGate})` tout en préservant `new Ledger(root)`. Le garde vérifie la création du répertoire et l'entrée de `recordAI()` **avant** son bloc `try/catch` d'E/S. Les lectures `query()` et `summary()` restent possibles pendant le gel. Aucun changement à la structure des événements, au calcul de coût ou à la collecte normale.
- **Preuves locales sur fichiers éphémères :** `App/Tools/Tests/trading_usage_jsonl_snapshot_writers.test.js`, **13 tests** : écriture et relecture d'historiques fictifs, filtre, rejet de garde invalide, interdiction de créer des dossiers pendant un gel, immutabilité des fichiers pendant `PREPARE/QUIESCED`, `RELEASE`, `ABORT`, écrivain manquant (refus par défaut), erreurs I/O reportées (sans affirmation de durabilité). **[GitHub Actions P2.2 : 67/67 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38508151316)**, avec [P2.1 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38508151183) et [RBAC SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38508151047).
- **Limites de sûreté :** ne pas considérer le refus d'écrire pendant le gel comme un backlog durable : les requêtes de trading ou de consommation acceptées devront être reprises/rejetées de façon explicite au niveau des appels avant toute activation globale. Des écritures par un processus non coopératif ne sont pas bloquées par ce garde local ; la validation interservices (Phase 6), l'inventaire complet, les crashs, la reprise, la politique d'audit et la sauvegarde chiffrée restaurable restent obligatoires. **Les services actifs n'injectent aucun `snapshotGate` ; aucune opération GEN-1, Wallet ou donnée réelle.**

## Extension P2.2 — Mosaics / Annexes (14/10/2026)

- `App/Core/Mosaics/mosaic_store_v1.0.js` accepte `new MosaicStore(root,{snapshotGate})`. Le garde facultatif protège la création initiale du répertoire `Annexes/Mosaiques`, `write()` (écriture JSON dans `.tmp` puis renommage atomique) et `remove()` (suppression de mosaïque). `list/getByModuleId/moduleCatalog` demeurent lisibles pendant le gel. Les chemins Annexes non gérés par `MosaicStore` ne sont **pas** couverts.
- `App/Tools/Tests/mosaic_snapshot_writer.test.js` : **8 tests** sur fichiers temporaires, état du dossier figé pendant snapshot, RELEASE/ABORT, reprise sans résidu `.tmp`, garde invalide, writer manquant et compatibilité sans option. **[CI GitHub Actions Node 22 : 75/75 tests P2.2 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38508762951)** (67 précédents + 8).
- Le verrou de la clé maître client et le projet de schéma Auth v3 sont suivis séparément dans [la revue Phase 2](AUTH_DEBUG_2.1_PHASE2_IMPLEMENTATION_REVIEW.md). **CI ultérieure : [81 tests Node + 10 SQL Python SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38509073888)**, [P2.1 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38509073847), [RBAC SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38509073901).
- **P2.2 demeure OUVERT.** Gardes facultatives et non instanciées par les services actifs ; pas de coordination de l'ensemble des processus, pas d'intégrité interservices ou de restauration prouvées. Annexes hors Mosaics, scripts, racines runtime et créations de clés à l'import restent non exhaustivement inventoriés.

## Registre des écrivains — couverture exigée

Chaque base, fichier persistant, écriture d'initialisation ou migration doit disposer d'un enregistrement :

| Champ | Valeur attendue |
| --- | --- |
| `resource_id` | Chemin logique/volume à conserver ; chemin réel validé par le déploiement |
| `writer_id` | Service/processus/instance, génération et PID non fiabilisé seul |
| `write_methods` | `INSERT/UPDATE/DELETE/DDL`, append, rename atomique, pruning/retention, startup/migration |
| `criticality` | Auth-critique, historique métier/audit, reconstructible **après confirmation**, Wallet congelé |
| `owner` | Propriétaire de l'autorité de maintenance et des droits sur le volume |
| `barrier_support` | Acquittement d'arrêt, file différée bornée/idempotente, timeout, reprise/crash |
| `test_id` | Test automatisé prouvant arrêt/reprise sans perte et impossibilité du bypass |

Partir de `clients.sqlite`, Settings, Portfolio, Fundamental, Registry, Telemetry/Microstructure, journaux Financial/Trading/Usage, mosaïques, états non-SQLite et scripts CLI. **Ne pas déclarer l'inventaire exhaustif** avant couverture des appels indirects et vérification de la liste des services au runtime de banc.

## Protocole cible

1. `PREPARE_SNAPSHOT(generation, target_scope)` authentifié : maintenance explicitement autorisée ; registre des writers et processus vivants figé, sans ordres LIVE.
2. Chaque writer arrête les **nouvelles mutations**, finit/rollback ses transactions en cours puis acquitte `QUIESCED(generation, writer_id, pending=0)`. Une lecture publique pure peut continuer depuis le cache ; **jamais de suppression d'une mutation acceptée**.
3. Coordinateur rejette les générations incomplètes, writers non enregistrés ou ACK manquants, démarreurs automatiques, versions incompatibles, conflits de rôles ou timeout.
4. Capture des SQLite par Online Backup et des fichiers non SQLite au moyen d'une procédure **consistante et testée**. Staging privé, validation d'intégrité/génération, sauvegarde chiffrée authentifiée, manifest fiable, publication atomique de génération.
5. `RELEASE_SNAPSHOT(generation)` ; reprise idempotente des écritures, mesure de latence d'interruption, backlog et I/O ; audit sans valeurs secrètes.
6. **Échec :** refus de publier la génération incomplète, `ABORT`, reprise coordonnée, nettoyage borné ; un writer redémarré pendant le gel ne peut pas écrire sans s'enregistrer à nouveau. Tester kill -9, crash du coordinateur, disques pleins, DB corrompue et requests concurrentes.

## Vérifications obligatoires avant validation P2.2

- [ ] Inventaire **exhaustif** des mutations de toutes les ressources critiques y compris démarrage, migrations, JSONL et Annexes. Les ressources Wallet demeurent **hors champ de mutation**, simplement préservées dans leur état historique ; pas de test de seed/clé Wallet.
- [ ] Registre des writers effectifs sur banc isolé et coordination `PREPARE/QUIESCED/RELEASE/ABORT` implantée sur **tous** les chemins critiques.
- [ ] Tests multicomposants avec writer réticent, non coopératif, crash/restart d'un Engine, crash coordinateur, échec disque et timeouts ; aucun snapshot incomplet publié ni modification perdue.
- [ ] Sauvegarde **chiffrée et restaurable de bout en bout sur copies autorisées**, avec conservation de l'original `client_master.key`, validation AES-GCM et `clientId`, conflits WAL/DELETE et intégrité inter-ressources ; pas de base/clé GEN-1 sans consentement séparé.
- [ ] P95/p99 et charge CPU/RAM/I/O mesurés face à une baseline comparable des services, respect du budget de régression sans suppression de garde de sécurité ; aucune opération bloquante par tick.
- [ ] Démontrer séparation DEBUG/RELEASE, protection RBAC et sécurité d'accès à la politique/aux sauvegardes.
- [ ] Vérification CI GitHub de tests automatiques, revue du rollback et accord de clôture d'Overflow.

**Clôture P2.2 ≠ permission de déployer** : le verrou de l'ensemble Auth 2.1 s'applique toujours pendant les Phases 3–7. Après réussite, envisager un build DEBUG uniquement dans un environnement de test isolé, pas sur le VPS GEN-1 sans validation finale.


## Campagne interprocessus DEBUG isolée — 15/10/2026

**Intégration fonctionnelle vérifiée :** Core `auth21_core_local_trial_wiring.createTrial()`
inscrit désormais **4 écrivains Core locaux** (clients, settings, mosaics, annex-root)
et **4 processus Engine réels** (Portfolio, MarketData, Fundamental, Trading)
dans une barrière PREPARE/QUIESCED/RELEASE/ABORT unique lorsque
`IATB_AUTH21_SNAPSHOT_IPC_TRIAL=1`. Le transport Core→Engines est
strictement en loopback et signé HMAC, avec portée par moteur, nonce anti-rejeu
et SHA-256 du corps exact. La clé IPC préexistante doit être confinée au
banc isolé avec des permissions 0600 ; aucun secret n'est généré par un service.

**Garde des écritures en mode isolé :** Portfolio SQLite + UsageLedger JSONL,
MarketData Registry/Telemetry/Microstructure SQLite + Financial JSONL,
Fundamental SQLite et Trading History JSONL reçoivent un garde de gel au
point de création des stores. Les commandes d'arrêt et reprise atteignent
leurs vrais serveurs HTTP. Les services non équipés d'un participant restent
fermés aux requêtes métier en mode Auth21 isolé.

**Sauvegarde restaurable sur copie :** `auth21_engine_encrypted_bundle.js` capture
des images SQLite compatibles WAL et des fichiers JSONL strictement allowlistés
pendant l'état QUIESCED, chiffre le bundle en mémoire (AES-256-GCM), et
restaure dans un nouveau répertoire scratch privé après contrôle AEAD,
SHA-256, intégrité SQLite et validité JSONL. Le test de bout en bout démarre
les vrais scripts des quatre Engines, gèle les huit participants, récupère
leurs bases et JSONL de test, vérifie la restauration et le refus d'une mauvaise
clé. Les tests de reprise après échec RELEASE/ABORT vérifient le maintien
BLOCKED et l'obligation d'une reprise explicite.

**Validation GitHub Actions :**
[Auth P2.2 SUCCESS (run 38661470422)](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38661470422).
Les tests P2.1 et RBAC associés au même commit sont aussi SUCCESS.
Tout cela est exécuté uniquement avec des copies temporaires synthétiques.

**Critères toujours non démontrés avant clôture P2.2 :** inventaire exhaustif
des écrivains et injections dans tous les services et scripts périphériques,
incluant startup/rétention hors stores instrumentés, coordination en
présence d'un redémarrage complet d'Engine avec epoch durable,
test non-coopératif *sur un vrai processus*, capture/restauration de
l'ensemble des ressources interservices et des Annexes pertinentes avec
leurs clés originales compatibles, mesures comparables p95/p99 et
rollback d'un lot complet après panne en pleine capture. **P2.2 reste [ ]**.
Aucun changement GEN-1, aucun Wallet manipulé, aucune migration réelle.


## Suivi P2.2 — Durabilité, latences et recensement (15/10/2026)

- **Redémarrage moteur pendant PREPARE** : `auth21_durable_snapshot_writer.js` écrit une génération et un état de gel durables avant ACK. Le test de bout en bout tue puis relance le véritable Trading Engine pendant un gel, vérifie le refus d'un nouveau PREPARE, et exige `recoverBlocked()` depuis Core avant retour à IDLE. Validé sur runner isolé lors du [run 38662339171](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38662339171).
- **Latence réelle de barrière** : 16 cycles sur Core et quatre vrais moteurs ; p95 = **21,61 ms**, p99 = **21,61 ms** sur le runner CI. Ce ne sont pas des latences de capture/restauration sous charge ni des benchmarks GEN-1.
- **Inventaire systématique, non encore clôturé** : `auth21_writer_source_census.js` parcourt en lecture seule les sources JS de `App`, détecte des opérations SQL/filesystem/shell et signale les chemins non revus, sans importer les modules. Une détection statique ne peut pas garantir à elle seule la couverture des appels dynamiques, scripts système et Annexes. Son test a été ajouté à la CI ; le résultat de la dernière exécution doit être validé indépendamment.
- **État de clôture : P2.2 reste OUVERT** tant qu'une revue des écritures non couvertes (dont scripts et Annexes), une restauration globale de tous les stores/identités et un essai complet d'arrêt/démarrage/rétention/rollback sous charge ne sont pas documentés et réussis. Aucun déploiement GEN-1.


## Audit statique et stabilisation multi-Engine — 15/10/2026

**Preuve CI sur le commit c8c202f :** [P2.2 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38670823327),
[P2.1 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38670823436) et
[RBAC SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38670823321).

L'audit automatique resserré signale **52 fichiers**, dont **9 des 12 stores
pré-revus** détectés par heuristique, et **43 autres fichiers** (31 appels
filesystem potentiels, 4 appels SQL et 8 appels processus uniquement). Les
12 stores ont bien leur inventaire explicite indépendant ; le nombre 9
ne représente pas une régression de protection. Chaque candidat actuel est
classé dans `auth21_writer_triage.js`, sans confondre triage et protection.
Voir [le rapport détaillé](AUTH_DEBUG_2.1_P22_WRITER_TRIAGE.md).

**Corrections supplémentaires** : Wallet et Vault refusent tout accès
mutateur en essai snapshot ; les tâches périodiques Portfolio vérifient
l'époque gelée et les collecteurs autonomes Fundamental ne démarrent
pas pendant le test d'IPC isolé. Les fichiers de journal de coûts Portfolio
`App/.runtime/accounting/usage_ledger.jsonl` sont désormais inclus
dans l'allowlist de capture/restauration chiffrée et couverts par un test
de restauration. Les erreurs transitoires d'ACK RELEASE reçoivent au maximum
une nouvelle tentative sur la **même génération** ; tout échec sémantique
continue à laisser le coordinateur BLOCKED. Les sauvegardes sur runner
CI ont produit p95 = **51,90 ms**, p99 = **53,16 ms** pour 20 cycles
capture chiffrée + restauration ; la barrière seule donne p95/p99 =
**25,21 ms** pour 16 cycles. Valeurs de fixture synthétique, non GEN-1.

**Pas de clôture prématurée** : P2.2 reste ouvert selon les critères
initiaux tant que les scripts hors Node, tâches différées non instrumentées
et la campagne Phase 6 ne sont pas examinés sur un environnement comparable
à l'instance réelle. Bank/Wallet, logs opérationnels et certains outils
opérateur sont explicitement exclus de l'archive P2.2 ; aucune restauration
complète d'une instance réelle ne peut être revendiquée à ce stade.
