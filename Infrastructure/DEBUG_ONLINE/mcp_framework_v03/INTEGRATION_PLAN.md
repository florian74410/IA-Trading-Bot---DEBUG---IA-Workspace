# IA-TB MCP v0.3 — Phased implementation and deployment gate

**Source of truth**: development branch `feature/mcp-command-catalog-v0.3`. This is a staging candidate, NOT an installed MCP service.

## P1.1 — Inventory
- Existing DEBUG server: `/opt/iatb-mcp/server.py` (233 lines according to operator's output).
- Known tools: `iatb_status`, `iatb_list_files`, `iatb_read_file`, `iatb_write_file`, `iatb_git_status`, `iatb_git_diff`.
- The exact deployed DEBUG source is **not checked in**; no exact-copy claim is possible. Do not replace the original until source and hash have been audited.
- Architecture source is versioned in the Architecture repo as `mcp/server.py` (site-only).

## P1.2 — Shared command framework
Staged `framework.py` and `staging_server.py` use identical source in both repos:
- strict environment profiles (`debug` and `architecture`), never `release`
- workspace-bound file operations (path traversal blocked; directory handles use `O_NOFOLLOW` and atomic writes)
- bounded list/read/write, Git read-only, limited Python syntax-only test
- no arbitrary shell commands; no privilege escalation; no push/deploy tools
- separate services and ports: DEBUG staged 8801, Architecture staged 8811, both loopback.

## P1.3 — Testing and integration
- `python3 -m unittest discover -v` for policy and mission checks.
- `python3 smoke_http.py` starts the staging MCP profiles and tests them with a real MCP client session.
- CI installs pinned `mcp==2.3.0` only on isolated GitHub runner, never production.
- DEBUG *build-only* CI has an unrelated pre-existing failure: `App/package.json` and `App/Dockerfile.app` are absent from this workspace repository. It must not be marked as a passing full-app build.

## P2 — Safe remote bridge (partially present; unconnected to ChatGPT MCP)
Existing, already defined in `main`:
- `iatb-debug-ops.yml` supports only `status|start|stop|restart|deploy` via `iatb-debug-ci` restricted SSH and environment `debug-ssh`.
- `iatb-ai-dev-ssh.yml` tests a separate restricted developer identity in environment `debug-ai-dev`.
- **Do not broaden either SSH command gate to a general shell.**
- Verify credentials, environment restrictions, allowed commands, firewall and last successful workflow before asserting live remote connectivity. No credentials belong in Git.
- A future authenticated MCP proxy may route to loopback instances, but must implement independent authentication/authorization, rate limits and audit. Do not expose :8800/:8810/:8801/:8811 publicly.

## P3 — Mission Controller (logic, not a runner)
- `mission.py` specifies progression `created -> coding -> testing -> review -> approved -> deploying -> verifying -> succeeded`, plus bounded retry and rollback states.
- Retrying is bounded at three coding attempts.
- The state machine **cannot verify an administrator's identity or authorization**. The external authenticated approvals service must supply and validate the pinned SHA. No deployment API consumes that state today.
- A persistent task queue, scoped worker, approval service, incident reporting, idempotent deployment, and retry-based repair agent are **not yet deployed or integrated**.

## Promotion gates (all mandatory)
1. Preserve a verified byte-for-byte backup of live DEBUG MCP source and config (without leaking its token); audit the full implementation and hash.
2. Differential compatibility tests against the 6 original DEBUG tools.
3. Penetration / negative tests and resource restrictions for both service identities.
4. GitHub CI passing for the MCP scope; separately restore full-app source before requiring the full application build.
5. Complete an administrator-approved, *non-production* test of all remote steps.
6. Backup, health checks, rollback test, scoped SSH identity verified, and mutually agreed deployment window.
7. Only then install/restart MCP services; never touch trading RELEASE in this effort.

## End-to-end goal
User request -> ChatGPT authoring & PR -> CI -> explicit human approval for impactful action -> SHA-pinned isolated VPS gate -> health verification -> bounded repair attempt or rollback -> audit.

No unattended background activity from this chat is assumed. For persistent agent execution, provision a separate task runner/Work integration with explicit credentials and authority.
