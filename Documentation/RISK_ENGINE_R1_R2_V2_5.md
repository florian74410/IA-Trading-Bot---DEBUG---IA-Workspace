# IA-TB 2.5.0 DEV — Risk Engine R1/R2

**Base**: `2.4.2-R1` (nettoyage validé CI, descendant de 2.4.1). **Version**: 2.5.0 DEV. **Aucun déploiement GEN-1 ni activation LIVE.**

## R1 — Pre-trade modules (local Node.js, no OpenAI)
`Risk/Engine/risk_r1_modules.js`: four individually configurable modules.
- A `capital`: account equity, order notional and capital committed percentage.
- B `stopLoss`: stop distance, estimated loss, entry/exit cost reserve using explicit fee/slippage assumptions.
- C `riskBudget`: loss relative to equity versus policy preset.
- D `resize`: down-rounded alternative quantity using verified quantity step; requires a **new intent and complete validation**.

Policies (illustrative): conservative 0.5%, balanced 1%, active 1.5%, aggressive 2% per trade. This is **linear-instrument arithmetic only**; inverse contracts, cross-margin, liquidation, derivatives fees and actual exchange constraints require separate validated adapters.

R1 returns `risk.r1.decision/1.0`, compact `supervisor` summary, `PASS|PARTIAL|RESIZE|REJECT|INSUFFICIENT_DATA|DISABLED`, `executable:false`. Missing equity, price, fees, slippage or stop is **not** silently replaced with zero.

## R2 — Portfolio monitoring
`Risk/Engine/risk_r2_modules.js` modules:
1. equity integrity/availability;
2. drawdown;
3. per-asset exposure/concentration;
4. correlation **interface reserved, not yet evaluable without historical returns**;
5. margin-buffer alert only when exchange margin ratio provided;
6. stress tests **interface reserved, not yet evaluable without market scenarios**;
7. combined stop-risk budget;
8. freshness and reconciliation integrity.

Monitoring refresh: 30 s where authorized. Snapshot output `risk.r2.snapshot/1.0`, compact CP/1 event `risk.r2.alert/1.0` only for material alerts; identical events deduplicated. **No OpenAI API call in Risk Engine**, no automatic close/hedge, no direct Trading Engine execution.

### Auth21 limitation (important)
The existing Portfolio `analysis_mode=TRADING_ONLY` snapshot exposes trading PnL, **not authoritative account equity**. It must not be used as equity. Furthermore a global automated monitor cannot use a cross-user snapshot in Auth21: autonomous R2 polling is **disabled in Auth21 mode until an owner-scoped Portfolio data contract exists**. On-demand R2 analytical calculations can take a supplied snapshot but are **not an execution authorization**. This security limitation is deliberate and remains an integration task.

## CP/1 and future Supervisor integration
Existing Risk Engine port 8019 through Router:
- `risk.r1.evaluate` args: `{intent,context}`, returns numeric summary plus optional resize proposal.
- `risk.r2.evaluate` args: `{snapshot}`, returns status, alerts and `blockAdditionalRisk`.
- `risk.r2.monitor` requests Portfolio via CP/1, returns read-only diagnostic and never invokes a model.
- `risk.r2.alert` event: alert category/severity without raw position data.

The existing `risk.gate.evaluate/verify` and signed `risk_approval_id` mechanisms are **preserved and unchanged**. The new R1/R2 analytics are **not yet a mandatory synchronized pre-approval gate**: trusted account equity, exchange costs and owner-scoped current positions are required before hard-block/resize is wired into every Supervisor intent. The LLM must never treat `executable:false` as an approval; a new proposed quantity requires an independent gate evaluation.

## Settings → Risk Engine
New panel with engine enable, independent R1/R2 enable, individual module toggles and risk profile. Save/read using `GET/POST /api/admin/risk/settings` through the existing Auth21 ADMIN guard and explicit ADMIN_ONLY route inventory. The generic `/communication/v1/ui/write` is intentionally **not used**, because Auth21 blocks it. Non-ADMIN must receive a refusal. Settings are stored in SQLite through Core and read by Risk.

The engine master enable controls analytical functions but the existing RiskGate deny when disabled is not relaxed. Risk/Firewall and live-trading guards remain independent of module toggles.

## Validation
```bash
node --test App/Risk/Tests/test_risk_r1_r2_v25.js App/Risk/Tests/test_risk_settings_v25.js
node App/Tools_validate_release_version.js
```
GitHub Actions: `.github/workflows/risk-v25.yml` for focused validation; `.github/workflows/v24-finance-trading-logs.yml` for complete 2.5 source/auth integration via v25 integrity guard.

**Still needed before declaring integration complete:** browser validation under real Auth21 ADMIN, full owner-scoped R2 portfolio data, R1/R2 atomic decision bound to every Supervisor trade intent, exchange-specific margin/fees/step rules, and correlation/stress models with adequate samples.

## Boundaries
No keys or user databases in Git; no weakening of RBAC or trading protections; no actual trading orders; no GEN-1 deployment. The Risk Engine is not an OpenAI token consumer.
