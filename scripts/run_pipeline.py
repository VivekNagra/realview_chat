"""Run the Realview Chat pipeline from the CLI."""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

from realview_chat.config import load_config
from realview_chat.io.csv_reader import read_property_ids
from realview_chat.io.results_writer import write_jsonl
from realview_chat.openai_client.responses import OpenAIResponsesClient
from realview_chat.pipeline.property_processor import process_property
from realview_chat.utils.logging import configure_logging
from realview_chat.utils.rate_limit import RateLimiter


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Realview Chat property pipeline.")
    parser.add_argument("--csv", required=True, type=Path, help="Path to input CSV")
    parser.add_argument("--out", required=True, type=Path, help="Path to output JSONL file")
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

    results = []
    for property_id in read_property_ids(args.csv):
        logger.info("Processing property %s", property_id)
        results.append(process_property(property_id, client))

    write_jsonl(args.out, results)
    logger.info("Wrote %d results to %s", len(results), args.out)


if __name__ == "__main__":
    main()
