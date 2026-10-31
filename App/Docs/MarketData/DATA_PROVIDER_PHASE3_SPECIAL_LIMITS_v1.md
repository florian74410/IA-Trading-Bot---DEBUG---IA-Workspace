# Data Provider Phase 3 — Special Limits Shadow

Status: IMPLEMENTED + CONTRACT TESTED + RUNTIME SHADOW VALIDATED
Branch: feature/data-policy-orchestrator-v1

## Goal

Represent the remaining provider rate-limit models without adding provider-specific limiter classes.

The Request Budget now supports generic scoped limit primitives:
- SAFE_PACE
- ENDPOINT_WINDOW
- WEIGHTED
- DYNAMIC_WINDOW
- MULTI_SCOPE
- COOLDOWN / transport feedback

Shadow remains observational only.

## Kraken public Market Data

Current IA-TB calls:
- /0/public/OHLC
- /0/public/Depth

Model:
- OHLC: SAFE_PACE, 1000 ms target interval, scope by pair
- Depth: SAFE_PACE, 1000 ms target interval, public-IP scope
- source confidence: SAFE_RECOMMENDATION
- no fabricated hard request ceiling

Kraken private counter/decay limits are intentionally deferred because current MarketData does not use private Kraken endpoints.

## OKX

Current IA-TB calls:
- /api/v5/market/candles
- /api/v5/market/books
- /api/v5/public/open-interest

Model:
- Candles: ENDPOINT_WINDOW, 40 requests / 2 seconds
- Books: ENDPOINT_WINDOW, 40 requests / 2 seconds
- Open Interest: OBSERVE_ONLY until a sufficiently explicit limit is verified or learned from runtime telemetry
- rate-limit signal 50011 is recognized by transport feedback

No guessed hard limit is assigned to Open Interest.

## Bybit

Current IA-TB calls:
- /v5/market/kline
- /v5/market/orderbook
- /v5/market/tickers

Model:
- BYBIT_GLOBAL_IP: 600 requests / 5 seconds
- endpoint-specific dynamic scopes:
  - BYBIT_KLINE
  - BYBIT_ORDERBOOK
  - BYBIT_TICKERS
- endpoint limits are learned from:
  - X-Bapi-Limit
  - X-Bapi-Limit-Status
  - X-Bapi-Limit-Reset-Timestamp
- retCode 10006 is recognized as rate-limit feedback
- HTTP 403 rate-limit response simulates a 10-minute provider cooldown in Shadow

Each Bybit request can consume both the global IP budget and the endpoint-specific budget.

## Generic Request Budget behavior

A request may carry several scopes simultaneously.

Example:

BYBIT REQUEST
- BYBIT_GLOBAL_IP
- BYBIT_ORDERBOOK

Native-mode authorization later requires every authoritative scope to allow the request. In Shadow, IA-TB only records the simulated decision.

Each scope records:
- kind
- window
- configured/observed limit
- used cost
- safe minimum interval when applicable
- source/confidence
- observed remaining quota
- observed reset time
- cooldown state

## Transport feedback

The HTTP transport feeds response information back into Request Budget:
- HTTP 429
- Retry-After
- provider-specific quota headers
- OKX 50011
- Bybit 10006
- Bybit rate-limit HTTP 403

This does not alter outbound traffic in Shadow.

## Integration issue discovered and fixed

Runtime testing exposed two pre-existing defects unrelated to quota policy:
1. Firewall Service referenced BUILD.version without importing build_info.
2. OKX candle USD -> USDT fallback depended on an unsafe asynchronous symbol-part reference; it was hardened by capturing immutable base/quote strings.

Both fixes are now covered by the runtime path.

## Test checkpoints

Contract suite:
- GitHub Actions run 37470187624
- Node 16.20.2
- PASS
- includes Phase 1, Phase 2, Phase 3, transport bridge and historical MarketData contracts

Runtime Shadow:
- GitHub Actions run 37470187770
- Node 16.20.2
- PASS

Runtime services:
- Router
- Firewall
- MarketData
- Indicator
- Liquidity

Runtime validations:
- Shadow mode/profile audit PASS
- MarketData self-audit PASS/WARN
- CoinGecko CeFi snapshot PASS
- DeFiLlama DeFi snapshot PASS
- financial V2 quality gate PASS
- Router CP/1 distribution PASS
- Indicator financial context through Router PASS
- Liquidity financial context through Router CP/1 PASS
- Market + Liquidity data-layer runtime PASS
- live OHLCV invariant validation PASS through OKX

### CI regional limitation

The GitHub runner used for runtime validation is located in the United States. Binance Spot returned HTTP 451 from that environment. The test explicitly records this warning and uses OKX as the live CEX fallback.

This means:
- Binance weighted logic/contracts are tested.
- Binance live API reachability was not validated by this US CI run.
- The Runtime Shadow suite itself remains valid because another configured live CEX path was successfully exercised.

## Shadow invariant

Still NOT enabled:
- request blocking
- request delay
- authoritative cache substitution
- active deduplication
- Native cooldown enforcement
- Native quota enforcement

Next architectural step is Shadow observation under representative workload before deciding Native safety margins and activation criteria.
