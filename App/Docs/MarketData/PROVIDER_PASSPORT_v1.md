# Provider Passport v1

Status: ACTIVE DESIGN RULE / ORCHESTRATOR SUPPORT

A Provider Passport is the mandatory identity sheet of every external Market Data provider.

## Rule

Adding an API adapter is not enough to mark a provider as integrated.

Before a provider can be considered complete, its Passport must describe at minimum:

- provider id
- transports used (REST / STREAM)
- datasets/policy coverage
- TTL/freshness policy
- priority and criticality policy
- quota model
- quota provenance
- known provider-specific errors/feedback model
- current readiness: READY / PARTIAL / UNKNOWN
- Native-enforcement readiness

Unknown limits must remain UNKNOWN. They must never be invented to make a Passport appear complete.

## Provenance vocabulary

- DOCUMENTED
- OBSERVED_HEADER
- OBSERVED_429
- SAFE_RECOMMENDATION
- UNKNOWN

## Current passports

| Provider | Status | Quota model | Main provenance |
|---|---|---|---|
| CoinGecko | PARTIAL | Demo known / anonymous unknown | DOCUMENTED + OBSERVED_429 + UNKNOWN |
| DeFiLlama | PARTIAL | UNKNOWN | UNKNOWN |
| GMX | PARTIAL | UNKNOWN | UNKNOWN |
| DexScreener | READY | RPM | DOCUMENTED |
| Binance | READY | WEIGHTED_MULTI_SCOPE | DOCUMENTED |
| Hyperliquid | READY | WEIGHTED | DOCUMENTED |
| Kraken | PARTIAL | SAFE_PACE | SAFE_RECOMMENDATION |
| OKX | PARTIAL | MIXED_ENDPOINT | DOCUMENTED + UNKNOWN |
| Bybit | READY | MULTI_SCOPE_DYNAMIC | DOCUMENTED + OBSERVED_HEADER |

READY means the Passport is sufficiently described for the current Shadow architecture. It does not mean quota enforcement is enabled.

## New-provider Definition of Done

A new provider is not complete until:

1. Adapter/provider connection exists.
2. Provider Passport exists.
3. Dataset policy and TTL are defined.
4. Priority/criticality are defined.
5. Quota model and provenance are defined, including UNKNOWN where necessary.
6. Provider-specific errors / feedback behavior are classified.
7. REST/Stream telemetry is connected where applicable.
8. Contract tests pass.
9. ROADMAP is updated.

The Orchestrator stays provider-agnostic. Specialization belongs in Passport/Policy/Profile configuration.

## Non-blocking UNKNOWN rule

A quota with no reliable hard limit must use `OBSERVE_ONLY_NON_BLOCKING`.

This means telemetry, 429/Retry-After detection and cache/dedup continue to work, but the Orchestrator must not turn an UNKNOWN budget into a hard application blocker. Kraken safe pacing is also advisory until a verified applicable hard limit is available.

Documented/scoped providers can remain eligible for future enforcement, but current project policy still keeps Budget/Priority/Cooldown enforcement disabled while Shadow validation continues.
