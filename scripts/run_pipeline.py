"""Minimal CLI to run Pass 1 gating on a folder of images."""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from pathlib import Path
from typing import Iterable, List, Tuple

from openai import OpenAI

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional dependency
    load_dotenv = None  # type: ignore

from openai_pass1 import run_pass1

SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def _load_env() -> None:
    if load_dotenv:
        load_dotenv()


def _require_api_key() -> str:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        sys.exit("Error: OPENAI_API_KEY is not set. Add it to your environment or a .env file.")
    return api_key


def _find_images(folder: Path) -> List[Path]:
    images: List[Path] = []
    for path in folder.rglob("*"):
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTS:
            images.append(path)
    return sorted(images)


def _encode_image_to_data_url(path: Path) -> str:
    mime = "image/jpeg"
    if path.suffix.lower() == ".png":
        mime = "image/png"
    elif path.suffix.lower() == ".webp":
        mime = "image/webp"

    encoded = base64.b64encode(path.read_bytes()).decode("utf-8")
    return f"data:{mime};base64,{encoded}"


def _load_images_as_data_urls(images: Iterable[Path]) -> List[Tuple[Path, str]]:
    return [(path, _encode_image_to_data_url(path)) for path in images]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Pass 1 gating on a folder of images.")
    parser.add_argument("images_dir", type=Path, help='Path to image folder (e.g. "/path/to/images")')
    parser.add_argument(
        "--out", type=Path, default=Path("out/results.json"), help="Path to output JSON file (default: out/results.json)"
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    images_dir: Path = args.images_dir

    _load_env()
    api_key = _require_api_key()

    if not images_dir.exists() or not images_dir.is_dir():
        sys.exit(f"Error: image folder not found or not a directory: {images_dir}")

    image_paths = _find_images(images_dir)
    if not image_paths:
        sys.exit(f"Error: no images found under {images_dir} (supported: {', '.join(sorted(SUPPORTED_EXTS))})")

    client = OpenAI(api_key=api_key)

    results: list[dict] = []
    actionable_count = 0

    for path, data_url in _load_images_as_data_urls(image_paths):
        result = run_pass1(client, data_url)
        results.append(
            {
                "file": str(path.relative_to(images_dir)),
                "room_type": result["room_type"],
                "actionable": bool(result["actionable"]),
                "confidence": float(result["confidence"]),
            }
        )
        if result.get("actionable"):
            actionable_count += 1

    output = {
        "input_folder": str(images_dir.resolve()),
        "images_total": len(results),
        "results": results,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")

    print("Run complete.")
    print(f"Images found: {len(results)}")
    print(f"Actionable: {actionable_count}")
    print(f"Output: {args.out.resolve()}")


if __name__ == "__main__":
    main()
