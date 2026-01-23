"""Pipeline pass 2: feature detection."""

from __future__ import annotations

from dataclasses import dataclass

from realview_chat.openai_client.responses import OpenAIResponsesClient


@dataclass(frozen=True)
class FeatureResult:
    feature_id: str
    severity: str
    confidence: float
    explanation: str


def run_pass2(client: OpenAIResponsesClient, image_data_url: str) -> list[FeatureResult]:
    result = client.pass2(image_data_url)
    return [
        FeatureResult(
            feature_id=item["feature_id"],
            severity=item["severity"],
            confidence=float(item["confidence"]),
            explanation=item["explanation"],
        )
        for item in result["features"]
    ]
