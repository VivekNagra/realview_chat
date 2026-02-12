"""
Flask backend for the property inspection review tool.
Serves pipeline results, local images, and accepts feedback.
"""
import json
import shutil
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# Project root (parent of web/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
OUT_DIR = PROJECT_ROOT / "out"
FEEDBACK_PATH = OUT_DIR / "feedback.json"
GROUND_TRUTH_DIR = OUT_DIR / "ground_truth"

# Centralized cases storage: each property has a folder case_<property_id> (inside app root so path works for any install location)
CASES_ROOT = PROJECT_ROOT / "cases"

app = Flask(__name__)
CORS(app)


@app.route("/api/properties", methods=["GET"])
def get_properties():
    """Scan OUT_DIR for results_*.json (and legacy results.json); load each and return a list of property objects."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    properties = []
    for path in sorted(OUT_DIR.glob("results_*.json")):
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            properties.append(data)
        except (json.JSONDecodeError, OSError):
            continue
    # Legacy: if no per-property files, try single results.json
    if not properties and (OUT_DIR / "results.json").exists():
        try:
            with open(OUT_DIR / "results.json", encoding="utf-8") as f:
                data = json.load(f)
            if data and isinstance(data, dict) and "property_id" in data:
                properties.append(data)
        except (json.JSONDecodeError, OSError):
            pass
    return jsonify(properties)


@app.route("/api/images/<property_id>/<path:filename>", methods=["GET"])
def serve_image(property_id, filename):
    """Serve an image from CASES_ROOT/case_<property_id>/<filename>. Compatible with numerical property_id (e.g. 2203177)."""
    base = Path(filename).name
    if base != filename:
        return jsonify({"error": "Invalid filename"}), 400
    case_folder = property_id if str(property_id).startswith("case_") else f"case_{property_id}"
    case_dir = CASES_ROOT / case_folder
    if not case_dir.exists() or not case_dir.is_dir():
        return jsonify({"error": "Property image folder not found"}), 404
    path = case_dir / base
    if not path.exists() or not path.is_file():
        return jsonify({"error": "Image not found"}), 404
    return send_from_directory(str(case_dir), base)


@app.route("/api/feedback", methods=["GET"])
def get_feedback():
    """Return the entire content of out/feedback.json (list of feedback entries)."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if not FEEDBACK_PATH.exists():
        return jsonify([])
    try:
        with open(FEEDBACK_PATH, encoding="utf-8") as f:
            data = json.load(f)
        return jsonify(data if isinstance(data, list) else [])
    except (json.JSONDecodeError, OSError):
        return jsonify([])


@app.route("/api/feedback", methods=["POST"])
def post_feedback():
    """Accept feedback and append to out/feedback.json.

    Supports two kinds of feedback:
      1. Feature-level verdict: requires property_id, filename, feature_id, verdict
      2. Image-level classification: requires property_id, filename, classification
         where classification is one of: correct, fp, fn
    """
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "JSON body required"}), 400

    # Always required
    for field in ("property_id", "filename"):
        if field not in body:
            return jsonify({"error": f"Missing required field: {field}"}), 400

    entry = {
        "property_id": body["property_id"],
        "filename": body["filename"],
    }

    has_verdict = "feature_id" in body and "verdict" in body
    has_classification = "classification" in body

    if not has_verdict and not has_classification:
        return jsonify({"error": "Must provide (feature_id + verdict) or classification"}), 400

    if has_verdict:
        entry["feature_id"] = body["feature_id"]
        entry["verdict"] = body["verdict"]

    if has_classification:
        valid_classifications = ("correct", "fp", "fn")
        if body["classification"] not in valid_classifications:
            return jsonify({"error": f"classification must be one of: {', '.join(valid_classifications)}"}), 400
        entry["classification"] = body["classification"]
    # Load existing feedback, append, write
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if FEEDBACK_PATH.exists():
        try:
            with open(FEEDBACK_PATH, encoding="utf-8") as f:
                feedback = json.load(f)
        except (json.JSONDecodeError, OSError):
            feedback = []
    else:
        feedback = []
    feedback.append(entry)
    try:
        with open(FEEDBACK_PATH, "w", encoding="utf-8") as f:
            json.dump(feedback, f, indent=2)
    except OSError as e:
        return jsonify({"error": str(e)}), 500

    # Ground Truth: copy "correct" images into out/ground_truth/
    if entry.get("classification") == "correct":
        _copy_to_ground_truth(entry["property_id"], entry["filename"])

    return jsonify({"ok": True, "entry": entry}), 201


def _copy_to_ground_truth(property_id: str, filename: str) -> None:
    """Copy an approved image into out/ground_truth/{property_id}_{filename}.

    Uses shutil.copy2 to preserve metadata. Silently skips if the source
    image cannot be found so the feedback request still succeeds.
    """
    # Resolve source path (same logic as serve_image)
    base = Path(filename).name
    case_folder = property_id if str(property_id).startswith("case_") else f"case_{property_id}"
    src = CASES_ROOT / case_folder / base

    if not src.exists() or not src.is_file():
        app.logger.warning("Ground truth copy skipped – source not found: %s", src)
        return

    GROUND_TRUTH_DIR.mkdir(parents=True, exist_ok=True)
    dest = GROUND_TRUTH_DIR / f"{property_id}_{base}"
    try:
        shutil.copy2(src, dest)
        app.logger.info("Copied to ground truth: %s -> %s", src, dest)
    except OSError as exc:
        app.logger.error("Failed to copy to ground truth: %s", exc)


if __name__ == "__main__":
    # Use 5001 to avoid conflict with macOS AirPlay Receiver on port 5000 (which returns 403 for API requests)
    app.run(debug=True, port=5001)
