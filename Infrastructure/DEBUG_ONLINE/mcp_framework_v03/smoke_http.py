"""MCP over HTTP local smoke test; no production services contacted."""
from __future__ import annotations
import asyncio
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client


async def wait_and_test(port: int, expected_tool: str):
    error = None
    for i in range(30):
        try:
            async with streamable_http_client(f"http://127.0.0.1:{port}/mcp") as (reader, writer):
                async with ClientSession(reader, writer) as session:
                    await session.initialize()
                    result = await session.list_tools()
                    names = {t.name for t in result.tools}
                    assert expected_tool in names, names
                    assert all("sudo" not in n and "shell" not in n for n in names)
                    result = await session.call_tool(expected_tool, {})
                    assert not result.is_error, result
                    return
        except Exception as e:
            error = e
            await asyncio.sleep(0.2)
    raise RuntimeError(f"Staging MCP failed to start: {error}")


def main():
    for env, port, tool in [
        ("debug", 8801, "iatb_status"),
        ("architecture", 8811, "architecture_list_files"),
    ]:
        with tempfile.TemporaryDirectory() as root:
            (Path(root) / "example.txt").write_text("hello", encoding="utf-8")
            variables = {**os.environ, "IATB_MCP_ENV": env, "IATB_MCP_STAGING": "1",
                         "IATB_MCP_WORKSPACE": root}
            proc = subprocess.Popen([sys.executable, "staging_server.py"], env=variables,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            try:
                asyncio.run(wait_and_test(port, tool))
            finally:
                proc.terminate()
                try:
                    proc.communicate(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.communicate()
    print("MCP_STAGING_SMOKE_OK")


if __name__ == "__main__":
    main()
