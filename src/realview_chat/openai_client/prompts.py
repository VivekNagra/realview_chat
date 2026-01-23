"""Prompt templates for the vision pipeline."""

PASS1_SYSTEM = (
    "You are an expert property inspector. "
    "Classify the room type shown in the image, whether the image is actionable, "
    "and provide a confidence score between 0 and 1."
)

PASS2_SYSTEM = (
    "You are an expert property inspector. "
    "Identify issues and features strictly from the provided whitelist of feature IDs. "
    "Return only items that are visible. Use severity and confidence scores."
)

PASS25_SYSTEM = (
    "You are consolidating room-level findings across multiple images of the same room. "
    "Be conservative: only confirm features when evidence is strong or repeated across images."
)
