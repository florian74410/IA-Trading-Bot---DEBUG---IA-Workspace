"""Fail-closed policy evaluation. Declarative Git rules are NOT an access grant.

Only a separately protected, independently authenticated authority may grant a capability.
This module NEVER executes commands, SSH, Docker or network requests.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from fnmatch import fnmatchcase
import json
from pathlib import Path
import re
from typing import Protocol

TOKEN = re.compile(r"^[a-z][a-z0-9_.:-]{0,95}$")
RESOURCE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_./:-]{0,191}$")
SENSITIVE_RESOURCE = re.compile(r"(?:^|[/._:-])(release|production|prod|private.key|docker.sock)(?:$|[/._:-])", re.I)
SENSITIVE_PATH = re.compile(r"(^/|\.\.|\\|//)")
FORBIDDEN_ACTIONS = ("release.*", "prod.*", "production.*",
                     "secrets.*", "keys.private.*", "trading.live.*",
                     "docker.raw.*", "sudo.*", "policy.grant.*",
                     "audit.delete", "audit.update")


class Authority(Protocol):
    def is_granted(self, *, principal: str, action: str, resource: str,
                   policy_id: str, at: datetime) -> bool:
        """Validate protected, externally approved, unexpired and unspent capability."""


class DenyAllAuthority:
    def is_granted(self, **kwargs: object) -> bool:
        return False


@dataclass(frozen=True)
class Decision:
    outcome: str
    reason: str
    policy_id: str = ""
    executable: bool = False

    def as_dict(self) -> dict:
        return {"outcome": self.outcome, "reason": self.reason,
                "policy_id": self.policy_id, "executable": self.executable}


def _read(path: Path) -> dict:
    doc = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(doc, dict) or not isinstance(doc.get("rules"), list):
        raise ValueError("Policy must contain a rules array")
    if len(doc["rules"]) > 1024:
        raise ValueError("Too many policy rules")
    return doc


class PolicyEngine:
    """Evaluates intent only. A trusted operation gateway MUST revalidate at execution."""

    def __init__(self, authorized_file: Path, denied_file: Path,
                 authority: Authority | None = None):
        self.authorized = _read(Path(authorized_file))["rules"]
        self.denied = _read(Path(denied_file))["rules"]
        self.authority = authority if authority is not None else DenyAllAuthority()
        for rule in self.authorized:
            if not isinstance(rule, dict) or not all(
                isinstance(rule.get(k), str) and rule[k] for k in ("id", "action", "resource", "principal")
            ):
                raise ValueError("Malformed allow rule")
            if "*" in rule["action"] or "*" in rule["resource"] or "*" in rule["principal"]:
                raise ValueError("Wildcard allow rule prohibited")
        for rule in self.denied:
            if not isinstance(rule, dict) or rule.get("level") not in ("HARD_DENY", "RESTRICTED"):
                raise ValueError("Malformed deny rule")
            if not isinstance(rule.get("action"), str) or not isinstance(rule.get("resource"), str):
                raise ValueError("Missing deny selector")

    def evaluate(self, *, action: str, resource: str, principal: str,
                 at: datetime | None = None) -> Decision:
        if not all(isinstance(value, str) for value in (action, resource, principal)):
            return Decision("DENY", "INVALID_INPUT")
        if not TOKEN.fullmatch(action) or not TOKEN.fullmatch(principal) or not RESOURCE.fullmatch(resource):
            return Decision("DENY", "INVALID_IDENTIFIER")
        if SENSITIVE_PATH.search(resource):
            return Decision("HARD_DENY", "UNSAFE_PATH")
        if SENSITIVE_RESOURCE.search(resource) or any(fnmatchcase(action, p) for p in FORBIDDEN_ACTIONS):
            return Decision("HARD_DENY", "PROTECTED_BOUNDARY")
        applicable = [r for r in self.denied if fnmatchcase(action, r["action"])
                      and fnmatchcase(resource, r["resource"])]
        # Most restrictive rule wins, independent of JSON ordering.
        if any(r["level"] == "HARD_DENY" for r in applicable):
            return Decision("HARD_DENY", "EXPLICIT_PROHIBITION")
        if any(r["level"] == "RESTRICTED" for r in applicable):
            return Decision("RESTRICTED", "EXTERNAL_APPROVAL_REQUIRED")
        now = at or datetime.now(timezone.utc)
        if now.tzinfo is None:
            return Decision("DENY", "NAIVE_TIMESTAMP")
        for rule in self.authorized:
            if (rule["action"], rule["resource"], rule["principal"]) != (action, resource, principal):
                continue
            if not rule.get("enabled", False):
                continue
            expires = rule.get("expires_at")
            if expires:
                try:
                    deadline = datetime.fromisoformat(expires.replace("Z", "+00:00"))
                    if deadline.tzinfo is None or now >= deadline:
                        return Decision("DENY", "EXPIRED")
                except (ValueError, TypeError):
                    return Decision("DENY", "INVALID_EXPIRATION")
            try:
                allowed = self.authority.is_granted(
                    principal=principal, action=action, resource=resource,
                    policy_id=rule["id"], at=now)
            except Exception:
                return Decision("DENY", "AUTHORITY_UNAVAILABLE")
            if allowed is True:
                # No execution is ever authorized by this evaluator alone.
                return Decision("ALLOW", "AUTHORITY_VERIFIED", rule["id"], executable=False)
            return Decision("DENY", "NO_PROTECTED_GRANT")
        return Decision("DENY", "DEFAULT_DENY")


def load_default(authority: Authority | None = None) -> PolicyEngine:
    root = Path(__file__).resolve().parents[2]
    return PolicyEngine(root / "Rules/Authorized/permissions.json",
                        root / "Rules/Non-Authorized/denied.json", authority)
