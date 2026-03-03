"""Pipeline pass 2: feature detection."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from realview_chat.openai_client.responses import LLMClient


@dataclass(frozen=True)
class FeatureResult:
    feature_id: str
    severity: str
    confidence: float
    explanation: str


@dataclass(frozen=True)
class Pass2Result:
    features: list[FeatureResult]
    condition_score: int | None
    modernity_score: int | None


def run_pass2(client: LLMClient, image_data_url: str) -> Pass2Result:
    result = client.pass2(image_data_url)
    features = [
        FeatureResult(
            feature_id=item["feature_id"],
            severity=item["severity"],
            confidence=float(item["confidence"]),
            explanation=item["explanation"],
        )
        for item in result["features"]
    ]
    return Pass2Result(
        features=features,
        condition_score=result.get("condition_score"),
        modernity_score=result.get("modernity_score"),
    )