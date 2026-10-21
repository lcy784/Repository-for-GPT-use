#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
# Root lockfile now includes Rapier; its WASM is embedded in the pinned compatibility package.
bash "$repo_root/scripts/setup-p01-cloud.sh"
