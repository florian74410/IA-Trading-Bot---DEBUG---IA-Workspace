"""IA-TB mission control v0.3: deterministic state machine, no execution.

Provides safe bookkeeping for a future persistent worker. Cannot deploy or
approve operations. Every transition is auditable by the external host.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from uuid import uuid4


class Phase(str, Enum):
    CREATED = "created"
    CODING = "coding"
    TESTING = "testing"
    REVIEW = "review"
    APPROVED = "approved"
    DEPLOYING = "deploying"
    VERIFYING = "verifying"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


TRANSITIONS: dict[Phase, set[Phase]] = {
    Phase.CREATED: {Phase.CODING, Phase.FAILED},
    Phase.CODING: {Phase.TESTING, Phase.FAILED},
    Phase.TESTING: {Phase.CODING, Phase.REVIEW, Phase.FAILED},
    Phase.REVIEW: {Phase.APPROVED, Phase.CODING, Phase.FAILED},
    Phase.APPROVED: {Phase.DEPLOYING, Phase.FAILED},
    Phase.DEPLOYING: {Phase.VERIFYING, Phase.ROLLED_BACK, Phase.FAILED},
    Phase.VERIFYING: {Phase.SUCCEEDED, Phase.ROLLED_BACK, Phase.FAILED},
    Phase.ROLLED_BACK: {Phase.CODING, Phase.FAILED},
    Phase.SUCCEEDED: set(),
    Phase.FAILED: set(),
}


@dataclass
class Mission:
    environment: str
    description: str
    max_attempts: int = 3
    mission_id: str = field(default_factory=lambda: uuid4().hex)
    phase: Phase = Phase.CREATED
    attempts: int = 0
    approved_sha: str | None = None
    events: list[dict] = field(default_factory=list)

    def __post_init__(self):
        if self.environment not in ("debug", "architecture"):
            raise ValueError("Only isolated environments")
        if not 10 <= len(self.description) <= 2000:
            raise ValueError("Invalid description")
        if not 1 <= self.max_attempts <= 3:
            raise ValueError("Invalid retry budget")
        self.events.append({"from": None, "to": self.phase.value, "reason": "created"})

    def transition(self, target: Phase, *, reason: str, approved_sha: str | None = None):
        if target not in TRANSITIONS[self.phase]:
            raise ValueError(f"Forbidden transition {self.phase.value} -> {target.value}")
        if not reason or len(reason) > 500:
            raise ValueError("Reason required")
        if target == Phase.CODING:
            if self.attempts >= self.max_attempts:
                raise ValueError("Retry budget exhausted")
            self.attempts += 1
        if target == Phase.APPROVED:
            # Approval MUST be asserted by external verifier after human authentication.
            # State machine does not grant authority to deploy on its own.
            if not approved_sha or len(approved_sha) != 40 or any(c not in "0123456789abcdef" for c in approved_sha):
                raise ValueError("Externally approved full SHA required")
            self.approved_sha = approved_sha
        if target == Phase.DEPLOYING and not self.approved_sha:
            raise ValueError("Not approved")
        before = self.phase
        self.phase = target
        self.events.append({"from": before.value, "to": target.value, "reason": reason,
                            "approved_sha": self.approved_sha if target in (Phase.APPROVED, Phase.DEPLOYING) else None})
        return self.phase.value
