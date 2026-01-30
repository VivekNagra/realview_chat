"""CLI to run the full RealView Chat pipeline on a folder of images."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

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
        type=Path, 
        help='Path to image folder (e.g. "/path/to/images")'
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

    # 3. Validate Input
    if not args.images_dir.exists() or not args.images_dir.is_dir():
        sys.exit(f"Error: image folder not found: {args.images_dir}")

    # 4. Run Pipeline
    try:
        print(f"Processing images in: {args.images_dir}...")
        result = process_property_from_folder(
            images_dir=args.images_dir,
            property_id=args.images_dir.name,  # Use folder name as ID
            client=client
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