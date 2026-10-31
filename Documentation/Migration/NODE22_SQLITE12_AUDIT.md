# IA-TB — Migration Node.js 22 / better-sqlite3 12.4.1

Statut : audit initial documenté ; **aucune migration de code effectuée**.

## Périmètre et règles validées
- Branche de travail : `migration/node22-sqlite12` (issue de `debug`).
- Runtime cible unique : Node.js 22 ; une dépendance applicative `better-sqlite3@12.4.1` verrouillée.
- Installation des dépendances **au build seulement** ; aucune installation npm au démarrage.
- SQLite conservé ; stockage persistant distinct pour DEBUG et RELEASE.
- Ne jamais modifier une base réelle sans sauvegarde vérifiée et test de restauration.
- Aucun ordre réel de trading pendant les tests.
- Pas de fusion vers `debug` / `main` sans validation.

## Inventaire confirmé (audit partiel)

| Composant | Fichier | Accès SQLite / risque |
| --- | --- | --- |
| Fundamental | `App/Fundamental/Engine/database_core.js` | Charge `Fundamental/node_modules/better-sqlite3`, dépendance 8.7.0 |
| Fundamental bootstrap | `App/Fundamental/Engine/bootstrap_sqlite.js` | `ensureSync()` installe 8.7.0 à l'exécution ; incompatible avec la politique de build |
| Fundamental install | `App/Fundamental/install_sqlite.command` | Installation explicite 8.7.0 et runtime macOS historique |
| Portfolio | `App/Portfolio/Engine/portfolio_store.js` | Cherche le module dans Portfolio, Fundamental puis node_modules |
| Core Settings | `App/Core/Settings/sqlite_settings_store.js` | Backend CLI sqlite3 + repli natif ; conversion des résultats texte tabulés |
| Core Clients | `App/Core/Clients/client_repository.js` | CLI sqlite3, commandes `.timeout`, lecture tabulée, migrations SQL |
| Market Registry | `App/MarketData/Registry/market_registry.js` | CLI sqlite3, concaténation de SQL, transactions BEGIN/COMMIT |
| Market Microstructure | `App/MarketData/Storage/microstructure_store.js` | CLI sqlite3, stockage/retention et lecture tabulée |
| API Telemetry | `App/MarketData/Storage/api_telemetry_store.js` | CLI sqlite3, stockage/retention, schémas télémétrie |
| Paths | `App/Core/Shared/paths.js` | `App/.runtime` interne + `IATB_DATA_ROOT` externe ; volumes à étudier |
| Bank | `App/Bank/package.json` | Dépendance `ethers@5.7.2`, à intégrer au verrouillage global |

Inventaire npm observé : `App/Bank/package.json`, `App/Fundamental/package.json`, `App/Fundamental/package-lock.json`. Cela **ne prouve pas** l'absence d'autres dépendances indirectes, commandes shell ou chemins de stockage.

## Risques à traiter avant modifications
1. Différence de contrat : CLI sqlite3 renvoie du texte TSV, better-sqlite3 renvoie des objets ; conserver les formats publics ou migrer tous les consommateurs.
2. Sémantique CLI : `.timeout` n'est pas du SQL ; remplacer par timeout/pragma approprié.
3. Compatibilité SQL : transactions multiples, PRAGMA, WAL/DELETE, schémas et migrations existantes.
4. Résolution native : supprimer les chemins `Fundamental/node_modules` / `Portfolio/node_modules` ; centraliser la résolution.
5. Cycle de vie : retirer toute installation npm à chaud, démarrer en échec explicite si dépendance manquante.
6. Stockage : ne pas inclure `App/.runtime` et secrets dans une image éphémère ; garantir persistance et isolation.
7. Compatibilité macOS : ancien Node 16 incompatible avec la cible ; définir un lanceur compatible ou retirer officiellement l'ancien runtime.
8. Vérifier l'ensemble des autres moteurs et scripts, y compris les appels indirects.

## Portes de validation
- G0 : audit complet du dépôt et matrice de tests signés.
- G1 : build Docker déterministe (`npm ci`) et dépendance native unique.
- G2 : tests SQLite sur bases vierges **et copies** de bases existantes, intégrité et migrations.
- G3 : tests unitaires/intégration des moteurs, Core, Bank, UI, Supervisor.
- G4 : démarrage/arrêt/reprise DEBUG sans trafic de trading réel, journalisation et isolation.
- G5 : revue et décision explicite avant RELEASE.

## Tests préalables connus
- `better-sqlite3@8.7.0` : compilation échouée sous Node 22.23.3.
- `better-sqlite3@12.4.1` : installation et `SELECT 1` réussis sous Node 22.23.3.
- **Aucun test d'intégration IA-TB complet réussi à ce stade.**

## Prochaine action
Compléter l'inventaire des usages SQLite et des dépendances à l'échelle de `App/`, relever les consommateurs des interfaces de stockage, puis préparer les tests de contrat avant le moindre remplacement de backend.
