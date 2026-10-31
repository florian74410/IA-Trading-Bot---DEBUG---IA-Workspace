# IA-TB Firewall

Architecture v1.12 : **1 coordinateur / 1 port (8017) / 2 Workers de protection optionnels**.

- Thread 0 — Firewall Coordinator : orchestration HTTP, proxy interne et cycle de vie des Workers.
- Thread 1 — Trading Protection : `Protection/trading_firewall.js`, configuration `Config/Trading/`.
- Thread 2 — Market Data Protection : `Protection/market_data_firewall.js`, configuration `Config/MarketData/`.

## Mode normal

Par défaut, les deux Workers de protection sont initialisés. Le coordinateur vérifie les commandes Trading et les données Market Data avant transmission.

## Mode test sans pare-feu

Lancer `./start_no_firewall.command` ou démarrer avec `IATB_FIREWALL_ENABLED=0 ./start.command`.

Dans ce mode, **aucun Worker de protection n'est initialisé**. Le coordinateur 8017 reste uniquement comme pass-through afin de conserver exactement la même topologie réseau et de pouvoir comparer le comportement de l'application avec et sans protections sans modifier Router, CP/1 ou Trading Engine.

Le Trading Engine conserve ses contrôles propres, notamment CP/1 et `risk_approval_id`; seules les inspections Firewall sont bypassées.

Ce mode est destiné au diagnostic et au développement. Le mode normal/prod doit garder les protections actives.

## Configuration depuis ADMIN

La page `ADMIN > Firewall` reste une vue de supervision. Un clic sur une carte **Trading Protection** ou **Market Data Protection**, ou sur son bouton **Paramètres**, ouvre une surcouche de configuration dédiée.

Chaque règle exposée par la protection peut être activée ou désactivée individuellement. Les seuils et listes autorisées peuvent également être modifiés. Le bouton **Appliquer** envoie la configuration au Worker correspondant ; le Worker la valide, la persiste et l'applique immédiatement, sans redémarrage complet d'IA-TB.

Les protections Trading d'authentification CP/1, de signature et de timestamp restent configurables pour les essais et le développement. Elles sont signalées comme critiques dans l'interface et leur désactivation demande une confirmation explicite.

Quand IA-TB est lancé en mode `IATB_FIREWALL_ENABLED=0`, aucun Worker n'existe : l'éditeur de règles est donc volontairement indisponible jusqu'au prochain démarrage avec Firewall actif.

## Protections Market Data

Les règles `priceJump`, `bidAsk` et `spread` sont effectives :
- saut de prix maximum par provider/symbol ;
- bid/ask positifs et non inversés ;
- spread maximum configurable.

Les événements restent centralisés dans `Core/Firewall/Firewall.log`.
