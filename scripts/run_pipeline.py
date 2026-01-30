"""CLI to run the full RealView Chat pipeline on a folder of images."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

# Centralized cases storage: each property has a folder case_<property_id>
CASES_ROOT = Path("/Users/vivek/Desktop/RealView/cases")

# Ensure the src directory is in the python path if running from root
sys.path.append(str(Path(__file__).parents[1] / "src"))

from realview_chat.config import load_config
from realview_chat.openai_client.responses import create_client
from realview_chat.pipeline.property_processor import process_property_from_folder
from realview_chat.utils.logging import configure_logging

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run full property pipeline.")
    parser.add_argument(
        "images_dir",
        type=str,
        help='Path to image folder, or property_id to use CASES_ROOT/case_<id>/ (e.g. "/path/to/images" or "2203177" or "case_2203177")',
    )
    parser.add_argument(
        "--out", 
        type=Path, 
        default=Path("out/results.json"), 
        help="Path to output JSON file (default: out/results.json)"
    )
    parser.add_argument(
        "--debug", 
        action="store_true", 
        help="Enable debug logging"
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    
    # 1. Setup Logging
    log_level = logging.DEBUG if args.debug else logging.INFO
    configure_logging(level=log_level)
    
    # 2. Load Config & Initialize Client
    # This checks LLM_PROVIDER field in .env to decide between OpenAI and Google
    try:
        config = load_config()
        client = create_client(config)
        print(f"Initialized client with provider: {config.llm_provider}")
    except ValueError as e:
        sys.exit(f"Configuration Error: {e}")

    # 3. Resolve images_dir: full path or property_id -> CASES_ROOT/case_<id>/
    images_dir_arg = args.images_dir.strip()
    if "/" in images_dir_arg or "\\" in images_dir_arg:
        # Treat as path
        images_dir = Path(images_dir_arg).resolve()
    else:
        # Treat as property_id: resolve to CASES_ROOT/case_<id>/
        id_part = images_dir_arg if images_dir_arg.startswith("case_") else f"case_{images_dir_arg}"
        images_dir = (CASES_ROOT / id_part).resolve()

    if not images_dir.exists() or not images_dir.is_dir():
        sys.exit(f"Error: image folder not found: {images_dir}")

    # Use folder name as property_id so web app can load images from case_<property_id>
    property_id = images_dir.name

    # 4. Run Pipeline
    try:
        print(f"Processing images in: {images_dir}...")
        result = process_property_from_folder(
            images_dir=images_dir,
            property_id=property_id,
            client=client,
        )
    except Exception as e:
        logging.exception("Pipeline failed")
        sys.exit(1)

    # 5. Write Output
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(result, ensure_ascii=False, indent=2), 
        encoding="utf-8"
    )

    print("Run complete.")
    print(f"Output written to: {args.out.resolve()}")


if __name__ == "__main__":
    main()