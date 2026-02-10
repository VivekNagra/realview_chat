"""CLI to run the full RealView Chat pipeline on a folder of images."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

# Centralized cases storage: each property has a folder case_<property_id>
CASES_ROOT = Path("C:/Users/ermin/OneDrive/Skrivebord/RealView/cases") # Lave det om til miljøvariabel senere?
PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = PROJECT_ROOT / "out"

# Ensure the src directory is in the python path if running from root
sys.path.append(str(PROJECT_ROOT / "src"))

from realview_chat.config import load_config
from realview_chat.openai_client.responses import create_client
from realview_chat.pipeline.property_processor import process_property_from_folder
from realview_chat.utils.logging import configure_logging

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run full property pipeline.")
    parser.add_argument(
        "images_dir",
        type=str,
        nargs="?",
        default=None,
        help='Optional: path to image folder or property_id. If omitted, scan CASES_ROOT for case_* folders and process any without results.',
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging",
    )
    return parser.parse_args()


def process_one(client, images_dir: Path, property_id: str, target_out: Path) -> bool:
    """Run pipeline for one property; write target_out. Returns True on success."""
    try:
        print(f"Processing images in: {images_dir}...")
        result = process_property_from_folder(
            images_dir=images_dir,
            property_id=property_id,
            client=client,
        )
    except Exception as e:
        logging.exception("Pipeline failed")
        return False
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    target_out.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return True


def run_scan_mode(client) -> None:
    """Scan CASES_ROOT for case_* folders; process any that don't have results_*.json yet."""
    if not CASES_ROOT.exists() or not CASES_ROOT.is_dir():
        sys.exit(f"Error: CASES_ROOT not found: {CASES_ROOT}")

    case_folders = sorted(p for p in CASES_ROOT.iterdir() if p.is_dir() and p.name.startswith("case_"))
    total = len(case_folders)
    to_process = []
    skipped = []
    for path in case_folders:
        property_id = path.name.replace("case_", "", 1)
        target_out = OUT_DIR / f"results_{property_id}.json"
        if not target_out.exists():
            to_process.append((path, property_id, target_out))
        else:
            skipped.append(property_id)

    need_count = len(to_process)
    print(f"Found {total} total cases, {need_count} need processing.")
    for property_id in skipped:
        print(f"Already processed: {property_id}")

    processed = 0
    for images_dir, property_id, target_out in to_process:
        if process_one(client, images_dir, property_id, target_out):
            processed += 1
            print(f"Output written to: {target_out.resolve()}")

    print(f"Successfully processed {processed} new cases.")


def run_single_mode(client, images_dir_arg: str) -> None:
    """Process a single folder: by path or by property_id (resolved to CASES_ROOT/case_<id>/)."""
    images_dir_arg = images_dir_arg.strip()
    if "/" in images_dir_arg or "\\" in images_dir_arg:
        images_dir = Path(images_dir_arg).resolve()
    else:
        id_part = images_dir_arg if images_dir_arg.startswith("case_") else f"case_{images_dir_arg}"
        images_dir = (CASES_ROOT / id_part).resolve()

    if not images_dir.exists() or not images_dir.is_dir():
        sys.exit(f"Error: image folder not found: {images_dir}")

    property_id = images_dir.name.replace("case_", "", 1)
    target_out = OUT_DIR / f"results_{property_id}.json"

    if target_out.exists():
        print(f"Results already exist for {property_id}. Skipping...")
        return

    if not process_one(client, images_dir, property_id, target_out):
        sys.exit(1)
    print("Run complete.")
    print(f"Output written to: {target_out.resolve()}")


def main() -> None:
    args = parse_args()

    log_level = logging.DEBUG if args.debug else logging.INFO
    configure_logging(level=log_level)

    try:
        config = load_config()
        client = create_client(config)
        print(f"Initialized client with provider: {config.llm_provider}")
    except ValueError as e:
        sys.exit(f"Configuration Error: {e}")

    if args.images_dir is None:
        run_scan_mode(client)
    else:
        run_single_mode(client, args.images_dir)


if __name__ == "__main__":
    main()