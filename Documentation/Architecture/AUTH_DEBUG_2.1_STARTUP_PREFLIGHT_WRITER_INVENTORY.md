# IA-TB DEBUG 2.1 — Phase 2 : préflight startup et inventaire des writers

**Date :** 14/10/2026. **Branche :** `feature/debug-2.1-auth-design`.
**Statut : mode de diagnostic sans écriture et vérification statique des gardes existantes VALIDÉS sur fixtures. Phase 2 / P2.2 NON clos.**

## Lot regroupé : deux composants et une campagne CI

- `App/Core/Shared/paths.js` reçoit un mode explicitement **opt-in** `IATB_PATHS_PREFLIGHT_READONLY=1`. Dans ce mode, son `require()` n'appelle aucune création de dossiers ni génération de clés internes. Les appels explicites `ensureAppRuntimeDirs()`, `ensureUpdateRuntimeDirs()`, `ensureInternalServiceRuntimeKey()` et `ensureCommunicationProtocolRuntimeKey()` échouent sous `IATB_PATHS_PREFLIGHT_READONLY`. Aucun changement du mode de démarrage normal : il conserve les initialisations historiques, y compris les deux clés internes. Ce mode n'est pas une procédure de démarrage du serveur.
- `App/Tools/Tests/auth21_paths_startup_preflight.test.js` exécute les imports uniquement dans des sous-processus Node avec racines synthétiques temporaires, vérifie l'absence de création en lecture seule, l'absence de chmod/écrasement des secrets malformés, le refus des quatre fonctions explicites, ainsi que le fonctionnement historique des initialisations sur une racine isolée et leur refus d'une clé préexistante invalide.
- `App/Tools/CI/auth21_writer_inventory.js` est un **inventaire de sources en lecture seule**, sans aucun `require()` des stores inspectés. Il répertorie 12 modules ayant un argument `snapshotGate` et un appel `assertWritable` dans leur code source ; son résultat est volontairement marqué `exhaustive:false`, `allRuntimeWritersInjected:false`, `runtimeStartupStillEager:true`. Une présence textuelle de garde **ne prouve ni que chaque write est protégé, ni que l'Engine la reçoit**.
- `App/Tools/Tests/auth21_writer_inventory.test.js` assure une alerte si un module contrôlé disparaît, perd ses marqueurs de garde ou si le mécanisme de préflight de `paths.js` est retiré. Les fichiers ne sont ni importés ni exécutés par le scanner.

## Douze propriétaires de stockage recensés (gardes facultatives)

| Catégorie | Fichiers |
| --- | --- |
| SQLite Clients/Settings/Portfolio | `Core/Clients/client_repository.js`, `Core/Settings/sqlite_settings_store.js`, `Portfolio/Engine/portfolio_store.js` |
| SQLite Fundamental | `Fundamental/Engine/database_core.js`, `Fundamental/Engine/database.js` |
| SQLite MarketData | `MarketData/Registry/market_registry.js`, `MarketData/Storage/api_telemetry_store.js`, `MarketData/Storage/microstructure_store.js` |
| JSONL | `MarketData/Financial/financial_store.js`, `services/trading-engine/history-store.js`, `Core/Services/usage_ledger_v1.js` |
| Annexes | `Core/Mosaics/mosaic_store_v1.0.js` |

## Preuves de validation

- **[GitHub Actions P2.2 SUCCESS — run 38544638762](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38544638762)** : 81 tests historiques + **14 tests de ce nouveau lot** + 16 migration/CAS + 23 sessions + 24 ADMIN + 26 premier ADMIN/DEBUG + 22 clé/restauration + 20 bundle Clients + 20 bundle multi-ressources = **246/246 Node.js** ; **15/15 Python SQLite**, soit **261/261 tests réussis**. Aucun échec.
- Aucun test n'a accès aux secrets ou bases réelles, aux wallets ni aux services GEN-1. Les seuls secrets générés/inspectés sont de courtes données fictives dans un sous-dossier temporaire.

## Travail restant impératif

1. **Auditer toutes les entrées runtime qui importent `paths.js`**, les appels directs à `fs`, les écritures des scripts install/start/update/restart et les fichiers non inscrits au catalogue. Le mode actuel ne sécurise pas le démarrage normal qui reste volontairement inchangé.
2. **Brancher explicitement les `snapshotGate` dans les vraies constructions de services**, démarrage inclus ; bloquer les créations de clés/volumes/DB sous `PREPARE/QUIESCED` même en cas de service non coopératif. Ne pas utiliser le mode de préflight comme un substitut à l'injection réelle.
3. Ajouter les vérifications d'écritures manquantes, flush JSONL/Annexes, migrations, rétention et réparation de données, ainsi que les chemins d'arrêt et de redémarrage.
4. Prouver la cohérence et la reprise multi-processus sous crash, timeout, WAL, relecture et restauration globale en **Phase 6**, selon l'arbitrage d'Overflow ; mesurer p95/p99 et tester les droits fichiers.
5. Ne jamais migrer de données réelles, modifier Wallet ou déployer GEN-1 sans autorisation distincte et validation finale.

**Conclusion : plusieurs tâches de protection startup/inventaire sont regroupées et testées. P2.2 et la Phase 2 restent OUVERTS : le passage en production reste interdit.**
