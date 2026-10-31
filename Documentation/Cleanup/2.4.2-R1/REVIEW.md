# Nettoyage 2.4.2-R1 — passes 1 et 2

Base immuable : `189e9c09f1549dd8f2f73bb62c62fc19d6f31d15`. Nouvelle branche `2.4.2-R1`.
Ce plan est écrit avant la suppression des fichiers ou la modification des sources.
L'inventaire TSV donne une décision, une taille et un SHA-256 pour chaque fichier.

## Passe 1 — périmètre inspecté

2 166 fichiers suivis, 23 552 726 octets. Analyse de 1 162 unités JavaScript,
y compris les scripts intégrés aux pages ; 25 599 fonctions et 24 861 objets
syntaxiques sur toute l'arborescence, archives comprises. Les 537 unités de
l'application (10 363 fonctions) sont toutes syntaxiquement valides. Une ancienne
page du build 1.12 DEBUG contient une erreur syntaxique ; ce build historique
fait partie des suppressions. Les imports relatifs, les noms d'assets, les
commandes CP/1, les launchers, la CI et les lectures de fichiers ont été contrôlés.

Les suffixes v1/v2/v3 ne sont pas des preuves d'obsolescence : la 2.4 utilise
encore ces interfaces et noms de fichiers. Les migrations SQL, le chiffrement,
les contrats Auth21, les clés externes, les tests, les notices tierces et les
modules dynamiques restent conservés. Swap/Bridge et coffres suspendus en 2.4.1
restent présents et bloqués, conformément à la décision précédente.

## Passe 2 — opérations de suppression

| Règle | Fichiers | Octets |
| --- | ---: | ---: |
| D01 | 1213 | 15254545 |
| D02 | 61 | 64524 |
| D03 | 1 | 32405 |
| D04 | 15 | 96236 |
| D05 | 6 | 1638314 |
| D06 | 4 | 16567 |
| D07 | 1 | 45174 |

- **D01** : supprimer les copies de builds 1.11.7, 1.12 DEBUG et 2.0 DEBUG, leurs bases/WAL et leurs artefacts. Aucun import runtime ne les utilise ; Git conserve l'historique.
- **D02** : supprimer les archives de rapports et anciens manifests Versions. Vérifier qu'aucun exécuteur/launcher 2.4 ne les lit.
- **D03** : supprimer le ZIP de patch 1.11.6→1.11.7, indépendant de l'UpdateManager courant. Ne modifier aucune sauvegarde d'installation extérieure au dépôt.
- **D04** : supprimer plans de release, rapports de correctifs et doubles pages Wiki obsolètes explicitement listés. Rediriger leurs liens vers le commit de base ; conserver toute documentation de contrat encore utilisée par les tests ou le runtime.
- **D05** : supprimer les anciens constats d'intégrité et maquettes d'authentification sans référence. Conserver les notices d'attribution et schémas d'architecture utiles.
- **D06** : retirer qualification hardcodée 2.2.1, Compose 2.2 et prévisualisation HTTP C3 obsolète. Conserver les tests RBAC, Compose génériques et la qualification Auth21 courante.
- **D07** : retirer seulement l'historique d'installation embarqué dans cette copie source. L'UpdateManager initialise un historique vide sur une installation neuve ; les historiques réels, bases et comptes d'autres installations ne sont ni visités ni modifiés. Ajouter une exclusion Git pour éviter de recommiter cet état généré.

## Fonctions et objets fantômes

Les 35 premières déclarations sans lecture conduisent à 42 fonctions supprimables,
3 déclarations d'objet/tableau, une écriture sans lecteur et un import devenu inutile.
L'analyse suit la portée lexicale et les exports ; la fermeture transitive est
limitée aux helpers dont les seuls consommateurs sont supprimés. Aucun handler
exposé, nom de route, schéma CP/1 ou règle d'autorisation active n'est supprimé.
Les anciens collecteurs réseau CME sont retirés ; leurs parseurs et diagnostics
exportés et testés restent présents, ainsi que Finance Calendar/FED.

| Fichier | Élément | Type | Justification de portée |
| --- | --- | --- | --- |
| `App/Core/Server/server.js` | `ACTION_TO_PERMISSION` | ObjectExpression | no-lexical-read |
| `App/Core/Updates/update_manager_v1.0.js` | `copyTree` | function | no-lexical-read |
| `App/Frontend/JS/bank_controller_v1.0.js` | `demos` | ArrayExpression | no-lexical-read |
| `App/Frontend/JS/bank_controller_v1.0.js` | `bindWallets` | function | no-lexical-read |
| `App/Frontend/JS/bank_controller_v1.0.js` | `walletRows` | function | no-lexical-read |
| `App/Frontend/JS/bank_controller_v1.0.js` | `walletDemo` | function | no-lexical-read |
| `App/Frontend/JS/bank_controller_v1.0.js` | `confirmWallet` | function | only-consumers-removed-earlier |
| `App/Frontend/JS/bank_controller_v1.0.js` | `walletDetail` | function | only-consumers-removed-earlier |
| `App/Frontend/JS/bank_controller_v1.0.js` | `perm` | function | only-consumers-removed-earlier |
| `App/Frontend/JS/bank_transfer_compact_v1.js` | `sourceAddress` | function | no-lexical-read |
| `App/Frontend/JS/bank_wallets_v2.0.js` | `cryptoChoices` | function | no-lexical-read |
| `App/Frontend/JS/bank_wallets_v2.0.js` | `transferSourceOptions` | function | no-lexical-read |
| `App/Frontend/JS/bank_wallets_v2.0.js` | `walletAddress` | function | no-lexical-read |
| `App/Frontend/JS/bank_wallets_v2.0.js` | `cryptoLogo` | function | only-consumers-removed-earlier |
| `App/Frontend/JS/bank_wallets_v2.0.js` | `walletAccount` | function | only-consumers-removed-earlier |
| `App/Frontend/JS/chart_economic_events_v2_2_5.js` | `normalize` | function | no-lexical-read |
| `App/Frontend/JS/fundamental_controller_v3.js` | `removeLegacyDiagnosticObservabilityViews` | function | no-lexical-read |
| `App/Frontend/JS/fundamental_controller_v3.js` | `watchLegacySchedulerRemoval` | function | no-lexical-read |
| `App/Frontend/JS/fundamental_controller_v3.js` | `normalizeFundamentalNavigation` | function | no-lexical-read |
| `App/Frontend/JS/fundamental_controller_v3.js` | `IATB_CAL_ROWS` | write-only-assignment | no-consumer |
| `App/Frontend/JS/fundamental_controller_v3.js` | `IATB_CAL_ROWS` | ArrayExpression | no-lexical-read |
| `App/Frontend/JS/fundamental_controller_v3.js` | `removeLegacySchedulerBlocks` | function | only-consumers-removed-earlier |
| `App/Frontend/JS/indicator_ui_v2.0.js` | `evidenceBatch` | function | no-lexical-read |
| `App/Frontend/JS/indicator_ui_v2.0.js` | `lastFinite` | function | only-consumers-removed-earlier |
| `App/Frontend/JS/portfolio_controller_v1.0.js` | `healthClass` | function | no-lexical-read |
| `App/Frontend/JS/statistiques_v1.0.js` | `leaderCard` | function | no-lexical-read |
| `App/Frontend/JS/statistiques_v1.0.js` | `barChart` | function | no-lexical-read |
| `App/Frontend/JS/statistiques_v1.0.js` | `poolThumb` | function | only-consumers-removed-earlier |
| `App/Frontend/JS/trading_dashboard_v2.0.js` | `syncIndicatorDock` | function | no-lexical-read |
| `App/Frontend/JS/trading_dashboard_v2.0.js` | `chatShell` | function | no-lexical-read |
| `App/Frontend/JS/trading_dashboard_v2.0.js` | `indicatorDock` | function | no-lexical-read |
| `App/Frontend/Pages/app_v1.0.html` | `drawLine` | function | no-lexical-read |
| `App/Frontend/Pages/app_v1.0.html` | `strategyError` | function | no-lexical-read |
| `App/Frontend/Pages/app_v1.0.html` | `strategyCatalogItem` | function | no-lexical-read |
| `App/Frontend/Pages/app_v1.0.html` | `strategyRuntimeLabel` | function | no-lexical-read |
| `App/Frontend/Pages/app_v1.0.html` | `authScreen` | function | no-lexical-read |
| `App/Frontend/Pages/app_v1.0.html` | `changePassword` | function | no-lexical-read |
| `App/Frontend/Pages/app_v1.0.html` | `strategyError` | function | only-consumers-removed-earlier |
| `App/Frontend/Pages/chart_viewer_v1.0.html` | `setTheme` | function | no-lexical-read |
| `App/Fundamental/Providers/calendar_provider.js` | `collectCme` | function | no-lexical-read |
| `App/Fundamental/Providers/calendar_provider.js` | `collectCmeExpirations` | function | no-lexical-read |
| `App/Fundamental/Providers/calendar_provider.js` | `diagnostics` | function | only-consumers-removed-earlier |
| `App/Fundamental/Providers/calendar_provider.js` | `WEB import` | import | obsolete collectors removed; Fedwatch/Finance retain own transport |
| `App/MarketData/Financial/financial_collector.js` | `top` | function | no-lexical-read |
| `App/MarketData/Financial/financial_quality_v2.js` | `pct` | function | no-lexical-read |
| `App/Portfolio/Engine/portfolio_service.js` | `body` | function | no-lexical-read |
| `App/Strategy/Engine/strategy_v2_core.js` | `stale` | function | no-lexical-read |

## Processus des autres modifications

M01 applique les suppressions AST de la liste et reparse chaque fichier.
M02 aligne VERSION/UI/npm/manifest/pointeur launcher en 2.4.2, révision R1 ;
le suffixe de branche ne casse pas le contrat numérique de l'UpdateManager.
M03 actualise README, changelog et Wiki versionné et leurs liens historiques.
M04 ajoute audit reproductible, contrôle de dépendances/ressources et exclusions
Git ; la CI réexécute les tests métier et les essais navigateur complets.
Les noms exacts figurent dans PLAN.json. Toute extension nécessaire sera consignée
avant application, sans suppression fondée uniquement sur un préfixe de version.

## Passe 3 — contrôles prévus

1. Vérifier SHA-256 de chaque fichier candidat avant suppression et hash de l'arbre final publié.
2. Reparser JS, scripts HTML, JSON, vérifier imports/assets et cohérence des versions.
3. Vérifier que les commandes et types CP/1, migrations, built-ins et handlers courants sont conservés.
4. Exécuter Trading, Market Data/Liquidity, Fundamental, Supervisor, Indicator/ChartViewer, Auth21, snapshots/ingress et les essais Firefox réels existants.
5. Publier seulement la nouvelle branche après CI sans échec/skip. Déploiement local séparé.

La qualification porte sur la copie source ; aucune réécriture de l'historique Git,
aucun effacement de données externes et aucune promotion main/production. Le gain
annoncé porte sur les fichiers extraits du build. Un clone complet conserve encore
les anciens objets Git ; `git clone --depth 1 --branch 2.4.2-R1` évite ce transfert.
L'UpdateManager historique n'installe pas des suppressions de source : cette
candidate se récupère par checkout/clone propre, pas par un faux patch incrémental.
