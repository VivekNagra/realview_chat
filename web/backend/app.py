"""
Flask backend for the property inspection review tool.
Serves pipeline results, local images, and accepts feedback.
"""
import json
import os
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# Project root (parent of web/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
OUT_DIR = PROJECT_ROOT / "out"
RESULTS_PATH = OUT_DIR / "results.json"
FEEDBACK_PATH = OUT_DIR / "feedback.json"

# Images directory: set IMAGES_DIR env var or use default
IMAGES_DIR = Path(
    os.environ.get("IMAGES_DIR", "/Users/vivek/Downloads/case_2203177")
).resolve()

app = Flask(__name__)
CORS(app)


@app.route("/api/properties", methods=["GET"])
def get_properties():
    """Serve the content of out/results.json."""
    if not RESULTS_PATH.exists():
        return jsonify({"error": "results.json not found"}), 404
    try:
        with open(RESULTS_PATH, encoding="utf-8") as f:
            data = json.load(f)
        return jsonify(data)
    except (json.JSONDecodeError, OSError) as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/images/<path:filename>", methods=["GET"])
def serve_image(filename):
    """Serve an image from the configured images directory."""
    # Guard against path traversal: ensure path stays under IMAGES_DIR
    base = Path(filename).name
    if base != filename:
        return jsonify({"error": "Invalid filename"}), 400
    if not IMAGES_DIR.exists():
        return jsonify({"error": "Images directory not configured or missing"}), 404
    path = IMAGES_DIR / base
    if not path.exists() or not path.is_file():
        return jsonify({"error": "Image not found"}), 404
    return send_from_directory(str(IMAGES_DIR), base)


@app.route("/api/feedback", methods=["POST"])
def post_feedback():
    """Accept feedback and append to out/feedback.json."""
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "JSON body required"}), 400
    required = ("property_id", "filename", "feature_id", "verdict")
    missing = [k for k in required if k not in body]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400
    entry = {
        "property_id": body["property_id"],
        "filename": body["filename"],
        "feature_id": body["feature_id"],
        "verdict": body["verdict"],
    }
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
    return jsonify({"ok": True, "entry": entry}), 201


if __name__ == "__main__":
    app.run(debug=True, port=5000)
