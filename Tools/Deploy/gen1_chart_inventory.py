#!/usr/bin/env python3
"""Read-only Docker inventory for review before the Chart Workspace rollout.
No container exec/start/stop, no compose changes, no environment or secrets output.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess

SAFE_ENV = {'IATB_RUNTIME_ROOT', 'IATB_DATA_ROOT', 'IATB_STATE_ROOT',
            'IATB_ANNEX_ROOT', 'IATB_UPDATES_ROOT', 'IATB_TRADING_LIVE',
            'IATB_TRADING_ENGINE_ENABLED', 'IATB_UI_PORT'}


def summarize(containers):
    rows = []
    for c in containers:
        cfg, host = c.get('Config', {}), c.get('HostConfig', {})
        labels = cfg.get('Labels') or {}
        project = labels.get('com.docker.compose.project', '')
        if not (project.startswith('iatb') or c.get('Name', '').lstrip('/').startswith('iatb')):
            continue
        env = {}
        for pair in cfg.get('Env') or []:
            key, sep, value = pair.partition('=')
            if sep and key in SAFE_ENV:
                env[key] = value
        mounts = [{k: m.get(k) for k in ('Type', 'Name', 'Source', 'Destination', 'RW')}
                  for m in c.get('Mounts', [])]
        socket = None
        runtime = env.get('IATB_RUNTIME_ROOT')
        if runtime:
            for m in mounts:
                dest = (m.get('Destination') or '').rstrip('/')
                if runtime == dest or runtime.startswith(dest + '/'):
                    socket = str(Path(m['Source']) / runtime[len(dest):].lstrip('/') / 'ssh-ui.sock')
        rows.append({
            'name': c.get('Name', '').lstrip('/'), 'id': c.get('Id'),
            'project': project, 'service': labels.get('com.docker.compose.service'),
            'running': c.get('State', {}).get('Running', False),
            'imageReference': cfg.get('Image'), 'immutableImageId': c.get('Image'),
            'user': cfg.get('User'), 'networkMode': host.get('NetworkMode'),
            'publishedPorts': host.get('PortBindings') or {}, 'mounts': mounts,
            'safeEnvironment': env, 'expectedHostSocket': socket,
            'composeFiles': labels.get('com.docker.compose.project.config_files'),
            'composeWorkingDirectory': labels.get('com.docker.compose.project.working_dir')})
    shared = []
    sources = {}
    for row in rows:
        for m in row['mounts']:
            if m.get('RW'):
                sources.setdefault(m.get('Source'), set()).add(row['project'])
    for source, projects in sources.items():
        if len(projects) > 1:
            shared.append({'source': source, 'projects': sorted(projects)})
    return {'schema': 'iatb.gen1.chart-inventory/1', 'readOnly': True,
            'containers': rows, 'writableMountsSharedAcrossProjects': shared,
            'warning': 'Select the DEBUG 2.1 project explicitly. Names/tags are not proof of deployed version.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixture', type=Path, help='Offline test only: docker inspect JSON')
    parser.add_argument('--output', type=Path, help='Optional private JSON report (mode 0600)')
    args = parser.parse_args()
    if args.fixture:
        containers = json.loads(args.fixture.read_text())
    else:
        ids = subprocess.check_output(['docker', 'ps', '-aq', '--no-trunc'], text=True).split()
        containers = json.loads(subprocess.check_output(['docker', 'inspect', *ids], text=True)) if ids else []
    result = json.dumps(summarize(containers), indent=2) + '\n'
    if args.output:
        # Refuse to overwrite any file/symlink with inventory output.
        fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as f:
            f.write(result)
    else:
        print(result, end='')


if __name__ == '__main__':
    main()
