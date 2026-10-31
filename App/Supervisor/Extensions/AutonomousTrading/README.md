# AutonomousTrading Supervisor Extension

Extension scaffold for IA-TB v2.0 DEBUG.

Modes: OFF, ANALYZE, PAPER, LIVE_GUARDED.

Safety contract:
- Chat may request analysis or prepare a TradeIntent.
- PAPER activation requires explicit confirmation.
- LIVE_GUARDED is intentionally runtime-locked until Supervisor process + Router TradeIntent route + Risk Gate + Firewall + Trading Engine integration are verified.
- The extension never calls an exchange adapter directly.
- Every executable intent must go Supervisor -> Router -> Risk -> Firewall -> Trading.
- Supervisor cannot modify Risk limits.
