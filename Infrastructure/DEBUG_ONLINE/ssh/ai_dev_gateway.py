#!/usr/bin/env python3
"""IA-TB AI development SSH gateway v1: sandboxed source-file exchange only.

The SSH key must have an authorized_keys forced command plus 'restrict'.
No shell, Docker, system administration, production or DEBUG runtime access.
"""
from __future__ import annotations

import os
from pathlib import Path
import shlex
import sys
import tempfile

HOME = Path("/var/lib/iatb-ai-dev")
WORK = HOME / "workspace"
READ_ROOTS = {"drafts", "patches", "reports"}
WRITE_ROOTS = {"drafts", "patches"}
SUFFIXES = {".js", ".json", ".md", ".py", ".ts", ".css", ".html", ".yaml", ".yml", ".sh", ".txt"}
MAX_BYTES = 128 * 1024

def fail(message: str) -> None:
    print("DENIED: " + message, file=sys.stderr)
    raise SystemExit(126)

def target(relative: str, *, write: bool = False) -> Path:
    if not isinstance(relative, str) or not relative or len(relative) > 240:
        fail("invalid relative path")
    candidate = Path(relative)
    segments = candidate.parts
    if (candidate.is_absolute() or len(segments) < 2 or
        segments[0] not in (WRITE_ROOTS if write else READ_ROOTS) or
        any(s in (".", "..") or s.startswith(".") or "\\" in s for s in segments)):
        fail("path is outside the isolated development workspace")
    if candidate.suffix.lower() not in SUFFIXES:
        fail("file type is not allowed")
    current = WORK
    for segment in segments:
        current = current / segment
        if current.is_symlink():
            fail("symlink is forbidden")
    if not current.resolve(strict=False).is_relative_to(WORK.resolve(strict=True)):
        fail("path escapes workspace")
    return current

def listing() -> None:
    for bucket in sorted(READ_ROOTS):
        folder = WORK / bucket
        if folder.is_symlink() or not folder.is_dir():
            fail("workspace directory missing or unsafe")
        names = [p for p in folder.rglob("*") if p.is_file() and not p.is_symlink()
                 and not any(part.startswith(".") for part in p.relative_to(WORK).parts)]
        for item in sorted(names)[:200]:
            print(item.relative_to(WORK).as_posix())

def read_file(relative: str) -> None:
    path = target(relative)
    if not path.is_file() or path.stat().st_size > MAX_BYTES:
        fail("not a regular small file")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        value = os.read(fd, MAX_BYTES + 1)
        if len(value) > MAX_BYTES:
            fail("file too large")
        sys.stdout.buffer.write(value)
    finally:
        os.close(fd)

def write_file(relative: str) -> None:
    path = target(relative, write=True)
    body = sys.stdin.buffer.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        fail("write too large")
    try:
        body.decode("utf-8")
    except UnicodeError:
        fail("only UTF-8 source text is accepted")
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    target(relative, write=True)
    if path.exists() and (not path.is_file() or path.is_symlink()):
        fail("unsafe destination")
    descriptor, name = tempfile.mkstemp(prefix=".iatb-write-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(body)
        os.chmod(name, 0o600)
        os.replace(name, path)
        print("WRITE_OK " + relative)
    finally:
        try:
            os.unlink(name)
        except FileNotFoundError:
            pass

def main() -> None:
    if not WORK.is_dir() or WORK.is_symlink():
        fail("isolated workspace missing")
    original = os.environ.get("SSH_ORIGINAL_COMMAND", "")
    if len(original) > 300:
        fail("invalid command")
    try:
        args = shlex.split(original)
    except ValueError:
        fail("invalid command")
    if args == ["ping"]:
        print("IATB_AI_DEV_OK")
    elif args == ["list"]:
        listing()
    elif len(args) == 2 and args[0] == "read":
        read_file(args[1])
    elif len(args) == 2 and args[0] == "write":
        write_file(args[1])
    else:
        fail("allowed commands: ping, list, read RELPATH, write RELPATH")

if __name__ == "__main__":
    main()
