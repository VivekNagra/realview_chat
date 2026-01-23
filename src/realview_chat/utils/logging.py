"""Logging helpers."""

from __future__ import annotations

import logging
from typing import Optional


def configure_logging(level: int = logging.INFO, log_file: Optional[str] = None) -> None:
    handlers: list[logging.Handler] = [logging.StreamHandler()]
    if log_file:
        handlers.append(logging.FileHandler(log_file))

    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        handlers=handlers,
    )
