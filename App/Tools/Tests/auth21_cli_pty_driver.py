"""Real terminal harness; only used with disposable fictional accounts."""
import json
import os
import pty
import select
import subprocess
import sys
import time

request = json.load(sys.stdin)
master, slave = pty.openpty()
uid = request['uid']
if os.getuid() == 0:
    os.fchown(slave, uid, uid)

def identity():
    if os.getuid() == 0:
        os.setgroups([])
        os.setgid(uid)
        os.setuid(uid)

process = subprocess.Popen(request['argv'], stdin=slave, stdout=slave,
                           stderr=slave, env=request['env'], preexec_fn=identity)
os.close(slave)
transcript = b''
position = 0
try:
    for prompt, answer in request['steps']:
        deadline = time.monotonic() + 12
        needle = prompt.encode('utf8')
        while needle not in transcript[position:]:
            if time.monotonic() > deadline:
                raise RuntimeError('CLI prompt timeout')
            if select.select([master], [], [], 0.1)[0]:
                transcript += os.read(master, 65536)
        position = len(transcript)
        os.write(master, answer.encode('utf8') + b'\r')
    deadline = time.monotonic() + 12
    while process.poll() is None:
        if time.monotonic() > deadline:
            raise RuntimeError('CLI exit timeout')
        if select.select([master], [], [], 0.1)[0]:
            try:
                transcript += os.read(master, 65536)
            except OSError:
                break
    process.wait(timeout=2)
    while select.select([master], [], [], 0)[0]:
        try:
            transcript += os.read(master, 65536)
        except OSError:
            break
    sys.stdout.write(json.dumps({'code': process.returncode,
                                'output': transcript.decode('utf8')}))
finally:
    if process.poll() is None:
        process.kill()
        process.wait()
    os.close(master)
