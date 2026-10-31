# IA-TB v2.0 DEBUG — GEN-1 VPS migration reference

**Status:** DEBUG technical migration validated on Contabo on 2026-10-11, following user-confirmed integration and cleanup checks. This document records a **DEBUG** baseline; it does not authorize promotion to RELEASE or real trading.

## Source of truth

- Git branch: `migration/node22-sqlite12`
- Git release candidate tag (to be created and confirmed on VPS): `v2.0-debug-gen1-migration`
- Local Docker image tag: `iatb:v2.0-debug-gen1`
- **Immutable Docker image ID:** see persistent VPS manifest `/var/lib/iatb/debug/state/GEN1_DEBUG_REFERENCE.txt` (the exact value must be copied from the VPS, never inferred from Git).
- Runtime: Node.js 22; better-sqlite3 12.4.1.
- Compose file: `compose.debug.stack.yml`; profile `manual-stack`.
- Running services: router, core, ui, firewall, marketdata, indicator, fundamental, liquidity, strategy, risk, portfolio, supervisor, ssh-ui-bridge.
- Trading container: **not started**; live trading disabled.
- DEBUG UI accessible only through a private Unix socket and SSH forwarding; no published Docker ports.
- Market Data external access remains disabled in the current offline diagnostic configuration.
- DEBUG persistence under `/var/lib/iatb/debug`; RELEASE persistence remains separate under `/var/lib/iatb/release`.
- Testing tools and suites remain versioned in Git but are excluded from the final runtime image by `App/.dockerignore`.
- Local untracked `App/Fundamental/Engine/bootstrap_sqlite.js.backup` must be preserved and never committed or deleted.

## Validation evidence

The operator reported **Full OK** after 13-container rebuild, service health checks, UI SSH socket check, no public Docker ports, and Trading Engine absence, then **OK** after Docker cleanup and creation of the local reference tag and persistent manifest.

The SHA256 Docker image ID and individual service logs are kept on the VPS, not duplicated or invented in this document.

## Pre-RELEASE gate

Before integrating the first RELEASE build, implement the Shared Data GEN-1 + Compatibility Layer v1 described in `ROADMAP.md`. Preserve independent private data and enforce `schema_id` / `schema_version` checks before consuming shared content.

## Git branch integration warning

The migration branch and `main` have diverged significantly (comparison observed: migration ahead 2198, behind 50 as of 2026-10-11). **Do not force-push, reset, or blindly fast-forward `main`.** Prepare a reviewed integration after investigating history and conflicts. The frozen DEBUG tag is an audit point, not a RELEASE deployment.
