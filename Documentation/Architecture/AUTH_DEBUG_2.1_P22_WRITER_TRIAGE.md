# Auth21 P2.2 — Revue des écritures candidates (DEBUG uniquement)

Ce document fixe la frontière technique du recensement statique et ne doit
**jamais** être interprété comme un audit de sécurité de production, une autorisation
de restaurer des wallets, ou une validation de déploiement sur GEN-1.

## Méthode

`App/Tools/CI/auth21_writer_source_census.js` signale les appels suspects
de mutation filesystem, de SQL et de création de processus à partir du **code
source** (lecture seule, sans charger les services). Le rapport initial a trouvé
74 fichiers, dont 12 stores déjà examinés et 62 candidats supplémentaires.
Cette observation mélangeait de vrais append/write, des appels non persistants
comme `module.prepare()`, des commandes CP/1 et des scripts opérateur.
Les expressions de détection ont été resserrées afin de réduire ces faux
positifs et d'identifier séparément les candidats filesystem et les appels
SQL/shell. Le registre `auth21_writer_triage.js` classe explicitement les
fichiers connus ; une future découverte sans catégorie fait échouer le test.

L'absence d'un fichier dans les résultats **ne garantit pas** qu'il ne puisse
pas écrire : appels dynamiques, scripts shell, bibliothèques externes, processus
autonomes et génération indirecte de fichiers échappent à cette méthode.

## Décisions de couverture

| Zone | Décision en environnement isolé | Preuve / limites |
| --- | --- | --- |
| Core Clients et Settings | Gel local et copie SQLite autorisée | Garde synchrone sur 2 domaines ; clients master key synthétique capturée sous AES-GCM |
| Portfolio et usage accounting | Barrière Portfolio signée ; JSONL accounting ajouté à l'allowlist de capture | Test unitaire de restauration du JSONL ; vraie sauvegarde interprocessus inclut Portfolio DB |
| MarketData | Barrière Engine signée ; Registry, Telemetry, Microstructure et Financial JSONL | Tests de vrais processus et SQLite WAL |
| Fundamental | Barrière Engine signée sur les stores SQL | JSONL observability et journaux de diagnostic non capturés |
| Trading | Barrière signée, génération persistée, redémarrage et reprise Core | History JSONL sauvegardé ; aucun ordre LIVE |
| Indicators et Strategy | Barrières de leurs Engine et gardes de store | Définition personnalisée, paramètres et statistiques de stratégie testés en fixture |
| Annexes Strategies/Mosaics | Propriétaires Core explicites dans la barrière | Seules les ressources allowlistées de la fixture sont archivées |
| Bank/Wallet | **Exclusion stricte de P2.2** | Wallet master-key, migration et écritures Vault refusés en essai snapshot ; pas de clés ni wallets réels capturés |
| Core Admin, launcher, updates | Opérations de cycle de vie isolé bloquées ou laissées hors backup | Ne pas utiliser des scripts opérateur pour contourner la barrière |
| Logs opérationnels (Firewall, Router, Fundamental, Supervisor, etc.) | Journaux de diagnostic hors périmètre de cohérence métier, non sauvegardés | Impossible de prétendre à une restauration intégrale des logs |
| Outils smoke/preflight/bridge | Outils opérateur distincts, hors processus participant | Aucune exécution de ces outils pendant PREPARE/QUIESCED |

Les appels dans `Core/Shared/sqlite_compat.js` sont des primitives de bas
niveau : leur seule présence ne crée pas un nouveau store logique. Leur usage
depuis un chemin non instrumenté reste une **surface de contournement
potentielle** qui nécessite une revue des appelants. De même, les fonctions
de mutation dans `Core/Server/server.js` doivent rester sous le route gate,
les contrôles d'annexes et les gardes des stores ; une détection textuelle du
mot `assertWritable` ne suffit pas à prouver chaque parcours.

## Constat et limites de clôture

Les tests sur copies éphémères ont déjà validé les participants Engine réels,
les ACK signés, la protection contre le rejeu, la capture SQLite/JSONL,
le chiffrement AES-256-GCM, la restauration scratch, le rejet des archives
corrompues, le rollback d'une restauration partielle et la reprise d'un Engine
après crash. Le test de 20 cycles mesure le p95/p99 de l'aller-retour complet.
Les tests nouveaux vérifient aussi les écritures Bank/Vault interdites, et
l'intégration du ledger d'usage aux bundles autorisés.

**Non démontré :** restauration de l'intégralité d'une instance utilisateur
réelle, toutes les tâches périodiques exécutables hors des principaux stores,
et équivalence sous charge réelle sur GEN-1. Aucun déploiement, migration
réelle, import wallet, paiement, ordre LIVE ou changement de clés n'est admis.
Une CI verte prouve la fixture testée, pas la sécurité de production.

## Règle de décision

P2.2 ne doit être déclarée close que si le périmètre approuvé est clairement
la sauvegarde isolée des domaines énumérés ci-dessus et si tous les tests
associés à **la dernière révision** sont verts. La clôture ne signifie en
aucun cas autorisation de déployer les Phases 3–7 ni sauvegarder Bank/Wallet.
