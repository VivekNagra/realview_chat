import base64
import json
import logging
from typing import Any, Protocol

from openai import OpenAI
import google.generativeai as genai

from realview_chat.openai_client import prompts, schemas
from realview_chat.utils.rate_limit import RateLimiter
from realview_chat.utils.retry import with_retry
from realview_chat.config import AppConfig

# 1. Define the Interface
class LLMClient(Protocol):
    def pass1(self, image_data_url: str) -> dict[str, Any]: ...
    def pass2(self, image_data_url: str) -> dict[str, Any]: ...
    def pass25(self, room_type: str, image_data_urls: list[str]) -> dict[str, Any]: ...

# 2. OpenAI Implementation (Existing logic)
class OpenAIBackend:
    def __init__(self, config: AppConfig, rate_limiter: RateLimiter):
        self._client = OpenAI(api_key=config.openai_api_key)
        self._model = config.openai_model
        self._rate_limiter = rate_limiter
        # ... (rest of init)

    def _call(self, system_prompt: str, schema: dict, input_items: list[dict]) -> dict:
        # ... (existing _call logic using self._client.responses.create) ...
        pass

    # ... (implement pass1, pass2, pass25 calling self._call) ...

# 3. Google Gemini Implementation (New logic)
class GeminiBackend:
    def __init__(self, config: AppConfig, rate_limiter: RateLimiter):
        genai.configure(api_key=config.google_api_key)
        self._model_name = config.google_model
        self._rate_limiter = rate_limiter
        self._logger = logging.getLogger("GeminiBackend")
        self._max_retries = config.max_retries
        self._retry_backoff = config.retry_backoff_seconds

    def _decode_data_url(self, data_url: str) -> dict:
        # Helper to convert "data:image/jpeg;base64,..." to {"mime_type":..., "data":...}
        header, encoded = data_url.split(",", 1)
        mime = header.split(";")[0].split(":")[1]
        data = base64.b64decode(encoded)
        return {"mime_type": mime, "data": data}

    def _call(self, system_prompt: str, schema: dict, parts: list[Any]) -> dict:
        # Extract inner schema for Gemini
        target_schema = schema.get("schema", schema)

        def execute():
            self._rate_limiter.wait()
            model = genai.GenerativeModel(
                self._model_name,
                system_instruction=system_prompt,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    response_schema=target_schema
                )
            )
            response = model.generate_content(parts)
            return json.loads(response.text)

        return with_retry(execute, max_retries=self._max_retries, backoff_seconds=self._retry_backoff, logger=self._logger)

    def pass1(self, image_data_url: str) -> dict:
        return self._call(
            prompts.PASS1_SYSTEM, 
            schemas.pass1_schema(), 
            [self._decode_data_url(image_data_url)]
        )

    def pass2(self, image_data_url: str) -> dict:
         # Add whitelist instruction to prompt like in OpenAI version
         whitelist = ", ".join(schemas.FEATURE_WHITELIST)
         prompt = f"{prompts.PASS2_SYSTEM}\nAllowed feature IDs: {whitelist}"
         return self._call(
            prompt,
            schemas.pass2_schema(),
            [self._decode_data_url(image_data_url)]
         )

    def pass25(self, room_type: str, image_data_urls: list[str]) -> dict:
        parts = [f"Room type to consolidate: {room_type}"]
        parts.extend(self._decode_data_url(url) for url in image_data_urls)
        return self._call(prompts.PASS25_SYSTEM, schemas.pass25_schema(), parts)

# 4. Factory Function
def create_client(config: AppConfig) -> LLMClient:
    limiter = RateLimiter(config.requests_per_minute)

    if config.llm_provider == "google":
        if not config.google_api_key:
            raise ValueError("LLM_PROVIDER is 'google' but GOOGLE_API_KEY is missing")
        return GeminiBackend(config, limiter)

    # Default to OpenAI
    if not config.openai_api_key:
        raise ValueError("OPENAI_API_KEY is missing")
    return OpenAIBackend(config, limiter)