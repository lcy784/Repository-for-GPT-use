#!/usr/bin/env python3
"""Install checksum-locked Xvfb packages inside the cloud workspace, without root."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import urllib.request

root = Path(__file__).resolve().parents[1]
if shutil.which('Xvfb'):
    print('System Xvfb is available.')
else:
    destination = root / '.cloud-tools/xvfb'
    cache = root / '.cloud-tools/system-packages'
    cache.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((root / 'tools/system-packages.json').read_text())
    for package in manifest['packages']:
        filename = cache / Path(package['Filename']).name
        if not filename.exists() or hashlib.sha256(filename.read_bytes()).hexdigest() != package['SHA256']:
            with urllib.request.urlopen('https://deb.debian.org/debian/' + package['Filename'], timeout=60) as response:
                content = response.read()
            if hashlib.sha256(content).hexdigest() != package['SHA256']:
                raise RuntimeError('Cloud system-package checksum mismatch')
            filename.write_bytes(content)
        subprocess.run(['dpkg-deb', '--extract', str(filename), str(destination)], check=True)
    print('Checksum-locked Xvfb installed inside .cloud-tools/xvfb.')
