"""OpenAI Responses API wrapper."""

from __future__ import annotations

import json
import logging
from typing import Any

from openai import OpenAI

from realview_chat.openai_client import prompts, schemas
from realview_chat.utils.rate_limit import RateLimiter
from realview_chat.utils.retry import with_retry


class OpenAIResponsesClient:
    def __init__(
        self,
        api_key: str,
        model: str,
        rate_limiter: RateLimiter,
        max_retries: int,
        retry_backoff_seconds: float,
    ) -> None:
        self._client = OpenAI(api_key=api_key)
        self._model = model
        self._rate_limiter = rate_limiter
        self._max_retries = max_retries
        self._retry_backoff_seconds = retry_backoff_seconds
        self._logger = logging.getLogger(self.__class__.__name__)

    def _call(self, *, system_prompt: str, schema: dict, input_items: list[dict]) -> dict:
        def execute() -> dict:
            self._rate_limiter.wait()
            response = self._client.responses.create(
                model=self._model,
                input=input_items,
                instructions=system_prompt,
                response_format={
                    "type": "json_schema",
                    "json_schema": schema,
                },
            )
            output_text = response.output_text
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
            {"role": "user", "content": [{"type": "input_image", "image_url": image_data_url}]},
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
            {"role": "user", "content": [{"type": "input_image", "image_url": image_data_url}]},
        ]
        return self._call(
            system_prompt=system_prompt,
            schema=schemas.pass2_schema(),
            input_items=input_items,
        )

    def pass25(self, room_type: str, image_data_urls: list[str]) -> dict[str, Any]:
        content = [
            {"type": "text", "text": f"Room type to consolidate: {room_type}"},
        ]
        content.extend({"type": "input_image", "image_url": url} for url in image_data_urls)
        input_items = [{"role": "user", "content": content}]
        return self._call(
            system_prompt=prompts.PASS25_SYSTEM,
            schema=schemas.pass25_schema(),
            input_items=input_items,
        )
