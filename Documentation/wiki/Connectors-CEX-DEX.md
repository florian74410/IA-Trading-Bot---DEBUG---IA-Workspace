# 🔌 Connecteurs CEX / DEX et providers — V2.0 DEBUG

> **🟢 En simple : IA-TB distingue les plateformes de marché utilisées pour les chandeliers/trading des providers analytiques comme CoinGecko et DeFiLlama. Chaque source garde son nom et sa provenance.**

---

## 📡 Sources Market Data Candle actives

**🟢 En simple : le registre actuel du Market Data Collector V2.0 sait demander des bougies à quatre sources.**

| Source | Type | Données principales |
|---|---|---|
| 🐙 Kraken | CEX | OHLCV, volume natif |
| 🟡 Binance | CEX | OHLCV, volume natif |
| ⚫ OKX | CEX | OHLCV, volume natif |
| 🔵 GMX | DEX / Perp | prix Oracle / candles, volume non fabriqué |

Le choix de source est explicite. Le Collector ne remplace pas silencieusement une plateforme indisponible par une autre.

---

## 🐙 Kraken

**🟢 En simple : Kraken utilise encore un Add-On dédié sur 8011, puis Market Data normalise ses chandeliers.**

Le provider Kraken appelle le service local Kraken Add-On. La réponse conserve la paire provider, la paire canonique, le timeframe et la disponibilité du volume.

---

## 🟡 Binance

**🟢 En simple : Binance Market Data utilise l’API publique Spot pour les chandeliers.**

Le provider demande actuellement jusqu’à 500 klines et normalise :
`timestamp, open, high, low, close, volume`.

L’accès public n’exige pas de clé privée pour ces données.

---

## ⚫ OKX

**🟢 En simple : OKX fournit des chandeliers publics et IA-TB sait essayer une paire USDT lorsqu’une paire USD directe n’existe pas.**

Le provider conserve le `providerPair` réellement utilisé.

---

## 🔵 GMX

**🟢 En simple : GMX fournit surtout le prix Oracle et les candles Perp ; IA-TB n’invente pas un volume qui n’est pas présent.**

Le provider possède plusieurs endpoints de fallback GMX et renvoie :
- `volumeAvailable: false`
- `volumeSource: NONE`
- `priceSource: GMX_ORACLE`

---

# 📊 Providers analytiques

## 🦎 CoinGecko

**🟢 En simple : CoinGecko sert de catalogue d’actifs et de référence pour le marché token/global, pas de remplacement silencieux des bougies Binance/Kraken.**

Utilisations :
- Market Registry ;
- recherche d’actifs ;
- détails token ;
- market cap ;
- volumes globaux/échantillonnés ;
- exchanges ;
- prix de valorisation UI lorsque prévu.

---

## 🦙 DeFiLlama

**🟢 En simple : DeFiLlama est la source spécialisée DeFi.**

Utilisations actuelles :
- protocoles ;
- chains ;
- DEX overview ;
- stablecoins ;
- TVL et catégories.

Il ne remplace pas les OHLCV d’un exchange.

---

## ⛓️ On-chain RPC

**🟢 En simple : un provider RPC générique existe pour lire des informations blockchain EVM, mais il ne signe et n’envoie aucune transaction.**

Méthodes de lecture prévues :
- `eth_call`
- `eth_getBalance`
- `eth_getBlockByNumber`
- `eth_blockNumber`
- `eth_getCode`
- `eth_getLogs`

La signature reste dans les modules Banque/Trading concernés.

---

# ⚡ Execution Exchange

**🟢 En simple : une plateforme peut être source Market Data sans que le Trading réel soit automatiquement activé.**

Trading Engine possède des adapters déclarés pour :
- Binance ;
- OKX ;
- Kraken ;
- GMX.

Le mode Live global du Trading Engine reste **OFF par défaut**, et toute mutation exige Risk Gate + Firewall.

---

## ⚠️ Providers historiques

**🟢 En simple : Hyperliquid, Blockchain.com et la source ƒx ont existé dans les développements précédents, mais ne font pas partie du registre Candle canonique V2.0 actuellement chargé.**

Ils ne sont donc plus présentés ici comme providers actifs principaux. S’ils reviennent, leur réintégration devra passer par :
1. Market Data ;
2. provenance ;
3. Data Firewall ;
4. Router ;
5. tests ;
6. documentation.
