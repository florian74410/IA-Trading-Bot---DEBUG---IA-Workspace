"""Static Skill catalog validator: discovery is not execution or grant."""
from __future__ import annotations

import json
from pathlib import Path
import re

NAME = re.compile(r"^[a-z][a-z0-9-]{1,63}$")
VERSION = re.compile(r"^\d+\.\d+(?:\.\d+)?$")


def inspect_skills(root: Path) -> list[dict]:
    items = []
    for folder in sorted(Path(root).iterdir()):
        if not folder.is_dir() or folder.is_symlink():
            continue
        manifest = folder / "manifest.json"
        required = folder / "permissions.required.json"
        instructions = folder / "SKILL.md"
        if not (manifest.is_file() and required.is_file() and instructions.is_file()):
            raise ValueError(f"Incomplete Skill: {folder.name}")
        info = json.loads(manifest.read_text(encoding="utf-8"))
        perms = json.loads(required.read_text(encoding="utf-8"))
        if (not isinstance(info, dict) or not NAME.fullmatch(info.get("name", ""))
            or not VERSION.fullmatch(info.get("version", ""))
            or not isinstance(info.get("actions"), list)
            or not isinstance(perms.get("required"), list)):
            raise ValueError(f"Invalid Skill manifest: {folder.name}")
        actions = info["actions"]
        if len(actions) != len(set(actions)) or any(
            not isinstance(a, str) or not a for a in actions
        ):
            raise ValueError(f"Invalid Skill actions: {folder.name}")
        for grant in perms["required"]:
            if not isinstance(grant, dict) or not all(
                isinstance(grant.get(k), str) and grant[k]
                for k in ("action", "resource")
            ):
                raise ValueError(f"Invalid Skill permissions: {folder.name}")
            if grant["action"] not in actions:
                raise ValueError(f"Undeclared Skill action: {folder.name}")
        items.append({"folder": folder.name, "name": info["name"],
                      "version": info["version"], "actions": actions,
                      "required": perms["required"],
                      "status": "CATALOG_ONLY"})
    return items
