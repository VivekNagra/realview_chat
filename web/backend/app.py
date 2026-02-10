"""
Flask backend for the property inspection review tool.
Serves pipeline results, local images, and accepts feedback.
"""
import json
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# Project root (parent of web/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
OUT_DIR = PROJECT_ROOT / "out"
FEEDBACK_PATH = OUT_DIR / "feedback.json"

# Centralized cases storage: each property has a folder case_<property_id>
CASES_ROOT = Path("C:/Users/ermin/OneDrive/Skrivebord/RealView/cases")

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
    # Use 5001 to avoid conflict with macOS AirPlay Receiver on port 5000 (which returns 403 for API requests)
    app.run(debug=True, port=5001)
