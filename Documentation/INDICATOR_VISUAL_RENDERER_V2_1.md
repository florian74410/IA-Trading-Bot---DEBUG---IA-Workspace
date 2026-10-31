# IA-TB 2.1 — Indicator Visual Renderer V2

Development branch: `feature/indicator-visual-renderer-v2.1`.

The renderer is declarative. Existing `iatb.indicator.v1` calculations and dependencies remain unchanged.
Optional `display.visual.layers` drives rendering:
- `cloud` / `band`: `upper` and `lower` refer to numeric engine output keys, plus `bullColor`, `bearColor`, `opacity`.
- The browser only aligns timestamps and draws the returned values, without computing indicators.
- Null/warmup gaps remain gaps. No data or future Ichimoku timestamps are fabricated.
- The contract remains limited to whitelisted rendering primitives; do not evaluate JSON as code.

21 built-in indicators carry V2 graphical metadata.\n\nStatus: development branch only, not deployed to GEN-1. The package is not production-validated until Firefox end-to-end tests and compatibility checks succeed.
