"""Property processing pipeline."""

from __future__ import annotations

import logging
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from realview_chat.io.image_loader import list_image_files, load_images_as_data_urls
from realview_chat.pipeline.pass1 import Pass1Result, run_pass1
from realview_chat.pipeline.pass2 import FeatureResult, run_pass2
from realview_chat.pipeline.pass25 import Pass25Result, run_pass25
from realview_chat.openai_client.responses import OpenAIResponsesClient

logger = logging.getLogger(__name__)


def fetch_images_folder_for_property(property_id: str) -> str:
    """Fetch or download images for a property.

    TODO: Replace this stub with your implementation that returns a local folder path.
    """

    raise NotImplementedError(
        "Implement fetch_images_folder_for_property(property_id) to return a local folder path."
    )


def _chunk_images(items: list[tuple[Path, str]], chunk_size: int) -> Iterable[list[tuple[Path, str]]]:
    for i in range(0, len(items), chunk_size):
        yield items[i : i + chunk_size]


def process_property_from_folder(
    folder_path: Path,
    property_id: str,
    client: OpenAIResponsesClient,
) -> dict:
    image_paths = list_image_files(folder_path)
    if not image_paths:
        logger.warning("No images found for property %s", property_id)

    images_with_urls = load_images_as_data_urls(image_paths)

    pass1_results: dict[str, Pass1Result] = {}
    pass2_results: dict[str, list[FeatureResult]] = {}

    for path, data_url in images_with_urls:
        logger.info("Running pass1 for %s", path.name)
        pass1 = run_pass1(client, data_url)
        pass1_results[path.name] = pass1

        logger.info("Running pass2 for %s", path.name)
        pass2 = run_pass2(client, data_url)
        pass2_results[path.name] = pass2

    room_groups: dict[str, list[tuple[Path, str]]] = {}
    for path, data_url in images_with_urls:
        pass1 = pass1_results.get(path.name)
        if not pass1 or not pass1.actionable:
            continue
        room_groups.setdefault(pass1.room_type, []).append((path, data_url))

    pass25_results: list[Pass25Result] = []
    for room_type, items in room_groups.items():
        if len(items) < 2:
            logger.info("Skipping pass2.5 for room %s due to insufficient images", room_type)
            continue
        for chunk in _chunk_images(items, 4):
            image_data_urls = [data_url for _, data_url in chunk]
            logger.info("Running pass2.5 for room %s with %d images", room_type, len(chunk))
            pass25_results.append(run_pass25(client, room_type, image_data_urls))

    return {
        "property_id": property_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "images": [
            {
                "filename": filename,
                "pass1": asdict(pass1_results[filename]),
                "pass2": [asdict(feature) for feature in pass2_results[filename]],
            }
            for filename in pass1_results
        ],
        "rooms": [asdict(result) for result in pass25_results],
    }


def process_property(property_id: str, client: OpenAIResponsesClient) -> dict:
    folder_path = Path(fetch_images_folder_for_property(property_id))
    return process_property_from_folder(folder_path, property_id, client)
