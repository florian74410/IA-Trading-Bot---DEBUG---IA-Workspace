# IA-TB MarketData — Shadow Workload Optimization v1

Status: IMPLEMENTED + CONTRACT TESTED + RUNTIME WORKLOAD VALIDATED
Branch: feature/data-policy-orchestrator-v1
Mode: SHADOW ONLY

## Goal

Use representative runtime telemetry to improve request efficiency and observability without enabling Native blocking, delaying, cache substitution, or quota enforcement.

## Representative workload

Final run: GitHub Actions `37488995763`
Contract run: GitHub Actions `37488995915`
Node: 16.20.2
Services: Router + Firewall + MarketData + Indicator + Liquidity

Workload:
- 30 steps
- 27 successful
- 3 soft failures
- 0 hard failures
- duration: 46.9 s
- telemetry window includes service boot

Soft failures are regional CI access restrictions:
- Bybit REST: HTTP 403 on US runner
- Binance Global REST: HTTP 451 on US runner

## Improvements implemented from Shadow telemetry

### 1. Financial Refresh is asynchronous over CP/1

Before:
- a forced Financial refresh could hold the CP/1 caller for approximately 12 seconds and end as CP_ENGINE_TIMEOUT even though collection later completed.

Now:
- `marketdata.financial.refresh` returns ACCEPTED immediately with a refresh ID.
- progress/completion is visible through `marketdata.financial.status`.
- final workload acknowledgement: ~70 ms.

The actual collection continues asynchronously.

### 2. Fast Financial lanes

Financial collection is split between immediately useful data and slower enrichment.

Fast DeFi lane:
- chains
- lightweight DEX overview
- stablecoin current state

Deferred heavy DeFi enrichment:
- protocol catalogue / categories
- stablecoin long history
- fee catalogue
- full DEX history

Heavy enrichment:
- initial delay: 5 min
- cache TTL: 30 min
- compact normalized data is retained instead of keeping the original heavy JSON on the critical path.

Fast CeFi lane:
- CoinGecko global market
- CoinGecko market page

Deferred CeFi enrichment:
- sampled exchange catalogue
- initial delay: 2 min
- cache TTL: 15 min

The redundant Bitcoin simple-price call was removed from Financial collection because the current BTC USD price is already present in the market page.

### 3. Cache First for reference price

For USD prices, `marketdata.asset.price` now checks a fresh Financial CoinGecko snapshot before issuing another CoinGecko request.

Final workload:
- BTC reference price #1: 9 ms from FINANCIAL_SNAPSHOT
- BTC reference price #2: 41 ms from FINANCIAL_SNAPSHOT / local cache path

Previous boot-inclusive run:
- both reference-price requests could hit the anonymous CoinGecko API and time out at ~12 s.

### 4. Bybit / Binance error classification

HTTP status alone no longer implies a rate-limit event.

Categories:
- RATE_LIMIT
- GEO_RESTRICTED
- AUTH_ERROR
- ACCESS_DENIED
- PROVIDER_ERROR
- UNKNOWN

Bybit:
- generic HTTP 403 -> ACCESS_DENIED / possible region restriction
- no automatic 10-minute quota cooldown
- explicit Bybit retCode 10006 or an explicit rate-limit signal -> RATE_LIMIT + cooldown simulation

Binance:
- HTTP 451 -> GEO_RESTRICTED / legal-region restriction
- not counted as quota exhaustion

### 5. Stream heartbeat observability

Binance Futures:
- explicit RFC6455 ping added
- pong updates lastHeartbeatAt

Bybit:
- multiple documented/observed pong response shapes are recognized

Final workload:
- BINANCE_FUTURES heartbeat observed, reconnects 0, errors 0
- BYBIT heartbeat observed, reconnects 0, errors 0
- OKX heartbeat observed, reconnects 0, errors 0

A stream with no liquidation messages can now still be distinguished from a dead connection through heartbeat telemetry.

### 6. Peak Budget telemetry

The workload report now extracts the highest observed utilization inside each scoped budget instead of only reporting the final sliding-window state.

Observed peaks:
- Binance Spot request weight: 6 / 6000 (~0.1%)
- Bybit global IP window: 3 / 600 (~0.5%)
- Hyperliquid REST weight: 100 / 1200 (~8.3%)
- OKX candles: 3 / 40 (~7.5%)

These are representative-test values, not final production sizing.

## Final boot-inclusive telemetry

| Provider | HTTP calls | Success | Errors | Avg latency | Bytes |
|---|---:|---:|---:|---:|---:|
| DexScreener | 24 | 24 | 0 | 404.7 ms | 1,830,727 |
| OKX | 12 | 12 | 0 | 255.8 ms | 136,528 |
| Bybit | 8 | 0 | 8 | 75.9 ms | 768 |
| CoinGecko | 8 | 5 | 3 | 62 ms | 569,717 |
| DeFiLlama | 6 | 6 | 0 | 144.7 ms | 5,274,430 |
| GMX | 6 | 6 | 0 | 489.2 ms | 573,904 |
| Hyperliquid | 6 | 6 | 0 | 282.5 ms | 358,023 |
| Binance | 4 | 0 | 4 | 106.3 ms | 896 |
| Kraken | 4 | 4 | 0 | 161.3 ms | 240,260 |

### Important interpretation

DeFiLlama remains the largest payload source. The Fast Lane removes heavy catalogues/histories from the Financial critical path, but current Shadow still performs real outbound calls when a logical cache opportunity is detected. Native Cache First will later remove additional repeated calls.

The final run observed:
- DeFiLlama CHAINS: 2 logical observations, 1 cache opportunity
- DeFiLlama STABLECOINS: 2 logical observations, 1 cache opportunity

Therefore further network reduction is expected once Native cache behavior is deliberately enabled.

The final workload was shorter than the earlier boot-inclusive run because the reference-price 12-second timeouts disappeared. As a result it did not cross the same periodic-refresh boundary. The observed DeFiLlama byte reduction should therefore be treated as a workload-level result, not as a pure per-request compression ratio.

## Remaining environment warnings

### CoinGecko

The CI runner has no Demo API key.

Final boot-inclusive run:
- 8 HTTP calls
- 3 HTTP 429

Runtime profile is intentionally UNKNOWN when no CoinGecko API key is configured.

On the real IA-TB environment with a Demo key:
- known Demo profile is enabled
- short-term and monthly budgets apply
- a local/VPS Shadow workload should be run before Native sizing.

### Bybit and Binance

US GitHub runner restrictions remain external to IA-TB:
- Bybit REST: HTTP 403
- Binance Global REST: HTTP 451

These errors are now classified separately from rate limits.

## Shadow invariant

Still disabled:
- request blocking
- request delay
- Native cache substitution
- Native in-flight deduplication
- quota cooldown enforcement
- provider quota enforcement

Shadow continues to:
- observe
- simulate
- classify
- measure
- record headers
- report cache/dedup opportunities
- measure budget peaks

## Next measurement

Run the same workload on the real local/VPS environment with configured API credentials.

That run should specifically compare:
- CoinGecko Demo quota usage
- Binance live reachability
- Bybit live REST reachability
- DeFiLlama bytes over a longer window
- periodic Financial refresh behavior
- Stream heartbeat and reconnect behavior
- cache/dedup opportunities under normal UI/Engine usage
