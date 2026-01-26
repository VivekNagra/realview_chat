"""Pipeline pass 2.5: room consolidation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from realview_chat.openai_client.responses import LLMClient


@dataclass(frozen=True)
class ConsolidatedFeature:
    feature_id: str
    severity: str
    confidence: float
    evidence: str


@dataclass(frozen=True)
class Pass25Result:
    room_type: str
    confirmed_features: list[ConsolidatedFeature]


def run_pass25(
    client: LLMClient,
    room_type: str,
    image_data_urls: list[str],
) -> Pass25Result:
    result = client.pass25(room_type=room_type, image_data_urls=image_data_urls)
    features = [
        ConsolidatedFeature(
            feature_id=item["feature_id"],
            severity=item["severity"],
            confidence=float(item["confidence"]),
            evidence=item["evidence"],
        )
        for item in result["confirmed_features"]
    ]
    return Pass25Result(room_type=result["room_type"], confirmed_features=features)