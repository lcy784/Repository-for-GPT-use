#!/usr/bin/env python3
"""Verify every imported source against the reviewed manifest."""

import hashlib
import json
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[1]
    manifest = json.loads((root / "docs/tiangong-import-manifest.json").read_text())
    rows = manifest["files"]
    assert len(rows) == manifest["source_file_count"] == manifest["imported_file_count"] == 16
    assert len({row["repository_path"].casefold() for row in rows}) == len(rows)
    assert sum(row["bytes"] for row in rows) == manifest["source_bytes"]
    for row in rows:
        path = root / row["repository_path"]
        assert path.resolve().is_relative_to(root / "docs/天宫HTML"), "Invalid import path"
        assert path.is_file() and not path.is_symlink(), "Missing or symbolic import"
        data = path.read_bytes()
        assert len(data) == row["bytes"], f"Size mismatch: {row['repository_path']}"
        assert hashlib.sha256(data).hexdigest() == row["sha256"], f"Hash mismatch: {row['repository_path']}"
    assert not (root / "docs/天宫HTML/AGENTS.md").exists(), "Archived instructions must stay inert"
    print(f"Verified {len(rows)} imported files, {manifest['source_bytes']} bytes; all SHA-256 values match.")


if __name__ == "__main__":
    main()
