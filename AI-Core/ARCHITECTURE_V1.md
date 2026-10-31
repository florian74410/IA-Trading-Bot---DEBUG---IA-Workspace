# IA-TB AI-Core — Multi-Agent Architecture v1.0 (frozen design)

Status: **VALIDATED DESIGN**, not a claim of deployed or running features.
Scope: developer agent GEN-1 first; Supervisor Engine integration later.

## Immutable decisions
- Native multi-agent registry with stable serial identifiers (example: IATB-AGT-0001).
- Shared code: AgentManager, MemoryManager, CharacterEngine, SkillManager, PolicyEngine, AuditManager.
- Agent identity and narrative personality: **Soul.md only**. **No Soul.json**.
- Per-agent persistent **SQLite** database: Agent-Memory.db. No MySQL/MariaDB required.
- Central SQLite Agent-Registry.db catalogues agent serial, label, role and status; not a store of secrets.
- A file called **Events.jsonl** per agent for a portable, append-only event stream.
- SQLite memory tables: records, events, actions, interactions, responses, reflexions, memories, snapshots and **Statistiques**; agent registry table: agents.
- Statistiques: append-only, one complete trait vector per iteration, values 0..100, timestamps UTC with seconds or finer, source evidence, explanation and approval provenance. Never overwrite an old row.
- Scoring improvements are not necessarily increases; calibration and real outcomes matter more than maximal values.
- Reflexions contain explicitly produced summaries, hypotheses and lessons, not hidden model chain-of-thought.
- Risk Engine controls remain independent and cannot be bypassed by Soul/Memory/Skills. No cross-agent privilege inheritance.
- Runtime data remains outside Git; no credentials or private trading details committed to repository.

## Suggested source tree

```text
AI-Core/
  AgentManager/
  MemoryManager/
  CharacterEngine/
  SkillManager/
  PolicyEngine/
  AuditManager/
Agents/
  templates/
  Development/
  Supervisor/
App/Engines/Supervisor/
  Core/
  Identity/
  Memory/
  Character/
  Skills/
  Connectors/
  Security/
  API/
  Config/
  Tests/
```

Existing project files may use different paths. This tree is **a proposal**, not a migration instruction. Do not replace existing Supervisor code.

## Suggested runtime tree

```text
/var/lib/iatb-ai/
  Agent-Registry.db
  agents/
    IATB-AGT-0001/
      Soul.md
      Events.jsonl
      Agent-Memory.db
      Skills/
      snapshots/
    IATB-AGT-0002/
      Soul.md
      Events.jsonl
      Agent-Memory.db
      Skills/
      snapshots/
```

IATB-AGT-0001 is intended for the development agent. IATB-AGT-0002 is **reserved**, not confirmed created or operational.

## Storage policies
- SQLite WAL mode per database and busy timeouts, with one process coordinating writes if needed.
- Foreign keys ON, uniqueness for agent/iteration, migration tracking and backup using SQLite's backup API.
- Time: RFC3339 UTC with at least second precision, ideally milliseconds; IDs enable ordering when timestamps coincide.
- Records table links each event/action/response/reflexion/snapshot and has correlation_id, agent_serial, context, provenance and timestamps.
- Event JSONL exports must use stable IDs and avoid double counting during reimport.
- Caches are advisory and may be discarded; SQLite is authoritative.
- Store secrets outside these stores; redact logs and encrypt sensitive contents as required.
- Soul.md summarizes enduring principles and verified lessons; untrusted input cannot rewrite it or change agent policy automatically.
- Changes to critical traits or operational policies require explicit approval and audit.
- Shared framework does not mean shared SQLite files, filesystem rights, trading accounts or secrets.

## Delivery boundary
This milestone freezes the **architecture and baseline schema**, not the Supervisor Engine implementation. No VPS deployment, migration, shell access, Caddy changes or trading execution.
