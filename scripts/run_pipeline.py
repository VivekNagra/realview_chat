"""Run the Realview Chat pipeline from the CLI."""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

from realview_chat.config import load_config
from realview_chat.io.results_writer import write_jsonl
from realview_chat.openai_client.responses import OpenAIResponsesClient
from realview_chat.pipeline.property_processor import process_property_from_folder
from realview_chat.utils.logging import configure_logging
from realview_chat.utils.rate_limit import RateLimiter


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Realview Chat property pipeline.")
    parser.add_argument("images_dir", type=Path, help="Path to image folder")
    parser.add_argument("--out", type=Path, default=Path("out/results.jsonl"), help="Path to output JSONL file")
    parser.add_argument("--property-id", type=str, default="manual_property", help="Optional property id")
    parser.add_argument("--log-file", type=str, default=None, help="Optional log file path")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    configure_logging(log_file=args.log_file)
    logger = logging.getLogger("run_pipeline")

    config = load_config()
    rate_limiter = RateLimiter(config.requests_per_minute)
    client = OpenAIResponsesClient(
        api_key=config.openai_api_key,
        model=config.openai_model,
        rate_limiter=rate_limiter,
        max_retries=config.max_retries,
        retry_backoff_seconds=config.retry_backoff_seconds,
    )

    logger.info("Processing property %s from %s", args.property_id, args.images_dir)
    result = process_property_from_folder(args.images_dir, args.property_id, client)

    write_jsonl(args.out, [result])
    logger.info("Wrote 1 result to %s", args.out)

    print("\nRun complete.")
    print(f"Output file: {args.out.resolve()}")
    print("Output includes: property_id, created_at, images (pass1+pass2), rooms (pass2.5).")
    print("Next steps:")
    print("- Inspect the JSONL output and verify results.")
    print("- Replace the feature whitelist in src/realview_chat/openai_client/schemas.py if needed.")


if __name__ == "__main__":
    main()
