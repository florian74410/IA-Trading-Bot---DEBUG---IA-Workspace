"""Fail-closed mission pipeline, execution through an explicitly supplied adapter.

No SSH, network, deployment or code execution is available in this module.
A production adapter MUST separately enforce SHA, identity and environment.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Protocol

from mission import Phase
from mission_store import MissionStore


@dataclass(frozen=True)
class Check:
    passed: bool
    evidence: str


class Adapter(Protocol):
    def test(self, environment: str, mission_id: str) -> Check: ...
    def deploy(self, environment: str, mission_id: str, sha: str) -> Check: ...
    def health(self, environment: str, mission_id: str) -> Check: ...
    def rollback(self, environment: str, mission_id: str) -> Check: ...


class MissionPipeline:
    """Transitions between preapproved steps; never self-approves."""
    def __init__(self, store: MissionStore, adapter: Adapter):
        self.store = store
        self.adapter = adapter

    def _advance(self, mission: dict, phase: Phase, evidence: str) -> dict:
        if not evidence or len(evidence) > 500:
            raise ValueError("Evidence required and limited")
        return self.store.advance(mission["id"], phase, evidence, expected_revision=mission["revision"])

    def run_tests(self, mission_id: str) -> dict:
        m = self.store.get(mission_id)
        if m["phase"] != Phase.CODING.value:
            raise ValueError("Tests require coding phase")
        m = self._advance(m, Phase.TESTING, "test execution started")
        try:
            outcome = self.adapter.test(m["environment"], m["id"])
        except Exception:
            self._advance(m, Phase.FAILED, "test execution error")
            raise
        if outcome.passed:
            return self._advance(m, Phase.REVIEW, outcome.evidence)
        # Await a bounded correction request rather than retrying automatically.
        if m["attempts"] >= m["max_attempts"]:
            return self._advance(m, Phase.FAILED, outcome.evidence)
        return self.store.get(mission_id)

    def deploy_approved(self, mission_id: str) -> dict:
        m = self.store.get(mission_id)
        if m["phase"] != Phase.APPROVED.value or not m["approved_sha"]:
            raise PermissionError("External approval and pinned commit required")
        m = self._advance(m, Phase.DEPLOYING, "approved deployment requested")
        try:
            result = self.adapter.deploy(m["environment"], m["id"], m["approved_sha"])
        except Exception:
            # Actual deployment might have partially progressed: mark failed and require incident handling.
            self._advance(m, Phase.FAILED, "deploy executor exception; intervention required")
            raise
        if not result.passed:
            return self._rollback(m, "deploy failed: " + result.evidence[:450])
        m = self._advance(m, Phase.VERIFYING, result.evidence)
        try:
            health = self.adapter.health(m["environment"], m["id"])
        except Exception:
            health = Check(False, "health-check executor exception")
        if not health.passed:
            return self._rollback(m, "health failed: " + health.evidence[:450])
        return self._advance(m, Phase.SUCCEEDED, health.evidence)

    def _rollback(self, mission: dict, reason: str) -> dict:
        rollback = self.adapter.rollback(mission["environment"], mission["id"])
        if not rollback.passed:
            return self._advance(mission, Phase.FAILED, "ROLLBACK FAILED; incident response required")
        return self._advance(mission, Phase.ROLLED_BACK, reason[:500])
