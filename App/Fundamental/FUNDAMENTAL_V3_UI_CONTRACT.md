# Fundamental V3 — Source Manager, Observability and UI contract

Status: **V3 / consolidated**. Fundamental remains `INFORMATION_ONLY`.

## Access model
News, Events, Evidence, Metrics, Syntheses, diagnostics and technical logs are private backend data. Admin accesses management/diagnostic functions through Router/CP1. Supervisor consumes business data/syntheses through Router/CP1. Standard users do not receive direct database, source-management or log access. A later community workflow may let users propose sources/providers; activation remains an Admin action.

## Source Manager V2
A source is catalogue identity/quality metadata. A feed is one concrete acquisition channel. Do not interpret `0/0` as a broken source: it means no feed is configured.

Provider families: RSS/ATOM, WEB, SOCIAL/X, future API.

Canonical source/feed operational states:
`NOT_CONFIGURED`, `DISABLED`, `TESTING`, `ONLINE`, `DEGRADED`, `STALE`, `ERROR`, `AUTH_REQUIRED`, `RATE_LIMITED`.

A source row must expose at least: category/domain, configured/available feeds, operational health, last data time and last error. Opening a source exposes feeds, provider configuration, test/collect controls, diagnostic and related logs.

Diagnostics are layered: CONFIG -> NETWORK -> HTTP/TRANSPORT -> PARSER -> CONTENT -> DATABASE -> EVENT. Tests must report timings and precise error codes rather than a single pass/fail.

## Categories
Keep existing domains and add DeFi as a first-class family. Initial DeFi taxonomy:
`DEFI`, `DEFI_PROTOCOL`, `DEFI_TVL`, `DEFI_DEX`, `DEFI_LENDING`, `DEFI_STABLECOIN`, `DEFI_BRIDGE`, `DEFI_LIQUIDITY`, `DEFI_GOVERNANCE`, `DEFI_EXPLOIT`.
An item/event may have multiple categories.

## Observability V2
Record rich structured JSONL. There is deliberately **no Job entity**. Related activity is reconstructed with `request_id` and `correlation_id`.

Capture as available:
- identity: timestamp, sequence, level, engine/version, component, worker, instance/pid;
- communication: request/correlation IDs, CP1 source/target/action, transport and latency;
- source/feed/provider/category identity;
- collection: intervals, timings, HTTP status, redirects, bytes, content type, received/valid/rejected/new/updated/duplicate counts;
- parsing: parser/format, duration, fields, body quality, publication date/language;
- database: operation/table, duration, rows read/written/updated/rejected, schema state;
- Event Engine: event IDs/status transitions/assets/categories/evidence/independent sources/confidence/impact/direction/conflict;
- AI: request type/model/context/input hash/duration/status/token metadata when available/synthesis ID;
- errors: code/type/message/stage/attempt/consecutive errors/last success/stack in debug;
- system: memory/CPU/event-loop/backlog/uptime when useful.

Secrets must be redacted before persistence and before Admin/AI exposure.

Fundamental AI has two separate contexts:
- BUSINESS: News/Events/Evidence/Metrics synthesis.
- DIAGNOSTIC: health/logs/errors/provider state. It may propose fixes; it does not autonomously change production source/provider configuration.

## Fundamental Activity Console
Place an Admin-only console at the bottom of the Fundamental page, below the existing AI synthesis area.

The backend records maximum detail. The default UI uses progressive disclosure:
- compact activity cards;
- expandable technical detail;
- raw logs only on demand.

Tabs/filters: `Tout`, `Collecte`, `Supervisor`, `IA`, `Erreurs`; level, component, source, text search; LIVE/PAUSE; option to hide successful collections with no change.

Compact collection example:

```
02:58:14  COLLECTE · CoinDesk / RSS                    321 ms
           37 reçues · 3 nouvelles · 2 enrichies · 32 connues
           1 Event créé · 1 Event mis à jour
           Réseau ✓  RSS ✓  Contenu ✓  DB ✓  Event ✓
                                                   [Détails]
```

Supervisor example:

```
03:04:21  SUPERVISOR -> FUNDAMENTAL
           Recherche ETH · DEFI · 24 h
           8 Events · 21 Evidence · 11 ms
```

Error example:

```
03:01:17  DECRYPT / WEB · ERROR
           Page reçue mais aucune News reconnue
           HTTP ✓  Parser !  Content X
           4e erreur consécutive
           [Diagnostic] [Logs techniques] [Analyse IA]
```

The console must support both historical retrieval and near-real-time activity. In the distributed VPS architecture, UI never reads Fundamental files/DB directly: UI/Admin -> Router/CP1 -> Fundamental.

## Future transport
Current v1.x local transport stays lightweight. CP1 contracts must remain deployable later through persistent mTLS links when Router becomes a proxy and Engines/Supervisor/Data are split across VPSs.


## AI Chat + Source Discovery
The Fundamental page AI chat is also an Admin assistant for source discovery and configuration. It may search through an authorized discovery adapter, inspect candidates, detect existing sources/feeds, infer the likely provider family, prepare a disabled draft and run the real Diagnostic Core/Collector test path.

Conversation examples:
- "Trouve-moi des sources sur les exploits DeFi."
- "Teste les flux RSS les plus intéressants."
- "Pourquoi Decrypt ne fonctionne plus ?"
- "Trouve une source de remplacement."
- "Prépare la configuration de la première."

Discovery workflow:
`Chat -> discovery.search -> inspect/deduplicate -> prepare disabled draft -> test -> Admin review -> explicit activation`.

The AI never directly activates a discovered source. Discovery results are proposals. Source/feed creation or activation is an Admin-authorized action with explicit validation.

UI discovery cards should summarize: source name, provider, categories, authentication requirement, duplicate state, test compatibility and diagnostic result, with progressive actions such as `Tester`, `Voir détails`, `Préparer`, and finally an Admin confirmation control.

The Activity Console records discovery/search/test/configuration activity just like collection and Supervisor activity.
