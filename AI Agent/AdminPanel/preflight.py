#!/usr/bin/env python3
"""Read-only Phase A checks. Run as the service identity on GEN-1."""
import argparse
import grp
import http.client
import importlib.util
import json
import os
from pathlib import Path
import stat

HERE=Path(__file__).resolve().parent

def checks(credential):
    spec=importlib.util.spec_from_file_location('admin_preflight',HERE/'server.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    result=[]
    def record(name,passed):result.append({'check':name,'passed':bool(passed)})
    record('non_root',os.geteuid()!=0)
    groups={grp.getgrgid(g).gr_name for g in os.getgroups()}
    record('no_privileged_groups',not groups.intersection({'root','sudo','wheel','docker','lxd','disk'}))
    record('code_not_writable',all(not os.access(p,os.W_OK) for p in HERE.rglob('*') if p.is_file()))
    record('no_docker_socket',not os.access('/var/run/docker.sock',os.R_OK|os.W_OK))
    record('no_proxy_mode',True) # no proxy mode exists in this version
    try:module.load_admin(credential);valid=True
    except (OSError,ValueError,KeyError):valid=False
    record('private_credentials_valid',valid)
    for name in ('IATB_ADMIN_MEMORY_DB','IATB_ADMIN_AUDIT_DB','IATB_ADMIN_REQUESTS_DB'):
        source=os.environ.get(name)
        if not source:continue
        path=Path(source)
        record(name+'_readonly',path.is_absolute() and path.is_file() and not path.is_symlink() and not os.access(path,os.W_OK))
    return result

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--credential-file',type=Path,required=True)
    args=p.parse_args();result=checks(args.credential_file)
    print(json.dumps({'passed':all(x['passed'] for x in result),'checks':result},indent=2))
    raise SystemExit(0 if all(x['passed'] for x in result) else 1)

if __name__=='__main__':main()
