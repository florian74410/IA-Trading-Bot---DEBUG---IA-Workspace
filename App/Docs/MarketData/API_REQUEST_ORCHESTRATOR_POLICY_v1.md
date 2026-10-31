# API Request Orchestrator + Data Source Policy v1

Status: PHASES 1-3 IMPLEMENTED / CONTRACT + RUNTIME VALIDATED / SHADOW MODE
Branch: feature/data-policy-orchestrator-v1

## Architecture validated

API REQUEST ORCHESTRATOR
- Request Broker
  - Cache First (G-lite, post-firewall trust boundary only)
  - Request Deduplication (H)
- Request Budget
  - Short-term Budget (D)
  - Long-term Budget (D)
  - Priority Budget (E)
- Outbound Dispatcher
- In-flight Registry
- Inbound Processor

DATA SOURCE POLICY
- Dataset Registry
- Provider Policy
- Freshness Policy
- Request Policy
- Criticality
- Retention Policy
- Distribution Policy

## Design rules

1. Provider-agnostic architecture
The same Orchestrator/Policy architecture is intended for CoinGecko, DeFiLlama, CEX/DEX REST APIs and future data providers. Provider-specific limits are configuration, not separate orchestration implementations.

2. Primary provider first
A dataset may declare compatible alternate providers, but v1 does not automatically query all of them. One primary provider is selected for a given dataset/context. Alternates are future fallback or explicit cross-check sources. This avoids unnecessary API calls and conflicting data.

3. Criticality is not trading risk
criticality describes the operational impact of missing/stale data:
- CRITICAL: required data absence may block the dependent operation.
- HIGH: operation should normally wait/fail safe if data is unavailable.
- NORMAL: degradation is acceptable depending on consumer.
- LOW: informational; absence should not block core operations.

A future Supervisor may use criticality when deciding whether enough required data exists to execute a command. It must not replace the Risk Engine or be interpreted as market/trade risk.

4. Freshness classes
- REALTIME: no durable business cache; deduplication/micro-cache may still apply.
- FAST: short cache/refresh horizon.
- STANDARD: normal cache horizon.
- SLOW: long-lived metadata/reference data.

5. Shadow mode is observational only
Shadow mode must never block, delay, reorder, deduplicate, cache-substitute or otherwise change current provider calls. It records what Native mode would have considered:
- cache opportunity
- duplicate in-flight opportunity
- priority
- short-term budget state
- long-term budget state
- criticality/freshness policy

## Migration

### STEP 1 — SHADOW (current)
Current Market Data behavior remains authoritative.
Policy/Orchestrator observes real request intent and exposes telemetry.
Shadow scope: the Market Data Collector as a whole. Raw REST telemetry is captured at the shared HTTP layer for every provider using `Provider/http_json.js`. CoinGecko is only the first provider with a detailed logical Policy/Budget profile; other providers can be classified later without losing their raw historical telemetry.
No engine contract is changed.

### STEP 2 — NATIVE (required later)
After shadow metrics/tests are validated:
- Broker may satisfy fresh cache requests.
- Deduplication may merge identical in-flight calls.
- Budget may authorize/defer calls.
- Dispatcher/Inbound Processor become authoritative.
- Existing Market Data external contracts must remain backward compatible during migration.

### Optional Proxy step
A separate Proxy migration stage is not mandatory. Use only if Shadow findings show that an intermediate compatibility layer materially reduces risk.

## CoinGecko v1 Policy

Datasets currently classified:
- ASSET_SEARCH: P2 / STANDARD / LOW
- MARKET_REGISTRY: P1 / STANDARD / NORMAL
- ASSET_METADATA: P2 / SLOW / LOW
- GLOBAL_MARKET: P1 / STANDARD / NORMAL
- REFERENCE_PRICE: P1 / FAST / HIGH
- CEX_REFERENCE: P2 / STANDARD / NORMAL

Shadow budget reference:
- short-term: 100 cost units / 60 sec
- long-term: 10,000 cost units / 30 days
- reserve: 2,000 cost units
- default endpoint cost: 1

These numbers are policy configuration for CoinGecko only. Other providers must get their own verified configuration before Native enforcement.

## DEVMAP

[x] R&D: D + E + H + G-lite architecture selected
[x] R&D: provider-agnostic Orchestrator selected
[x] R&D: Data Source Policy selected
[x] R&D: criticality added
[x] Development: core Policy
[x] Development: Broker shadow telemetry
[x] Development: Double Budget shadow telemetry
[x] Development: Priority metadata
[x] Development: In-flight duplicate observation
[x] Integration: CoinGecko Shadow Mode
[x] Phase 1 provider budgets: CoinGecko / DeFiLlama / GMX / DexScreener
[x] Phase 2 weighted budgets: Binance / Hyperliquid
[x] Phase 3 special limits: Kraken / OKX / Bybit
[x] REST transport quota feedback / dynamic headers
[x] Stream transport telemetry
[x] Contract suite validated on Node 16.20.2
[x] Runtime Shadow validated with Router + Firewall + MarketData + Indicator + Liquidity
[ ] Validate Shadow telemetry under representative sustained IA-TB workload
[x] Extend Shadow coverage provider-by-provider with verified/observed policies and limits
[ ] Define storage/retention policy per dataset
[ ] Define Router/CP distribution contracts for new datasets
[ ] Native-mode implementation
[ ] Native migration without breaking existing Engines
[ ] Analytics Model Runtime foundations

## Non-goals for v1
- no Adaptive Budget
- no complex Priority Aging
- no automatic provider scoring
- no automatic multi-provider fan-out
- no analytics calculations
- no model states/scores
- no trading authority


## SQL telemetry

Raw and logical API telemetry is persisted in:

`Shared Data/MarketData/api_telemetry.db`

Table: `api_calls`

The schema is designed for later use by diagnostics, the Supervisor, dashboards, or analytical foundations without requiring UI exposure now.

Captured raw REST fields include:
- request id
- timestamp / completion time
- provider / host
- HTTP method
- endpoint path (query string intentionally not persisted)
- status / success
- latency
- response bytes
- request cost hint
- error code

When a logical Data Source Policy exists, the same store also receives:
- dataset
- priority
- freshness
- criticality
- cache opportunity
- deduplication opportunity
- short-budget decision
- long-budget decision

The store provides internal `history()` and `summary()` query methods. No public HTTP/UI endpoint is required in Shadow v1.

### Security note
Full URLs and query strings are not stored in raw telemetry. This prevents future API keys, addresses, or sensitive request parameters from being written accidentally to the telemetry database.



## Stream telemetry

The transport observability layer now covers both request/response APIs and long-lived streams:

DATA TRANSPORT OBSERVABILITY
- REST Telemetry
- Stream Telemetry
  - connections
  - subscriptions
  - messages
  - disconnects
  - reconnects
  - heartbeat
  - errors
  - rate-limit-related failures when surfaced by the provider

Stream telemetry is persisted in the same SQLite database, `api_telemetry.db`, using a separate `stream_events` table.

The v1 design intentionally stores periodic health snapshots and lifecycle transitions rather than one SQL row per market message. This prevents observability from becoming a new source of load.

Current first stream integrations:
- BINANCE_FUTURES liquidation stream
- OKX liquidation stream
- BYBIT liquidation stream

Each worker periodically reports cumulative message count, connection count, reconnect count, subscriptions, last message time, last heartbeat time and latest error state.

No stream Budget/Policy enforcement is enabled yet. Stream-specific provider limits will be configured later, after provider retention decisions are finalized.

## Data trust boundary

Authoritative order:

`Market Data Collector -> Orchestrator/Policy/Passport -> external Provider -> Data Firewall -> normalization/cache/storage -> Router -> consumers`

Rules:
- in-flight deduplication may occur before the provider call because it does not persist provider data;
- raw provider responses must never be admitted to a persistent/reusable cache before Data Firewall validation;
- cache/store admission is post-firewall only;
- a Firewall REJECT must produce zero cache admission and zero storage write;
- the former raw Provider Proxy Cache First path is disabled. Existing domain caches (candles, liquidity, microstructure, financial snapshots and validated metadata) remain after Firewall validation.

This rule takes priority over optimization. A future shared Cache First implementation must operate on firewall-validated data, not on raw provider payloads.

## Ranked alternate providers

Alternate Provider Policy v1 is dataset-specific. Rank 1 is the preferred provider; higher ranks are fallbacks only when the preceding provider is unavailable for a fallbackable reason.

Rules:
- always use the lowest available rank;
- skip providers currently unavailable/unhealthy for the requested dataset;
- fallback only to providers offering semantically equivalent data;
- never infer Spot vs Perpetual from an ambiguous generic dataset;
- configuration/auth/request errors are not hidden by provider fallback;
- Open Interest aggregate is not a fallback chain: unavailable contributors make the aggregate PARTIAL;
- if every compatible provider fails, surface `NO_PROVIDER_AVAILABLE` with an explicit user-facing explanation;
- v1 remains Shadow-only: no alternate provider is executed automatically yet.

Initial preference chains:
- Spot price/ticker/candles/orderbook: Binance -> OKX -> Kraken -> Bybit
- Perpetual price/ticker/candles: Binance -> Bybit -> OKX -> Hyperliquid -> GMX
- Perpetual orderbook: Binance -> Bybit -> OKX -> Hyperliquid
- DEX pair liquidity: DexScreener only
- Global market data: CoinGecko only
- Open Interest aggregate contributors: Binance + OKX + Bybit + Hyperliquid + GMX

## Currency Registry

IA-TB uses one Currency Registry as the source of truth for reference FIAT metadata and Stable Asset -> FIAT relationships.

FIAT references: USD, EUR, GBP, JPY, CNY, CHF and CAD.

Stable Asset mappings include USDT -> USD, USDC -> USD, DAI -> USD, EURC -> EUR, TGBP -> GBP, ZCHF -> CHF, QCAD -> CAD and JPYC -> JPY. A single resolution can therefore answer both `USD` and `USDT` without consulting two registries.

The Currency Registry stores identity and reference metadata only. It never assumes that a Stable Asset is worth exactly one unit of its reference FIAT and it does not persist live FX/peg prices. Live Market Data supplies the observed conversion price.

Normalization keeps a receipt containing the source asset, source amount/unit, reference FIAT, observed USD price and normalized USD amount.

Open Interest aggregation consumes this metadata before summation. Source notional, source unit, reference FIAT, observed conversion price and normalized USD value are preserved per venue. Stable Asset values are never assumed to equal their FIAT peg: if a live conversion price is unavailable, that venue is excluded from the normalized total and coverage is marked partial.
