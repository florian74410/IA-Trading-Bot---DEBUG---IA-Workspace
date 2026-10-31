# 🚦 État fonctionnel — V2.0 DEBUG

> **🟢 En simple : cette page dit ce qui fonctionne réellement dans le code actuel, ce qui est encore partiel et ce qui reste surtout une interface ou une idée. Une fonction n’est pas marquée ACTIVE uniquement parce qu’un bouton existe.**

L’état ci-dessous provient de l’analyse du build **`builds/IA-TB_Build_v2.0_DEBUG`** sur la branche **`debug`**.

---

## 🧩 Services

| Composant | État | Note |
|---|---|---|
| 🖥️ UI Service | ✅ ACTIVE | process séparé, port 8000 |
| 🧩 Core | ✅ ACTIVE | port 8001 |
| 🔀 Router CP/1 | ✅ ACTIVE | port 8021 |
| 🔥 Firewall | ✅ ACTIVE | Trading + Data workers |
| 📡 Market Data V2.1 | ✅ ACTIVE | Candle + Registry + Financial + Liquidity ingress |
| 📐 Indicator | ✅ ACTIVE | BuiltIn + Custom/IIL |
| 💧 Liquidity V2.0 | ✅ ACTIVE | INTERNAL_ANALYSIS_ONLY · CP/1 · aucun provider Internet direct |
| 🧭 Fundamental V3 | ✅ ACTIVE | INFORMATION_ONLY |
| 🧠 Strategy v2 | ✅ ACTIVE | INTENTION_ONLY |
| 🛡️ Risk | ✅ ACTIVE | analyse + Risk Gate |
| ⚡ Trading | ✅ ACTIVE / SAFE | Live OFF par défaut |
| 📊 Portfolio | ✅ ACTIVE | SQLite + events/snapshots |
| 🤖 Supervisor | ✅ ACTIVE | INTENTION_ONLY |
| 🐙 Kraken Add-On | ✅ ACTIVE | source locale Kraken |

---

## 📡 Données

**🟢 En simple : la migration CoinGecko + DeFiLlama vers Market Data est maintenant visible dans le code V2.0.**

| Fonction | État |
|---|---|
| Kraken Candle | ✅ ACTIVE |
| Binance Candle | ✅ ACTIVE |
| OKX Candle | ✅ ACTIVE |
| GMX Oracle Candle | ✅ ACTIVE |
| CoinGecko Market Registry | ✅ ACTIVE |
| CoinGecko Financial CeFi | ✅ ACTIVE |
| DeFiLlama Financial DeFi | ✅ ACTIVE |
| Data Firewall avant snapshot financier | ✅ ACTIVE |
| Historique financier JSONL | ✅ ACTIVE |
| Indicator sur séries financières | ✅ ACTIVE |
| Liquidity accès financier via Router | ✅ ACTIVE |
| Liquidity carnet/OI via Market Data + Firewall | ✅ ACTIVE |
| OI couvert Binance Futures + OKX + Hyperliquid + GMX | ✅ IMPLÉMENTÉ · runtime live à valider |
| Historique OI SQLite 30–90 jours | ✅ IMPLÉMENTÉ |
| Flux liquidations Binance/OKX Worker Threads | 🟡 IMPLÉMENTÉ · connexion live à valider |
| Historique Liquidity SQLite 30–90 jours | ✅ ACTIVE |
| Liquidity depth/slippage/score/OI-depth | ✅ ACTIVE |
| Supervisor `liquidity.context` | ✅ ACTIVE |
| Statistiques CeFi/DeFi via snapshot | ✅ ACTIVE |
| Open Interest global complet | 🟡 PARTIAL / provider spécialisé manquant |
| Liquidations globales complètes | 🟡 PARTIAL / provider spécialisé manquant |
| Bridge volume global | 🟡 PARTIAL |

---

## 🏦 Banque

**🟢 En simple : wallets, clés et plusieurs transferts sont réels ; certaines fonctions financières affichées restent encore des services futurs.**

| Fonction | État |
|---|---|
| Wallet multi-chain EVM/BTC/SOL | ✅ ACTIVE |
| Chiffrement Wallet AES-256-GCM | ✅ ACTIVE |
| Import EVM/BTC/SOL | ✅ ACTIVE |
| Mes Clés / reveal / export sans secrets | ✅ ACTIVE |
| Transfert EVM / ERC20 | ✅ ACTIVE |
| Transfert BTC natif | 🟡 ACTIVE, confirmation réseau à suivre |
| Transfert SOL natif | 🟡 ACTIVE, confirmation réseau à suivre |
| SPL tokens | ⏳ PLANNED / non activé |
| BTC source SegWit signing | ⏳ PLANNED / source IA-TB actuelle P2PKH |
| OnChain Reader EVM | ✅ ACTIVE |
| OnChain Reader BTC/SOL | 🟡 PARTIAL |
| Swap/Bridge 0x EVM | ✅ ACTIVE si API/RPC configurés |
| Swap/Bridge BTC/SOL | ⏳ NON SUPPORTÉ actuellement |
| Vault Registry | 🟡 Infrastructure présente |
| Earn/Pools/Loans complets | ⏳ PLANNED / UI partielle |

---

## 🧠 IA et décision

| Fonction | État |
|---|---|
| Supervisor contexte CP/1 | ✅ ACTIVE |
| Supervisor LLM configurable | ✅ ACTIVE |
| Provider LLM par défaut MOCK | ✅ ACTIVE |
| Strategy catalogue/évaluation | ✅ ACTIVE |
| Strategy exécution directe | 🚫 INTERDITE |
| Risk analyses | ✅ ACTIVE |
| Risk approval / verify | ✅ ACTIVE |
| Autonomous Trading master | ⛔ OFF par défaut |
| Order execution IA | 🟡 PREPARE_ONLY par défaut |
| Chat IA dans Core/UI | ✅ Présent |
| Protocol Registry `chat_ai` autonome | ⏳ RESERVED |

---

## ⚡ Trading

**🟢 En simple : le moteur d’exécution existe mais le mode Live n’est pas activé par le démarrage standard.**

- adapters déclarés : Binance, OKX, Kraken, GMX ;
- `execute/cancel/close_position` protégés ;
- `risk_approval_id` obligatoire ;
- forward Firewall signé obligatoire ;
- événements envoyés à Portfolio ;
- `IATB_TRADING_LIVE=0` au démarrage.

---

## 🖥️ Interface

| Page | État |
|---|---|
| Trading IA | ✅ ACTIVE |
| Chart Viewer TradingView | ✅ ACTIVE |
| Portfolio | ✅ ACTIVE |
| Banque | ✅ ACTIVE / services mixtes |
| Fondamental | ✅ ACTIVE |
| Paramètres | ✅ ACTIVE |
| Stratégies | ✅ ACTIVE, principalement READ_ONLY |
| Statistiques | ✅ ACTIVE / quelques éléments de présentation |
| Admin | ✅ ACTIVE |

---

## ⚠️ Points techniques connus

### 1. Protocol Registry Trading

**🟢 En simple : une métadonnée indique encore 8017, mais Trading tourne réellement sur 8016.**

`ProtocolRegistry/trading.json` doit être réaligné. Le port 8017 appartient au Firewall.

### 2. Router health incomplet comme inventaire global

**🟢 En simple : `/router-health` ne doit pas être utilisé comme seule preuve que tous les 14 services sont en ligne.**

Le probe actuel vérifie plusieurs services principaux mais pas l’intégralité du Process Registry, notamment Risk/Supervisor. Utiliser la Startup Console, le Process Registry et Admin pour l’inventaire complet.

### 3. BTC/SOL confirmation

**🟢 En simple : diffuser une transaction n’est pas la même chose que la confirmer.**

Les modules BTC/SOL retournent un état soumis. Un watcher de confirmation multi-chain reste une amélioration logique.

### 4. OnChain Reader

**🟢 En simple : créer un wallet BTC/SOL est supporté, mais le lecteur générique de balances/historique reste surtout EVM.**

La lecture BTC/SOL devra être étendue pour obtenir une expérience Banque symétrique.

### 5. Auth DEBUG

**🟢 En simple : le mode de développement local n’est pas une configuration de production Internet.**

Le démarrage DEBUG lance actuellement le UI Service avec authentification désactivée et rôle de bypass SUPERADMIN. Une exposition réseau publique doit réactiver une authentification forte et revoir les frontières.

### 6. Statistiques

**🟢 En simple : les grandes données CeFi/DeFi sont branchées, mais certaines petites valeurs décoratives de latence/uptime restent des placeholders visuels.**

Elles ne doivent pas être confondues avec des mesures runtime réelles tant qu’elles ne sont pas alimentées.

---

## ✅ Définition utilisée

- **ACTIVE** = code/runtime réellement présent et relié.
- **PARTIAL** = fonction utilisable mais couverture incomplète.
- **PLANNED** = interface, contrat ou idée sans chaîne complète validée.
- **RESERVED** = emplacement protocolaire préparé sans runtime autonome correspondant.
