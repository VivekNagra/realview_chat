"""Pipeline pass 1: gating."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from realview_chat.openai_client.responses import LLMClient


@dataclass(frozen=True)
class Pass1Result:
    room_type: str
    actionable: bool
    confidence: float


def run_pass1(client: LLMClient, image_data_url: str) -> Pass1Result:
    result = client.pass1(image_data_url)
    return Pass1Result(
        room_type=result["room_type"],
        actionable=bool(result["actionable"]),
        confidence=float(result["confidence"]),
    )