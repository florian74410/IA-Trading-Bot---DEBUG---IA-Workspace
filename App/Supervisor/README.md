# IA-TB Supervisor Runtime

Runtime service: `Supervisor/supervisor_service.js` on **127.0.0.1:3000**.

Responsibilities:
- load the selected LLM through `Supervisor/LLM/llm_manager.js`;
- discover Supervisor extensions through the Extension Manager;
- expose health/status/reasoning through authenticated CP/1;
- dynamically register with Router and retry while Router starts;
- remain an **orchestrator / intention-only** component.

Security invariant:
```
Supervisor -> TradeIntent -> Router -> Risk -> Firewall -> Trading Engine -> Exchange
```
The Supervisor must never import an exchange adapter, hold exchange credentials, or execute an order directly.

Current runtime stage:
- Supervisor service: active
- LLM Manager: active (MOCK/OpenAI/remote OpenAI-compatible VPS)
- AutonomousTrading extension discovery: active
- Trade execution from Supervisor: intentionally locked until the Risk approval contract and Firewall-to-Trading path are implemented and tested.
