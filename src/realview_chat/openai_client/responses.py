"""OpenAI Responses API wrapper and Gemini Backend."""

from __future__ import annotations

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


class LLMClient(Protocol):
    """Interface for LLM clients."""
    def pass1(self, image_data_url: str) -> dict[str, Any]: ...
    def pass2(self, image_data_url: str) -> dict[str, Any]: ...
    def pass25(self, room_type: str, image_data_urls: list[str]) -> dict[str, Any]: ...


class OpenAIBackend:
    """Client for OpenAI's Chat Completions API."""
    def __init__(self, config: AppConfig, rate_limiter: RateLimiter) -> None:
        self._client = OpenAI(api_key=config.openai_api_key)
        self._model = config.openai_model
        self._rate_limiter = rate_limiter
        self._max_retries = config.max_retries
        self._retry_backoff_seconds = config.retry_backoff_seconds
        self._logger = logging.getLogger(self.__class__.__name__)

    def _call(self, *, system_prompt: str, schema: dict, input_items: list[dict]) -> dict:
        def execute() -> dict:
            self._rate_limiter.wait()
            response = self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    *input_items
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": schema,
                },
            )
            choice = response.choices[0]
            output_text = choice.message.content
            if not output_text:
                raise ValueError("Empty response output")
            return json.loads(output_text)

        return with_retry(
            execute,
            max_retries=self._max_retries,
            backoff_seconds=self._retry_backoff_seconds,
            logger=self._logger,
        )

    def pass1(self, image_data_url: str) -> dict[str, Any]:
        input_items = [
            {"role": "user", "content": [{"type": "input_image", "image_url": {"url": image_data_url}}]},
        ]
        return self._call(
            system_prompt=prompts.PASS1_SYSTEM,
            schema=schemas.pass1_schema(),
            input_items=input_items,
        )

    def pass2(self, image_data_url: str) -> dict[str, Any]:
        whitelist = ", ".join(schemas.FEATURE_WHITELIST)
        system_prompt = f"{prompts.PASS2_SYSTEM}\nAllowed feature IDs: {whitelist}"
        input_items = [
            {"role": "user", "content": [{"type": "input_image", "image_url": {"url": image_data_url}}]},
        ]
        return self._call(
            system_prompt=system_prompt,
            schema=schemas.pass2_schema(),
            input_items=input_items,
        )

    def pass25(self, room_type: str, image_data_urls: list[str]) -> dict[str, Any]:
        content = [{"type": "text", "text": f"Room type to consolidate: {room_type}"}]
        content.extend(
            {"type": "input_image", "image_url": {"url": url}} for url in image_data_urls
        )
        input_items = [{"role": "user", "content": content}]
        return self._call(
            system_prompt=prompts.PASS25_SYSTEM,
            schema=schemas.pass25_schema(),
            input_items=input_items,
        )


class GeminiBackend:
    """Client for Google's Gemini API."""
    def __init__(self, config: AppConfig, rate_limiter: RateLimiter) -> None:
        genai.configure(api_key=config.google_api_key)
        self._model_name = config.google_model
        self._rate_limiter = rate_limiter
        self._logger = logging.getLogger("GeminiBackend")
        self._max_retries = config.max_retries
        self._retry_backoff = config.retry_backoff_seconds

    def _decode_data_url(self, data_url: str) -> dict:
        """Convert Data URL to the blob dict expected by Gemini."""
        try:
            header, encoded = data_url.split(",", 1)
            mime = header.split(";")[0].split(":")[1]
            data = base64.b64decode(encoded)
            return {"mime_type": mime, "data": data}
        except Exception as e:
            raise ValueError(f"Failed to decode data URL: {e}")

    def _clean_schema(self, schema: Any) -> Any:
        """Recursively remove unsupported keys from schema for Gemini compatibility."""
        # Gemini does not support these JSON schema validation keywords
        UNSUPPORTED_KEYS = {"additionalProperties", "minimum", "maximum"}
        
        if isinstance(schema, dict):
            return {
                k: self._clean_schema(v)
                for k, v in schema.items()
                if k not in UNSUPPORTED_KEYS
            }
        if isinstance(schema, list):
            return [self._clean_schema(item) for item in schema]
        return schema

    def _call(self, system_prompt: str, schema: dict, parts: list[Any]) -> dict:
        # 1. Extract the inner schema
        raw_schema = schema.get("schema", schema)
        # 2. Clean it (remove OpenAI-specific keys like additionalProperties, minimum, maximum)
        target_schema = self._clean_schema(raw_schema)
        
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

    def pass1(self, image_data_url: str) -> dict[str, Any]:
        return self._call(
            prompts.PASS1_SYSTEM, 
            schemas.pass1_schema(), 
            [self._decode_data_url(image_data_url)]
        )

    def pass2(self, image_data_url: str) -> dict[str, Any]:
        whitelist = ", ".join(schemas.FEATURE_WHITELIST)
        prompt = f"{prompts.PASS2_SYSTEM}\nAllowed feature IDs: {whitelist}"
        return self._call(
            prompt,
            schemas.pass2_schema(),
            [self._decode_data_url(image_data_url)]
        )

    def pass25(self, room_type: str, image_data_urls: list[str]) -> dict[str, Any]:
        parts = [f"Room type to consolidate: {room_type}"]
        parts.extend(self._decode_data_url(url) for url in image_data_urls)
        return self._call(prompts.PASS25_SYSTEM, schemas.pass25_schema(), parts)


def create_client(config: AppConfig) -> LLMClient:
    """Factory to create the appropriate LLM client."""
    limiter = RateLimiter(config.requests_per_minute)
    
    if config.llm_provider == "google":
        if not config.google_api_key:
            raise ValueError("LLM_PROVIDER is 'google' but GOOGLE_API_KEY is missing")
        return GeminiBackend(config, limiter)
        
    # Default to OpenAI
    if not config.openai_api_key:
        raise ValueError("OPENAI_API_KEY is missing")
    return OpenAIBackend(config, limiter)