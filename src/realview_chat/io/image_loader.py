"""Utilities for loading local image files."""

from __future__ import annotations

import base64
from pathlib import Path
from typing import Iterable

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def list_image_files(folder: Path) -> list[Path]:
    if not folder.exists():
        raise FileNotFoundError(f"Image folder not found: {folder}")
    if not folder.is_dir():
        raise NotADirectoryError(f"Expected directory for images: {folder}")

    images = [
        path
        for path in folder.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    ]
    return sorted(images)


def encode_image_to_data_url(path: Path) -> str:
    mime = "image/jpeg"
    if path.suffix.lower() == ".png":
        mime = "image/png"
    elif path.suffix.lower() == ".webp":
        mime = "image/webp"

    encoded = base64.b64encode(path.read_bytes()).decode("utf-8")
    return f"data:{mime};base64,{encoded}"


def load_images_as_data_urls(images: Iterable[Path]) -> list[tuple[Path, str]]:
    return [(path, encode_image_to_data_url(path)) for path in images]
