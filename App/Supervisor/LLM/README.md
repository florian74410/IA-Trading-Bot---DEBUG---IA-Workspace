# Supervisor LLM Providers

Provider-neutral reasoning layer for the future Supervisor runtime.

- OPENAI_API: OpenAI Responses API.
- REMOTE_LLM: OpenAI-compatible remote VPS endpoint using /chat/completions.
- MOCK: deterministic local DEBUG provider.
- llm_manager.js: selects provider and optional fallback.

Secrets are never stored in this directory. Inject OPENAI_API_KEY / IATB_LLM_API_KEY or connect the existing encrypted Settings vault when the Supervisor service is implemented.

This layer performs reasoning only. It has no Exchange adapter and no Trading Engine execution capability.
