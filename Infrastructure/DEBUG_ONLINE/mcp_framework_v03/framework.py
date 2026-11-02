"""IA-TB MCP v0.3: bounded, shell-free operations for isolated workspaces.

No privileged operations, production deploy or arbitrary command execution.
Intended to run under different non-root service identities per environment.
"""
from __future__ import annotations

import os
import re
import subprocess
import time
from pathlib import Path

MAX_OUTPUT = 64 * 1024
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$")


class Denied(ValueError):
    """Policy blocked an operation."""


def validated_root(root: str | Path) -> Path:
    p = Path(root).resolve(strict=True)
    if not p.is_dir() or p.is_symlink():
        raise Denied("Invalid workspace root")
    return p


def safe_path(root: Path, relative: str) -> Path:
    if not relative or relative.startswith("/") or "\x00" in relative:
        raise Denied("Relative path required")
    pieces = relative.split("/")
    if any(p in ("", ".", "..") for p in pieces):
        raise Denied("Invalid path component")
    current = root
    for piece in pieces:
        current = current / piece
        if current.is_symlink():
            raise Denied("Symlinks not permitted")
    resolved = current.resolve(strict=False)
    if not resolved.is_relative_to(root) or resolved == root:
        raise Denied("Outside workspace")
    return resolved


def _run(args: list[str], cwd: Path, timeout: int = 15) -> dict:
    if timeout < 1 or timeout > 60:
        raise Denied("Timeout out of range")
    try:
        proc = subprocess.run(
            args, cwd=str(cwd), stdin=subprocess.DEVNULL, capture_output=True,
            timeout=timeout, shell=False, check=False,
            env={
                "PATH": "/usr/bin:/bin",
                "HOME": os.environ.get("HOME", "/nonexistent"),
                "LANG": "C.UTF-8",
                "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_CONFIG_GLOBAL": "/dev/null",
                "GIT_TERMINAL_PROMPT": "0",
                "GIT_OPTIONAL_LOCKS": "0",
            },
        )
    except subprocess.TimeoutExpired:
        raise Denied("Command timeout") from None
    out = (proc.stdout + proc.stderr)[:MAX_OUTPUT]
    return {"exit_code": proc.returncode, "output": out.decode("utf-8", errors="replace"), "truncated": len(proc.stdout) + len(proc.stderr) > MAX_OUTPUT}


class WorkspaceOps:
    def __init__(self, root: str | Path, *, environment: str):
        if environment not in ("debug", "architecture"):
            raise Denied("Unknown environment")
        self.root = validated_root(root)
        self.environment = environment

    def status(self) -> dict:
        return {"environment": self.environment, "workspace": str(self.root), "ready": True}

    def list_files(self, limit: int = 100) -> list[str]:
        if not 1 <= limit <= 500:
            raise Denied("Invalid limit")
        paths = []
        for base, dirs, files in os.walk(self.root, followlinks=False):
            dirs[:] = sorted(d for d in dirs if d != ".git" and not (Path(base) / d).is_symlink())
            for name in sorted(files):
                p = Path(base) / name
                if not p.is_symlink():
                    paths.append(p.relative_to(self.root).as_posix())
                    if len(paths) >= limit:
                        return paths
        return paths

    def read_file(self, relative: str) -> str:
        p = safe_path(self.root, relative)
        if not p.is_file() or p.stat().st_size > 512 * 1024:
            raise Denied("File missing or too large")
        # Keep open descriptor within verified root; disallow symlinks at final component.
        fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            if os.fstat(fd).st_size > 512 * 1024:
                raise Denied("File too large")
            return os.read(fd, 512 * 1024 + 1).decode("utf-8")
        finally:
            os.close(fd)

    def git_status(self) -> dict:
        return _run(["git", "-c", "core.pager=cat", "status", "--short"], self.root)

    def git_diff(self) -> dict:
        return _run(["git", "-c", "core.pager=cat", "diff", "--no-ext-diff", "--", "."], self.root)

    def git_log(self, count: int = 10) -> dict:
        if type(count) is not int or not 1 <= count <= 30:
            raise Denied("Invalid commit count")
        return _run(["git", "-c", "core.pager=cat", "log", f"-{count}", "--format=%h %s"], self.root)

    def git_branch(self) -> dict:
        return _run(["git", "branch", "--list", "--no-color"], self.root)

    def git_commit(self, message: str) -> dict:
        # Deliberately no "git add -A": caller must stage specific files through reviewed workflow.
        if not 1 <= len(message) <= 160 or any(ord(c) < 32 for c in message):
            raise Denied("Invalid message")
        return _run(["git", "-c", "commit.gpgsign=false", "commit", "--only", "--allow-empty-message", "--dry-run"], self.root)

    def run_test(self, test_id: str) -> dict:
        # Only tests explicitly installed in this package, not scripts from the mutable workspace.
        if test_id != "python_compile":
            raise Denied("Unknown test")
        files = [str(p.relative_to(self.root)) for p in self.root.rglob("*.py")
                 if ".git" not in p.parts and not p.is_symlink()]
        if len(files) > 50:
            raise Denied("Too many Python files")
        # Python compiler via subprocess is restricted to syntax and cannot run user code.
        return _run(["python3", "-c", "import ast,sys,pathlib; [ast.parse(pathlib.Path(p).read_text(),filename=p) for p in sys.argv[1:]]", *files], self.root, timeout=25)

    def deployment_status(self) -> dict:
        # No deploy action is exposed in v0.3.
        return {"environment": self.environment, "deployment_enabled": False, "requires_admin_approval": True}


def custom_request(operation: str, justification: str) -> dict:
    """Record an unexecuted request; NEVER provide approval by MCP invocation."""
    if operation not in {"run_additional_test", "restart_isolated_service", "deploy_pinned_sha"}:
        raise Denied("Not an approved operation template")
    if not 10 <= len(justification) <= 500:
        raise Denied("Justification must be between 10 and 500 characters")
    return {"operation": operation, "justification": justification, "status": "NOT_SUBMITTED",
            "approval": "External MFA administration required; not implemented in this version",
            "executed": False}
