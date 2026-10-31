# Data Provider Phase 2 — Weighted Budget Shadow

Status: IMPLEMENTED IN SHADOW
Branch: feature/data-policy-orchestrator-v1

## Goal

Support providers whose request limits are expressed in weighted cost units instead of one-call-equals-one-credit.

The design remains provider-agnostic:

REQUEST BUDGET
- provider
- budget scope
- window
- limit
- request cost
- priority

A provider may own several independent scopes.

## Binance

IA-TB currently uses two distinct Binance REST surfaces and they must not share a fake common counter.

### BINANCE_SPOT_WEIGHT
- current documented request-weight window: 1 minute
- configured Shadow limit: 6000 units
- current IA-TB endpoint:
  - /api/v3/klines = cost 2

### BINANCE_USDM_WEIGHT
- current exchangeInfo request-weight window: 1 minute
- configured Shadow limit: 2400 units
- current IA-TB endpoints:
  - /fapi/v1/depth:
    - limit 5/10/20/50 => 2 units
    - limit 100 => 5 units
  - /fapi/v1/openInterest => 1 unit
  - /fapi/v1/premiumIndex with symbol => 1 unit

The HTTP response quota headers remain telemetry inputs and can later reconcile documented/configured limits.

## Hyperliquid

### HYPERLIQUID_REST_WEIGHT
- aggregate IP REST limit: 1200 weight/minute
- l2Book => 2
- metaAndAssetCtxs => default info cost 20
- candleSnapshot => default info cost 20 plus response-size weight

For candleSnapshot, Native authorization cannot know the exact returned row count before the request. Shadow therefore uses a conservative estimate derived from requested time range and interval. The telemetry marks this as:
DOCUMENTED_BASE_PLUS_ESTIMATED_RESPONSE_WEIGHT

This estimate can later be compared with actual returned rows before Native enforcement is enabled.

## Architectural decision

Quota accounting is observed at the HTTP transport boundary because the provider quota is consumed by real outbound calls, not by logical consumer intents.

Logical layer:
- Policy
- Priority
- Broker / dedup opportunity

Transport layer:
- actual provider request
- weighted cost
- budget scope
- rate-limit headers
- HTTP result

## Shadow invariant

Phase 2 still does not:
- block requests
- delay requests
- merge requests
- serve cache instead of the legacy path

It only records what Native mode would have seen.

## Status

[x] generic weighted scopes
[x] independent Binance Spot/Futures scopes
[x] Hyperliquid REST weighted scope
[x] endpoint cost resolver for current IA-TB calls
[x] transport-level budget observation
[x] Phase 1 profiles preserved
[x] Phase 2 contract test created
[x] GitHub Actions checkpoint PASS — run 37464421103
[ ] normal-workload telemetry observation
[ ] Native safety margin / reserve policy


## Test checkpoint

GitHub Actions run `37464421103` on Node `16.20.2` passed the complete non-runtime MarketData contract/debug suite, including `test_phase2_weighted_budget_v1.js`.
