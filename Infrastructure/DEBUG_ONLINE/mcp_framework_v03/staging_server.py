"""Local-only staging adapter for IA-TB MCP v0.3.

This does NOT replace the currently running DEBUG/Architecture servers.
No HTTP authentication is configured: binding beyond loopback is prohibited.
"""
import os
from mcp.server.mcpserver import MCPServer
from framework import WorkspaceOps, custom_request

ENV = os.environ.get("IATB_MCP_ENV")
if ENV not in ("debug", "architecture"):
    raise RuntimeError("Set IATB_MCP_ENV to debug or architecture")
if os.environ.get("IATB_MCP_STAGING") != "1":
    raise RuntimeError("Staging flag required")
workspace = os.environ.get("IATB_MCP_WORKSPACE", "")
if not workspace:
    raise RuntimeError("Explicit isolated workspace path required")

ops = WorkspaceOps(workspace, environment=ENV)
mcp = MCPServer(f"IA-TB {ENV} Staging v0.3")

if ENV == "debug":
    @mcp.tool()
    def iatb_status() -> dict:
        return ops.status()

    @mcp.tool()
    def iatb_list_files(path: str = ".", limit: int = 100) -> list[dict]:
        if path != ".":
            raise ValueError("Staging v0.3 supports root listing only")
        return [{"path": p} for p in ops.list_files(limit)]

    @mcp.tool()
    def iatb_read_file(path: str) -> str:
        return ops.read_file(path)

    @mcp.tool()
    def iatb_write_file(path: str, content: str) -> str:
        return str(ops.write_file(path, content))

    @mcp.tool()
    def iatb_git_status() -> str:
        return str(ops.git_status())

    @mcp.tool()
    def iatb_git_diff(path: str = "") -> str:
        if path:
            raise ValueError("Path-specific diffs not implemented in staging")
        return str(ops.git_diff())

    @mcp.tool()
    def iatb_git_log(count: int = 10) -> dict:
        return ops.git_log(count)

    @mcp.tool()
    def iatb_run_test(test_id: str) -> dict:
        return ops.run_test(test_id)

    @mcp.tool()
    def iatb_custom_request(operation: str, justification: str) -> dict:
        return custom_request(operation, justification)

else:
    @mcp.tool()
    def architecture_list_files() -> list[str]:
        return ops.list_files(500)

    @mcp.tool()
    def architecture_read_file(path: str) -> str:
        return ops.read_file(path)

    @mcp.tool()
    def architecture_write_file(path: str, content: str) -> str:
        return str(ops.write_file(path, content))

    @mcp.tool()
    def architecture_git_status() -> dict:
        return ops.git_status()

    @mcp.tool()
    def architecture_git_log(count: int = 10) -> dict:
        return ops.git_log(count)

    @mcp.tool()
    def architecture_run_test(test_id: str) -> dict:
        return ops.run_test(test_id)

    @mcp.tool()
    def architecture_custom_request(operation: str, justification: str) -> dict:
        return custom_request(operation, justification)


if __name__ == "__main__":
    port = 8801 if ENV == "debug" else 8811
    mcp.run(transport="streamable-http", host="127.0.0.1", port=port)
