# IA-TB — Inventaire MarketDataCollector : capacités, frais d'exécution et Bridges

**Référence :** branche `debug-v2.01`, état du code au 16 octobre 2026 (hotfix 2.0.2.1). **Type :** audit documentaire statique, pas une validation de disponibilité des données sur GEN-1. Aucun changement applicatif ou configuration réalisé.

## 1. Architecture et frontières

Le service `App/MarketData/market_data_service.js` expose les données via les actions CP/1 déclarées dans `App/Core/Communication/ProtocolRegistry/marketdata.json`. Le traitement financier `App/MarketData/Financial/financial_collector.js` récupère et normalise CoinGecko et DeFiLlama, contrôle la qualité, passe les données par le Data Firewall et alimente le stockage historique `financial_snapshots.jsonl`. Les familles microstructure et DexScreener ont leurs caches et historiques, notamment SQLite. L'accès autorisé depuis l'UI dépend aussi des allowlists Router ; **existence d'une action CP/1 ≠ accès UI autorisé**.

Les réponses déjà validées, leur provenance, leur date et leurs limites doivent être privilégiées. Ne jamais contacter directement un fournisseur depuis le navigateur pour contourner Router/Firewall, ni déduire une cotation exécutable d'une statistique globale.

## 2. Capacités constatées dans le code

| Domaine / fournisseur | Champs et actions réellement implémentés | Portée / limites |
| --- | --- | --- |
| Marchés CEX et DEX du catalogue | `marketdata.symbols`, ticker, chandeliers OHLCV, catalogue de fournisseurs, configuration ; sources selon `provider_catalog` | Couverture dépend du fournisseur sélectionné, activation et accès réel. Ce n'est pas une API universelle de cotation de swap. |
| CoinGecko | `/global`, `/coins/markets`, recherche, prix simples, registre, marchés et classements, volumes et capitalisations mondiaux, dominance BTC, enrichissement exchanges | Quotas/rate limiting, cache de snapshots validés ; un hotfix neutralise les volumes globaux manifestement aberrants. Volumes d'exchanges échantillonnés ≠ marché mondial CEX. |
| DeFiLlama | Chaînes/TVL, protocoles, catégories, stablecoins, historiques, `/overview/dexs` volumes, `/overview/fees` frais/revenus et variantes par chaîne/protocole dans le Provider | `dexFeeProtocols` et `fees24hUsd` sont des **agrégats protocolaires** et non un taux de frais prélevé pour un swap spécifique ou une estimation de gas. |
| DexScreener | `marketdata.dex.liquidity.snapshot`, `.history`, `.capabilities` : adresse pool, paire, DEX, réseau, liquidité et volume 24h USD, prix approximatif, listes de pools | `executionDepth:false`. Ni quote de route, ni gas RPC, ni frais de pool contractuellement garantis. Données passées par Firewall puis cache/SQLite. |
| Microstructure | Carnets `bids/asks`, profondeur, open interest, historique et métriques marché via `marketdata.microstructure.*` et derivatives | Principalement CEX et marchés dérivés ; ces profondeurs ne sont pas directement applicables aux AMM DEX. |
| Liquidations | Flux workers Binance Futures, OKX, Bybit, normalisation et montants observés USD vérifiés ; stats 24 h SQLite | Couverture partielle, aucune garantie de total mondial. Sans preuve de conversion : N/D. |
| RPC on-chain | `App/MarketData/Provider/onchain_rpc_provider.js` : `eth_call`, `eth_getBalance`, `eth_getBlockByNumber`, `eth_blockNumber`, `eth_getCode`, `eth_getLogs` | **Read-only EVM limité** ; `eth_gasPrice`, `eth_estimateGas` et les méthodes Solana de simulation de frais ne sont pas prises en charge par cet adaptateur. Son existence ne prouve pas une intégration dans le calculateur Statistiques. |
| Historique / cache / contrôle | `marketdata.financial.snapshot`, `.history`, `.status`, `.storage` ; microstructure et liquidité DEX conservées | Vérifier TTL, provenance, fraîcheur et qualité ; les données persistées anciennes peuvent nécessiter filtrage, sans suppression destructive. |

### Actions du marché utiles à inventorier avant tout développement

- `marketdata.financial.capabilities`, `snapshot`, `history`, `ai_context`, `status`, `storage`
- `marketdata.dex.liquidity.capabilities`, `snapshot`, `history`
- `marketdata.microstructure.capabilities` et actions de snapshot/historique
- `marketdata.symbols`, `marketdata.providers`, `marketdata.provider.test`
- `marketdata.derivatives.open_interest` et flux de liquidations

Pour chaque nouvelle lecture UI, vérifier contrat CP/1 **et** allowlist Router, sans ouvrir des écritures ou requêtes arbitraires.

## 3. Diagnostic du module « Estimation d'exécution » actuel

Référence : `App/Frontend/JS/statistiques_v1.0.js`, fonctions `executionEstimate` et `renderExecutionCost`.

1. Il choisit **automatiquement la pool disposant de la plus grande liquidité** dans la réponse DexScreener pour la paire chargée. Pas de choix explicite réseau/DEX/pool.
2. Il calcule `amount/(poolLiquidityUsd/2 + amount) * 100` : approximation x·y=k à réserves équilibrées, **pas une simulation de swap** ; elle est inadéquate pour les AMM à liquidité concentrée.
3. Un éventuel pourcentage extrait du libellé de pool est seulement indicatif. Le taux exécutable n'est pas confirmé.
4. Le gas reste N/D : aucun estimateur RPC avec données du réseau/transfert n'est raccordé au calculateur.
5. Le coût total reste correctement indisponible quand une composante essentielle manque. Ne **jamais** transformer ces N/D en zéro ou un total présenté comme fiable.

## 4. Besoin produit 2.0.3 — approche minimale et progressive

**A.** Exposer un sélecteur réseau uniquement à partir des `chainId` présents dans des pools validées ; proposer ensuite les DEX puis les pools de ce réseau. Indiquer qu'il s'agit de la couverture observée de la paire, pas d'une liste exhaustive de réseaux.

**B.** Conserver le montant USD et calculer seulement les composantes disponibles. Séparer visuellement : frais réseau, frais de protocole/pool, impact théorique ou cotation réelle, frais additionnels éventuels.

**C.** Auditer les autres adaptateurs API/RPC du dépôt avant de développer une nouvelle source de gas ou de devis. L'adaptateur EVM read-only inspecté n'expose pas à lui seul `eth_estimateGas`. Pour Solana, une interface RPC spécifique sera nécessaire si aucune n'existe déjà ailleurs ; ne rien annoncer comme opérationnel sans test.

**D.** Avant tout raccordement supplémentaire : documenter coût en quota, compatibilité Firewall, unités, validité par chaîne et fournisseur, et tests de sortie N/D.

**E.** Si une véritable cotation de swap est requise, elle doit être fournie par un routeur/DEX quote compatible, et non reconstruite à partir des agrégats DeFiLlama.

## 5. BRIDGES — manque explicitement confirmé

Le Collector DeFi annonce `BRIDGE_VOLUME_PROVIDER_NOT_CONNECTED`. **Il n'existe pas, dans le pipeline financier audité, de famille Bridges opérationnelle** fournissant le KPI « Bridges · 24 h ». Le composant d'interface affiche donc légitimement N/D.

Données pertinentes à chercher ou intégrer dans un périmètre futur :
- catalogue des ponts et paires de chaînes source/destination ;
- volumes de transferts 24 h et leurs horodatages, idéalement par protocole et route, avec provenance ;
- frais de bridge, frais sur chaîne source/destination, minimums et quotas ;
- cotation de transfert par actif, montant, réseau source/destination, disponibilité et délai estimé ;
- états de transaction/fiabilité, avec statut de couverture partielle.

**Distinction fonctionnelle :** les volumes Bridges alimentent le tableau de bord DeFi, mais **ne suffisent pas** à calculer les frais d'un swap sur un seul réseau. En revanche, une *API de quote Bridge* peut aider à estimer un itinéraire inter-chaînes, s'il inclut explicitement les frais et devises. Les données agrégées de volume n'indiquent pas ces frais.

Le Provider DeFiLlama déjà présent couvre volumes DEX, fees et TVL, mais **aucun endpoint bridge n'est raccordé dans son code inspecté**. Vérifier la disponibilité et les conditions d'une API Bridge DeFiLlama avant de décider d'un nouvel adaptateur ; ne pas présumer que la couverture du Provider DeFiLlama actuel suffit.

## 6. Actions de suivi / validation

- Sur GEN-1, relever les sorties réelles de `marketdata.financial.capabilities`, `marketdata.dex.liquidity.capabilities`, `marketdata.providers` ainsi que les pools/réseaux effectivement retournés ; ne pas confondre capacités déclarées et fournisseurs disponibles.
- Compléter l'inventaire RPC du dépôt, notamment routes déjà ouvertes par d'autres composants, sans introduire de doublon.
- Prioriser : (1) sélection réseau/DEX/pool exploitant les données présentes ; (2) estimation RPC vérifiée ; (3) frais/quotes DEX réels si disponibles ; (4) KPI Bridges séparé ; (5) quotes inter-chaînes uniquement pour parcours bridge.
- Tester changements de réseau/montant, chaînes sans cotation, séparation des unités, erreurs/quota fournisseur et passage par Firewall.
- Conserver le chantier des indicateurs Trading IA dans 2.0.3 ; aucune évolution fonctionnelle n'est incluse dans cet audit.

**État :** documentation de capacités et de lacunes, pas engagement de disponibilité runtime ni modification applicative.

## 7. Ajout UI : sélection réseau et DEX (travaux 2.0.3, non déployés)

Les contrôles `execNetwork` et `execDex` de la page Statistiques filtrent maintenant les pools réellement retournées par le snapshot DexScreener validé pour ETH/USDC. Le réseau est issu de `pool.chainId`, le DEX de `pool.dexId`, sans catalogue artificiel, sans nouvelle API ni contourner le Firewall. La pool de référence est la plus liquide **parmi celles du réseau et du DEX sélectionnés**. Le montant de simulation et le modèle x·y=k restent inchangés. La page conserve explicitement `N/D` pour le gas, les frais DEX sans tarif vérifié et le total non chiffrable. **Ce module donne un ordre de grandeur de l'impact théorique et non une estimation complète des frais de transaction.** Les bridges restent hors périmètre ; aucun code bridge ni quote interchaînes ajouté. Validation Firefox et GEN-1 à réaliser avant clôture du chantier.
