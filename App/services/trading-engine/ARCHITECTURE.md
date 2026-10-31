
# Trading Engine — Architecture v1

## Official flow

Supervisor -> Router <-> Risk Manager -> Trading Engine -> Exchange

Trading Engine is an execution layer. It never decides whether a trade should exist.

## Internal structure

Trading Engine
├── Communication Protocol Adapter
├── Order Normalizer
├── Executor Registry
├── API Executors
│   ├── Binance
│   ├── OKX
│   ├── Kraken
│   └── GMX
└── Exchange Adapters
    ├── capabilities.json
    ├── orders/requests.json
    ├── positions/requests.json (when applicable)
    └── executor.js

## Safety invariant

No `trading.execute` request is accepted without `risk_approval_id`.

## Secret invariant

API credentials are never stored in Trading Engine.
They must be obtained through the secure Settings > API vault via SecretProvider.

## Exchange adapter principle

The common engine knows only normalized intents and normalized execution results.
Exchange-specific endpoints, request shapes, signatures and capabilities remain under
`exchange-adapters/<exchange>/`.
