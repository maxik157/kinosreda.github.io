#!/usr/bin/env python3
import argparse
import json
import os
import shutil
from pathlib import Path


PACK_RULES = [
    ("startup", lambda rel: False),
    ("models_gta3img", lambda rel: rel.startswith("vc-assets/local/models/gta3.img/")),
    ("audio", lambda rel: rel.startswith("vc-assets/local/audio/")),
    ("anim", lambda rel: rel.startswith("vc-assets/local/anim/")),
    ("models_misc", lambda rel: rel.startswith("vc-assets/local/models/")),
    ("data", lambda rel: rel.startswith("vc-assets/local/data/")),
    ("txd", lambda rel: rel.startswith("vc-assets/local/txd/")),
    ("text", lambda rel: rel.startswith("vc-assets/local/text/")),
    ("skins", lambda rel: rel.startswith("vc-assets/local/skins/")),
    ("fonts", lambda rel: rel.startswith("vc-assets/local/fonts/")),
    ("misc", lambda rel: True),
]


def normalize(path: str) -> str:
    return path.replace("\\", "/").lstrip("/")


def unique_preload_paths(preload_list: Path) -> list[str]:
    seen = set()
    result = []
    for raw_line in preload_list.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        matches = []
        start = 0
        token = "vc-assets/"
        while True:
            idx = line.find(token, start)
            if idx == -1:
                break
            next_idx = line.find(token, idx + len(token))
            if next_idx == -1:
                matches.append(line[idx:])
                break
            matches.append(line[idx:next_idx])
            start = next_idx
        if not matches:
            matches = [line]
        for match in matches:
            path = normalize(match)
            key = path.lower()
            if key in seen:
                continue
            seen.add(key)
            result.append(path)
    return result


def logical_path(root_dir: Path, file_path: Path) -> str:
    relative = file_path.relative_to(root_dir).as_posix()
    return f"vc-assets/local/{relative}"


def assign_pack(rel_path: str, startup_set: set[str]) -> str:
    if rel_path in startup_set:
        return "startup"
    for pack_name, matcher in PACK_RULES[1:]:
        if matcher(rel_path):
            return pack_name
    return "misc"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", required=True, help="Absolute path to vc-assets/local")
    parser.add_argument("--preload-list", required=True, help="Path to preload_files.list")
    parser.add_argument("--packs-dir", required=True, help="Absolute path to output data/packs dir")
    parser.add_argument("--manifest-out", required=True, help="Absolute path to engine/asset-packs.json")
    parser.add_argument("--chunk-size", type=int, default=1024 * 1024, help="Chunk size for client range cache")
    args = parser.parse_args()

    data_root = Path(args.data_root).resolve()
    preload_list = Path(args.preload_list).resolve()
    packs_dir = Path(args.packs_dir).resolve()
    manifest_out = Path(args.manifest_out).resolve()

    startup_paths = unique_preload_paths(preload_list)
    startup_set = set(startup_paths)

    files = []
    for path in sorted(data_root.rglob("*")):
        if not path.is_file():
            continue
        rel_path = logical_path(data_root, path)
        files.append((rel_path, path, path.stat().st_size))

    packs_dir.parent.mkdir(parents=True, exist_ok=True)
    if packs_dir.exists():
        shutil.rmtree(packs_dir)
    packs_dir.mkdir(parents=True, exist_ok=True)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)

    pack_handles: dict[str, object] = {}
    pack_sizes: dict[str, int] = {}
    file_index: dict[str, list] = {}

    try:
        for rel_path, path, size in files:
            pack_name = assign_pack(rel_path, startup_set)
            pack_filename = pack_name.replace("_", "-") + ".pack"
            pack_path = packs_dir / pack_filename
            if pack_name not in pack_handles:
                pack_handles[pack_name] = open(pack_path, "wb")
                pack_sizes[pack_name] = 0
            handle = pack_handles[pack_name]
            offset = pack_sizes[pack_name]
            with open(path, "rb") as source:
                shutil.copyfileobj(source, handle, length=1024 * 1024)
            pack_sizes[pack_name] += size
            file_index[rel_path] = [pack_name, offset, size]
    finally:
        for handle in pack_handles.values():
            handle.close()

    manifest = {
        "version": 2,
        "chunkSize": args.chunk_size,
        "packs": {
            pack_name: {
                "path": f"packs/{pack_name.replace('_', '-')}.pack",
                "size": pack_sizes[pack_name],
            }
            for pack_name in sorted(pack_sizes.keys())
        },
        "files": file_index,
    }
    manifest_out.write_text(json.dumps(manifest, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
