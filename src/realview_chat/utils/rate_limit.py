"""Simple rate limiting utilities."""

from __future__ import annotations

import threading
import time


class RateLimiter:
    def __init__(self, requests_per_minute: int) -> None:
        if requests_per_minute <= 0:
            raise ValueError("requests_per_minute must be positive")
        self._min_interval = 60.0 / requests_per_minute
        self._lock = threading.Lock()
        self._last_time = 0.0

    def wait(self) -> None:
        with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_time
            sleep_time = self._min_interval - elapsed
            if sleep_time > 0:
                time.sleep(sleep_time)
            self._last_time = time.monotonic()
