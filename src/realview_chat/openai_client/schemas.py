"""Structured output schemas for OpenAI Responses API."""

from __future__ import annotations

ROOM_TYPES = [
    "bedroom",
    "bathroom",
    "kitchen",
    "living_room",
    "dining_room",
    "hallway",
    "garage",
    "exterior",
    "unknown",
]

FEATURE_WHITELIST = [
    "water_damage",
    "mold",
    "broken_fixture",
    "stained_carpet",
    "cracked_tile",
]


def pass1_schema() -> dict:
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


def pass2_schema() -> dict:
    return {
        "name": "pass2_result",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "features": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "feature_id": {"type": "string", "enum": FEATURE_WHITELIST},
                            "severity": {"type": "string", "enum": ["low", "medium", "high"]},
                            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                            "explanation": {"type": "string"},
                        },
                        "required": [
                            "feature_id",
                            "severity",
                            "confidence",
                            "explanation",
                        ],
                    },
                }
            },
            "required": ["features"],
        },
        "strict": True,
    }


def pass25_schema() -> dict:
    return {
        "name": "pass25_result",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "room_type": {"type": "string", "enum": ROOM_TYPES},
                "confirmed_features": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "feature_id": {"type": "string", "enum": FEATURE_WHITELIST},
                            "severity": {"type": "string", "enum": ["low", "medium", "high"]},
                            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                            "evidence": {"type": "string"},
                        },
                        "required": [
                            "feature_id",
                            "severity",
                            "confidence",
                            "evidence",
                        ],
                    },
                },
            },
            "required": ["room_type", "confirmed_features"],
        },
        "strict": True,
    }
