Liquidity Engine v1.4.0 · IA-TB v1.8.1 · 127.0.0.1:8014

Mode hybride :
- zones de liquidite ESTIMATED conservees depuis OHLCV (/zones),
- Order Book reel quand la source le fournit,
- calcul du desequilibre Bid/Ask sur notionnel des niveaux du carnet,
- Open Interest quand la source le fournit,
- statistiques de liquidations uniquement a partir d'evenements de liquidation explicites.

Endpoints :
GET  /health
GET  /zones?symbol=BTCUSD&interval=1h&limit=300
GET  /realtime?symbol=BTCUSD&source=AUTO&depth=20
GET  /snapshot?symbol=BTCUSD&source=AUTO&depth=20&interval=1h
GET  /liquidations?symbol=BTCUSD&source=BINANCE_FUTURES&windowMs=900000
POST /liquidations/event
POST /cache/clear

Sources temps reel publiques implementees :
- HYPERLIQUID : Order Book + Open Interest.
- BINANCE_FUTURES : Order Book + Open Interest.
- KRAKEN : Order Book ; Open Interest declare indisponible.
- AUTO : Hyperliquid, puis Binance Futures, puis Kraken.

Liquidations :
Le moteur ne fabrique jamais de liquidation a partir d'OHLCV. Les statistiques ne deviennent disponibles que lorsqu'un adaptateur/provider transmet un evenement explicite a /liquidations/event. Sans evenement fiable, available=false.

Calcul Bid/Ask :
imbalance = (bidNotional - askNotional) / (bidNotional + askNotional)
Plage : -1 = pression ASK, +1 = pression BID. Une zone neutre +/-5% est classee BALANCED.

Open Interest :
La valeur native en unite de base est conservee. Quand un mark price est disponible, le moteur calcule aussi OI_notional = openInterest * markPrice.
