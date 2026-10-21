#!/usr/bin/env python3
"""Run the cloud credential scanner without printing secret values."""

import json
import os
from pathlib import Path
import subprocess
import sys


def main():
    root = Path(__file__).resolve().parents[1]
    tools_dir = Path(os.environ.get("CLOUD_TOOLS_DIR", root / ".cloud-tools"))
    if not tools_dir.is_absolute():
        tools_dir = (Path.cwd() / tools_dir).resolve()
    scanner = tools_dir / "bin" / "detect-secrets"
    if not scanner.is_file():
        print("Scanner missing. Run: bash scripts/setup-cloud.sh", file=sys.stderr)
        return 2
    paths = sys.argv[1:] or ["."]
    if any(not (root / path).exists() for path in paths):
        print("Scan target missing; no successful scan was recorded.", file=sys.stderr)
        return 2
    if any(not (root / path).resolve().is_relative_to(root) for path in paths):
        print("Scan targets must be inside this repository.", file=sys.stderr)
        return 2
    command = [
        str(scanner), "scan", "--all-files", "--no-verify", "--exclude-files",
        r"(^|/)(\.git|\.cloud-tools|node_modules|__pycache__)(/|$)",
        *paths,
    ]
    try:
        result = subprocess.run(command, cwd=root, capture_output=True, text=True)
    except OSError:
        print("Could not execute credential scanner.", file=sys.stderr)
        return 2
    if result.returncode:
        print("Credential scan failed; no scan output was published.", file=sys.stderr)
        return 2
    try:
        findings = json.loads(result.stdout)["results"]
    except (ValueError, KeyError, TypeError):
        print("Invalid scanner response.", file=sys.stderr)
        return 2
    total = sum(len(items) for items in findings.values())
    for filename, items in sorted(findings.items()):
        for item in items:
            print(f"{filename}:{item['line_number']}: {item['type']}")
    print(f"Credential scan: {total} potential finding(s). Manual privacy review required.")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
