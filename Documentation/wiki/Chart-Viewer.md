# 📈 Chart Viewer et graphique Trading IA

> **🟢 En simple : IA-TB possède deux expériences graphiques distinctes : un Chart Viewer autonome basé sur le widget TradingView, et un graphique natif intégré à la page Trading IA qui consomme les données du Market Data Collector.**

---

## 🖥️ Chart Viewer autonome

**🟢 En simple : le Chart Viewer est la page pratique pour ouvrir rapidement un graphique TradingView sans mélanger cette fonction avec le cockpit Trading IA.**

Route : `/chart-viewer`.

La page embarque le widget TradingView Advanced Chart et conserve des préférences locales :
- symbole ;
- exchange ;
- timeframe ;
- thème.

Cette page est volontairement distincte du moteur graphique interne de Trading IA.

---

## 📊 Graphique Trading IA

**🟢 En simple : le graphique de Trading IA fait partie de l’application IA-TB et utilise le marché de référence choisi dans la colonne Exchanges.**

Les chandeliers passent par :

```mermaid
flowchart LR
  UI[Trading IA] --> G[/ui-data/market/candles]
  G --> R[🔀 Router]
  R --> F[🧱 Data Firewall]
  F --> M[📡 Market Data]
  M --> P[Kraken / Binance / OKX / GMX]
```

Le sélecteur de marché actuel expose comme sources réelles :
- Binance ;
- Kraken ;
- OKX ;
- GMX.

---

## 📐 Indicateurs

**🟢 En simple : les indicateurs affichés ne doivent pas être recalculés avec une source différente du graphique sans le dire.**

Le Chart/Trading UI peut lire l’Indicator Engine. Le contrat CP/1 du Chart Viewer prévoit notamment :
- état du graphique ;
- symbole ;
- timeframe ;
- ajout/suppression d’indicateur ;
- fit/focus ;
- niveaux ;
- nettoyage de l’analyse.

---

## 🧭 Source et provenance

**🟢 En simple : changer d’exchange signifie changer le marché observé. Un BTC/USDT Binance n’est pas silencieusement fusionné avec Kraken.**

Le Market Data Collector conserve :
- source ;
- paire canonique ;
- paire provider ;
- timeframe ;
- disponibilité du volume ;
- source du prix ;
- timestamp.

GMX peut fournir des chandeliers prix Oracle avec volume absent ; le volume n’est pas fabriqué.

---

## ⚠️ Documentation historique ƒx / Hyperliquid

**🟢 En simple : l’ancien Wiki décrivait la source virtuelle ƒx et Hyperliquid comme éléments centraux. Ce n’est plus le pipeline principal chargé par le Market Data Collector V2.0 actuel.**

Le Wiki V2.0 retient comme sources Candle actives du registre :
**Kraken, Binance, OKX et GMX**.

Les anciennes expérimentations restent consultables dans l’historique Git mais ne doivent pas être présentées comme l’état runtime actuel.

---

## 🧩 Modules sous le graphique

**🟢 En simple : la page Trading IA n’est pas seulement un graphique ; elle reçoit aussi des informations Portfolio, Strategy et services système.**

Le dashboard actuel prévoit notamment :
- positions ouvertes ;
- volume attribuable au LLM lorsque les événements permettent de l’identifier ;
- trading en direct ;
- stratégie actuelle ;
- indicateurs externes ;
- état des services.

Les modules sont séparés des chandeliers afin de ne pas mélanger données de marché et données applicatives.

## Consolidation 2.5.2 DEV

La barre d’outils reste disponible en mode Agrandir, sous la navigation. Le
bouton PNG et le bandeau Événements à venir sont supprimés. « 📅 Événements »
affiche ou masque immédiatement les lignes et badges natifs ; la préférence
Auth21 existante `chart/chartEconomicEvents` est enregistrée pour le compte.
Les instants UTC exacts, couleurs FED/CME, fuseaux, regroupements, infobulles
et coordonnées des dessins restent conservés. Les événements sans heure
officielle ne reçoivent pas de ligne exacte.

Le widget isolé `/chart-viewer` reste distinct : aucun accès à son DOM interne.
