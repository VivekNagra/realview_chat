"""Property processing pipeline."""

from __future__ import annotations

import logging
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, TYPE_CHECKING

from realview_chat.io.image_loader import list_image_files, load_images_as_data_urls
from realview_chat.pipeline.pass1 import Pass1Result, run_pass1
from realview_chat.pipeline.pass2 import FeatureResult, run_pass2
from realview_chat.pipeline.pass25 import Pass25Result, run_pass25

if TYPE_CHECKING:
    # This assumes you have defined LLMClient Protocol in responses.py as discussed
    from realview_chat.openai_client.responses import LLMClient

logger = logging.getLogger(__name__)

ALLOWED_ROOMS = {"bathroom", "kitchen"}



def _chunk_images(items: list[tuple[Path, str]], chunk_size: int) -> Iterable[list[tuple[Path, str]]]:
    for i in range(0, len(items), chunk_size):
        yield items[i : i + chunk_size]


def _process_images(property_id: str, image_paths: list[Path], client: LLMClient) -> dict:
    if not image_paths:
        logger.warning("No images found for property %s", property_id)

    images_with_urls = load_images_as_data_urls(image_paths)

    pass1_results: dict[str, Pass1Result] = {}
    pass2_results: dict[str, list[FeatureResult]] = {}

    for path, data_url in images_with_urls:
        logger.info("Running pass1 for %s", path.name)
        # run_pass1 internally calls client.pass1()
        pass1 = run_pass1(client, data_url) # type: ignore
        pass1_results[path.name] = pass1

        # Filtrér uønskede rooms herinde i løkken)
        if not pass1.actionable or pass1.room_type not in ALLOWED_ROOMS:
            logger.info(
                "Skipping pass2 for %s (room_type=%s)", path.name, pass1.room_type
            )
            continue

        logger.info("Running pass2 for %s", path.name)
        # run_pass2 internally calls client.pass2()
        pass2 = run_pass2(client, data_url) # type: ignore
        pass2_results[path.name] = pass2

    room_groups: dict[str, list[tuple[Path, str]]] = {}
    for path, data_url in images_with_urls:
        pass1 = pass1_results.get(path.name)
        if not pass1 or not pass1.actionable:
            continue
        room_groups.setdefault(pass1.room_type, []).append((path, data_url))

    pass25_results: list[Pass25Result] = []
    for room_type, items in room_groups.items():
        if room_type not in ALLOWED_ROOMS:
            logger.info(
                "Skipping pass2.5 for room %s (not allowed)", room_type
            )
            continue
        if len(items) < 2:
            logger.info("Skipping pass2.5 for room %s due to insufficient images", room_type)
            continue
        for chunk in _chunk_images(items, 4):
            image_data_urls = [data_url for _, data_url in chunk]
            logger.info("Running pass2.5 for room %s with %d images", room_type, len(chunk))
            # run_pass25 internally calls client.pass25()
            pass25_results.append(run_pass25(client, room_type, image_data_urls)) # type: ignore

    return {
        "property_id": property_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "images": [
    {
        "filename": filename,
        "pass1": asdict(pass1),
        "pass2": [
            asdict(feature)
            for feature in pass2_results.get(filename, [])
        ],
    }
    for filename, pass1 in pass1_results.items()
    if pass1.room_type in ALLOWED_ROOMS
],

    }


def process_property_from_folder(
    images_dir: Path | str, property_id: str, client: LLMClient
) -> dict:
    """Run the pipeline for a property using images from a local folder."""
    folder_path = Path(images_dir)
    image_paths = list_image_files(folder_path)
    logger.info("Found %d images in %s", len(image_paths), folder_path)
    return _process_images(property_id, image_paths, client)


# Backwards compatibility alias
process_property = process_property_from_folder