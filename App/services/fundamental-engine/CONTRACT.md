# Fundamental Engine — Router Contract v1

## Direction

`Router <-> Fundamental Engine`

The Fundamental Engine never sends orders to an exchange and never talks directly to the Trading Engine.

## Requests

### fundamental.health

```json
{
  "type": "fundamental.health",
  "request_id": "uuid"
}
```

### fundamental.analyze

```json
{
  "type": "fundamental.analyze",
  "request_id": "uuid",
  "payload": {
    "exchange": "BINANCE",
    "symbol": "BTC/USDT",
    "asset": "BTC",
    "timeframe": "4h",
    "timestamp": 0,
    "market": {},
    "signals": []
  }
}
```

## Normalized result

`score` is always in `[-1, 1]`.

`confidence` is always in `[0, 1]`.

`bias` is one of:

- `STRONGLY_BEARISH`
- `BEARISH`
- `NEUTRAL`
- `BULLISH`
- `STRONGLY_BULLISH`

The exchange is contextual metadata only. Fundamental data must not silently depend on a CEX/DEX.
