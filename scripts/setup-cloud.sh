#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
tools_dir="${CLOUD_TOOLS_DIR:-$repo_root/.cloud-tools}"

for tool in python3 git; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing required cloud tool: $tool" >&2
    exit 2
  fi
done

if [[ ! -e "$tools_dir" ]]; then
  python3 -m venv "$tools_dir"
elif [[ ! -f "$tools_dir/pyvenv.cfg" || ! -x "$tools_dir/bin/python" ]]; then
  echo "Refusing to reuse a directory that is not a Python virtual environment." >&2
  exit 2
fi

"$tools_dir/bin/python" -m pip install -r "$repo_root/tools/cloud-requirements.txt"
"$tools_dir/bin/detect-secrets" --version
echo "Cloud credential scanner is ready. Project dependencies await source import."
