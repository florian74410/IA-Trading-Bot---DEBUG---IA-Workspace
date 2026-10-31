# 🖥️ Interface IA-TB — Pages & UI Service

> **🟢 En simple : l’interface IA-TB est une application web locale multipage. Le navigateur ne se connecte pas librement aux Engines : il passe par un service UI sur le port 8000 qui filtre les pages et les accès backend.**

---

## 🌐 UI Service

**🟢 En simple : le port 8000 est la porte d’entrée visuelle de l’application.**

Le service `UI/Gateway/ui_service.js` :
- sert les fichiers HTML/CSS/JS ;
- applique les permissions USER/ADMIN ;
- proxy les API Core autorisées ;
- expose des lectures Router contrôlées ;
- isole l’UI du Core.

Health : `/ui-health`.

Le Core reste sur `8001` et le Router sur `8021`.

---

## 🗺️ Pages principales

| Route | Page | Rôle |
|---|---|---|
| `/ia-trading` | Trading IA | cockpit de marché et modules |
| `/chart-viewer` | Chart Viewer | vue graphique indépendante |
| `/portfolio` | Portfolio | positions, trades, historique |
| `/bank` | Banque | wallets, clés, transferts |
| `/fundamental` | Fondamental | renseignement et news |
| `/settings` | Paramètres | configuration utilisateur/moteurs |
| `/strategy` | Stratégies | état/catalogue Strategy Engine |
| `/statistiques` | Statistiques | CeFi/DeFi/architecture |
| `/admin` | Admin | exploitation et diagnostics |
| `/admin/vaults` | Vault Admin | gestion administrative Vault |

---

## 🧭 Navigation globale

**🟢 En simple : les pages principales partagent une barre supérieure commune pour éviter plusieurs systèmes de navigation incompatibles.**

La navigation globale propose :
- Trading IA ;
- Chart Viewer ;
- Portfolio ;
- Banque ;
- Fondamental ;
- Paramètres ;
- Stratégies ;
- Statistiques.

Le lien Admin n’apparaît que pour un rôle administratif lorsque l’authentification est active.

---

## 📚 Barres latérales

**🟢 En simple : les menus latéraux utilisent un style cohérent inspiré de Banque, sauf Admin qui conserve volontairement son menu d’administration historique.**

Le composant partagé gère actuellement :
- Banque ;
- Fondamental ;
- Paramètres ;
- Stratégies ;
- Statistiques.

Admin est explicitement exclu de ce composant et conserve sa propre `adminSidebar`.

---

## 📈 Trading IA

**🟢 En simple : Trading IA combine un graphique natif, le choix du marché et des modules qui lisent les Engines.**

Le panneau d’exchanges expose actuellement comme sources sélectionnables :
- Binance ;
- Kraken ;
- OKX ;
- GMX.

Les chandeliers sont chargés par :
```text
UI → /ui-data/market/candles
   → Router
   → Firewall Data Thread
   → Market Data Collector
```

Des modules lisent aussi Portfolio pour positions et événements.

---

## 📊 Statistiques

**🟢 En simple : la partie financière de Statistiques utilise le nouveau snapshot CeFi/DeFi de Market Data.**

La page lit :
- `marketdata.financial.snapshot`
- historique `CEFI`
- historique `DEFI`

via `/communication/v1/ui/read`.

Certaines petites cartes de statut/latence encore présentes dans le modèle visuel sont des valeurs de présentation tant qu’aucune métrique runtime correspondante n’est branchée.

---

## 📊 Portfolio

**🟢 En simple : la page Portfolio lit le moteur Portfolio plutôt que de refaire ses calculs dans le navigateur.**

Elle consomme notamment :
- overview ;
- history ;
- trades ;
- trade detail ;
- health.

---

## 🏦 Banque

**🟢 En simple : Banque est une page applicative Core riche ; le navigateur ne possède pas directement les secrets.**

Les sous-sections incluent :
- Mes Portefeuilles ;
- Ma Comptabilité ;
- Mes Clés ;
- Coffres ;
- Prêts ;
- Swap & Bridges ;
- Statistiques.

La page charge les contrôleurs Wallet, Keys, Transfer et Swap/Bridge selon la section.

---

## 🧭 Fondamental

**🟢 En simple : la page Fundamental visualise les informations déjà collectées et analysées par Fundamental Engine.**

Elle offre :
- vue d’ensemble ;
- news/événements ;
- sources/providers ;
- domaines/DeFi ;
- analyse IA ;
- collecte/scheduler ;
- diagnostics ;
- observability ;
- console Fundamental.

---

## ⚙️ Paramètres

**🟢 En simple : Paramètres centralise la configuration sans demander à l’utilisateur d’éditer des JSON à la main.**

Sections actuelles :
- profil ;
- sécurité ;
- API & Data ;
- crédits/tokens ;
- IA ;
- Fundamental ;
- Indicators ;
- Strategy ;
- Trading ;
- Risk ;
- Liquidity ;
- Portfolio ;
- Collector ;
- Providers ;
- CoinGecko ;
- Registry ;
- Communication ;
- Mosaïque ;
- Graphique ;
- Notifications ;
- Versions.

---

## 🛠️ Admin

**🟢 En simple : Admin est réservé à l’exploitation de l’application, pas à l’usage normal du trading.**

Il conserve sa navigation dédiée pour :
- Console ;
- Firewall ;
- Processus ;
- Engines & Services ;
- Maintenance ;
- Diagnostics ;
- Mises à jour ;
- Project Explorer.

Le service UI exige le rôle ADMIN pour cette page lorsque l’authentification est active.

---

## 🔐 Permissions UI

**🟢 En simple : une page peut lire certains états mais ne peut pas transformer `/communication/v1/ui/read` en accès d’écriture universel.**

Le Router possède une whitelist spécifique pour le caller `UI / READ_ONLY`. Les actions ou arguments non autorisés sont refusés.

Cette séparation est importante : une faille ou une erreur JavaScript dans une page ne doit pas devenir automatiquement un accès libre à Trading Engine.
