# Function Registry Manager v1.1 — Core component

This is a **Core-owned module**, not a separate Engine. Every Router-connected Engine is intended to embed `Shared/FunctionRegistry/client.py` or an equivalent adapter and keep its own SQLite function registry and durable outbox.

## Contract and sync

Each Engine publishes a complete snapshot with `engine`, monotonic `revision` and `functions`; Core stores indexed contracts in `Core-Functions.db` (SQLite). New/changed functions default to DENY. A changed contract revokes existing privileges, stale snapshots are ignored, removed functions are deleted. The Supervisor may retrieve the complete effective catalogue in one read via Core.

The client writes its local registry and outbox atomically; a future authenticated CP/1 adapter will send pending snapshots and acknowledge only after the Core confirms. Core must verify the Engine's identity before calling `sync`. When reconnecting, reconcile by revision and full snapshot. For a high-scale deployment, add a bounded in-memory cache and event subscription.

## Security boundaries

`set_privilege` must ONLY be exposed behind an independently authenticated and authorized admin service. Its `approved` argument is an internal precondition, **not a substitute for authentication**. The UI cannot call it directly. HIGH/CRITICAL ALLOW are rejected until a dedicated approval workflow is implemented; hard-deny functions can never be granted.

`view(agent_serial)` is discovery data; not an execution token. A router-side policy enforcement point must validate each CP/1 call and engine-side checks must remain active. Risk Engine is sovereign for trading risk.

## Integration status

**Phase v1.1 skeleton implemented in this DEBUG workspace repo only.** Real production Engine code and Router entrypoints were not available in this workspace. No claim that every Engine has been patched, nor that the actual Settings→IA page uses the prototype. No GEN-1 deployment, no RELEASE changes.

Target Engine adapters: MarketData, Fundamental, Indicator, Liquidity, Strategy, Risk, Trading, Portfolio and other registered CP/1 engines. First discover the real functions and their signatures rather than inventing them.
