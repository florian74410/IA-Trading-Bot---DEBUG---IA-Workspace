#!/usr/bin/env python3
"""Fail closed static checks for the new DEBUG Docker configuration."""
import pathlib
import sys

r=pathlib.Path(__file__).resolve().parents[2]
c=(r/"Infrastructure/DEBUG_ONLINE/compose.yml").read_text()
s=(r/"App/Tools/debug_online_start.sh").read_text()
i=(r/"Infrastructure/DEBUG_ONLINE/install_debug_online.py").read_text()
f=(r/"App/Tools/debug_online_forward.js").read_text()

def need(ok,msg):
    if not ok: raise RuntimeError(msg)

need('127.0.0.1:18000:18000' in c,"Host ingress must be loopback")
need('name: iatb-debug-online' in c, "Unique Docker project required")
need('IATB_AUTH_MODE: authenticated' in c, "Auth21 required")
need('IATB_TRADING_LIVE: "0"' in c, "Trading safety flag required")
need('IATB_DEBUG_BOOTSTRAP: "0"' in c, "No unauthenticated debug bootstrap")
need('IATB_DATA_ROOT: /debug-private/data' in c,"Dedicated data path required")
need('/srv/iatb-debug/online/private:/debug-private' in c,"Dedicated host data required")
need('cap_drop: [ALL]' in c,"Drop capabilities")
need('no-new-privileges:true' in c,"No privilege escalation")
need('IATB_DEPLOYMENT_MODE: AUTHENTICATED' in c,"Authenticated deployment mode")
active_yaml='\n'.join(line.partition('#')[0] for line in c.splitlines())
need('/var/run/docker.sock' not in active_yaml and '/var/lib/iatb' not in active_yaml,"Forbidden production bind")
need('IATB_TRADING_LIVE' in s and '== "0"' in s, "Trading safety enforcement")
need("server.listen(18000,'0.0.0.0'" in f,"Internal TLS stream edge missing")
need("check_dns()" in i and "verify_ci(sha)" in i and "init_admin()" in i,
     "Preflight verification missing")
need("if not has_admin()" in i, "ADMIN gate required")
need("wait_private_health()" in i,"Auth21 health gate required")
print("PASS: DEBUG online configuration safety checks")
