# IA-TB UI — séparation v1.10.0

`UI/Gateway/ui_service.js` est le processus dédié à l'interface graphique. Il sert les fichiers sous `Frontend/` et constitue la seule façade navigateur sur `127.0.0.1:8000`.

Le Router est interne sur `127.0.0.1:8021`, le Core reste interne sur `127.0.0.1:8001`. L'UI n'importe aucun module métier de `Core/`, `Strategy/`, `Risk/`, `MarketData/` ou `services/trading-engine/`.

Droits préparés pour l'authentification future : `READ`, `USER_WRITE`, `ADMIN_WRITE`. Les Settings sont classés `USER_WRITE`, donc un compte USER pourra modifier ses paramètres. Les opérations d'administration restent `ADMIN_WRITE`. En mode actuel sans authentification, le rôle de bypass reste `ADMIN` pour conserver toutes les fonctions de développement.

Flux graphiques :
- Chart Viewer : widget TradingView externe, inchangé visuellement et fonctionnellement.
- IA Trading View : `/ui-data/market/candles` -> UI Gateway -> Router -> Firewall Data Thread -> Market Data Collector. Le navigateur n'utilise plus `/api/market/klines` ni `/api/gmx/ticker` pour le graphique IA.
