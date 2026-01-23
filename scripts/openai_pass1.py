"""Helper for Pass 1 gating via OpenAI structured Chat Completions."""

from __future__ import annotations

import json
from typing import Any, Dict, List

from openai import OpenAI

PASS1_SYSTEM_PROMPT = (
    "You are an expert property inspector. "
    "Look at the provided image and determine: "
    "1) the room type, 2) whether the image is actionable (boolean), "
    "3) a confidence score between 0 and 1. "
    "Only use the allowed room_type values."
)

ROOM_TYPES = [
    "kitchen",
    "bathroom",
    "living_room",
    "bedroom",
    "facade",
    "roof",
    "technical_room",
    "undefined",
]


def pass1_schema() -> Dict[str, Any]:
    return {
        "name": "pass1_result",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "room_type": {"type": "string", "enum": ROOM_TYPES},
                "actionable": {"type": "boolean"},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            },
            "required": ["room_type", "actionable", "confidence"],
        },
        "strict": True,
    }


def _extract_text(message_content: List[Any]) -> str:
    """Pull concatenated text parts from a chat message content list."""
    parts = []
    for item in message_content:
        if getattr(item, "type", None) == "text":
            parts.append(getattr(item, "text", ""))
        elif isinstance(item, dict) and item.get("type") == "text":
            parts.append(item.get("text", ""))
    return "".join(parts).strip()


def run_pass1(client: OpenAI, image_data_url: str) -> Dict[str, Any]:
    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {"role": "system", "content": PASS1_SYSTEM_PROMPT},
            {"role": "user", "content": [{"type": "input_image", "image_url": image_data_url}]},
        ],
        response_format={"type": "json_schema", "json_schema": pass1_schema()},
    )

    choice = response.choices[0]
    content = getattr(choice.message, "content", [])
    output_text = _extract_text(content)
    if not output_text:
        raise ValueError("Empty response from model")

    return json.loads(output_text)

