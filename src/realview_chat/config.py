"""Configuration loading for Realview Chat."""

from __future__ import annotations

import os
from dataclasses import dataclass
from dotenv import load_dotenv

@dataclass(frozen=True)
class AppConfig:
    llm_provider: str
    openai_api_key: str | None
    google_api_key: str | None
    openai_model: str
    google_model: str
    requests_per_minute: int
    max_retries: int
    retry_backoff_seconds: float


def load_config() -> AppConfig:
    load_dotenv()
    
    # Determine provider (default to openai if not set)
    provider = os.getenv("LLM_PROVIDER", "openai").lower()
    
    # Validation: Ensure the active provider has an API key
    if provider == "google":
        if not os.getenv("GOOGLE_API_KEY"):
            raise ValueError("LLM_PROVIDER is 'google' but GOOGLE_API_KEY is missing.")
    elif provider == "openai":
        if not os.getenv("OPENAI_API_KEY"):
            raise ValueError("LLM_PROVIDER is 'openai' but OPENAI_API_KEY is missing.")

    return AppConfig(
        llm_provider=provider,
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        google_api_key=os.getenv("GOOGLE_API_KEY"),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        google_model=os.getenv("GOOGLE_MODEL", "gemini-1.5-flash"),
        requests_per_minute=int(os.getenv("REQUESTS_PER_MINUTE", "60")),
        max_retries=int(os.getenv("MAX_RETRIES", "3")),
        retry_backoff_seconds=float(os.getenv("RETRY_BACKOFF_SECONDS", "1.5")),
    )