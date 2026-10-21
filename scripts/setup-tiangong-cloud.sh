#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
tools_dir="${CLOUD_TOOLS_DIR:-$repo_root/.cloud-tools}"
bash "$repo_root/scripts/setup-cloud.sh"
echo "Tiangong source import is complete; preparing the locked cloud toolchain."

for tool in node npm; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing cloud tool: $tool" >&2; exit 2; }
done
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major !== 24 || minor < 19) throw new Error("Use Node.js 24.19 or newer in the 24.x line");'
npm --cache "$tools_dir/npm-cache" --prefix "$repo_root/tools/tiangong" ci --ignore-scripts --no-fund --no-audit
npm --prefix "$repo_root/tools/tiangong" run check
