#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export CLOUD_TOOLS_DIR="${CLOUD_TOOLS_DIR:-$repo_root/.cloud-tools/python}"
bash "$repo_root/scripts/setup-tiangong-cloud.sh"
npm --cache "$CLOUD_TOOLS_DIR/npm-cache" --prefix "$repo_root" ci --ignore-scripts --no-fund --no-audit
python3 "$repo_root/scripts/setup-p01-system.py"
npm --prefix "$repo_root" run build
