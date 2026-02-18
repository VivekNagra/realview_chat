"""
Flask backend for the property inspection review tool.
Serves pipeline results, local images, and accepts feedback.
"""
import json
import shutil
from collections import Counter
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


@app.route("/api/stats", methods=["GET"])
def get_stats():
    """Compute benchmarking statistics from the latest classification per image."""
    feedback = []
    if FEEDBACK_PATH.exists():
        try:
            with open(FEEDBACK_PATH, encoding="utf-8") as f:
                feedback = json.load(f)
        except (json.JSONDecodeError, OSError):
            feedback = []

    # Deduplicate: keep only the latest classification per (property_id, filename)
    latest: dict[tuple[str, str], str] = {}
    for entry in feedback:
        cls = entry.get("classification")
        if cls:
            latest[(entry["property_id"], entry["filename"])] = cls

    correct = sum(1 for v in latest.values() if v == "correct")
    fp = sum(1 for v in latest.values() if v == "fp")
    fn = sum(1 for v in latest.values() if v == "fn")

    precision = (correct / (correct + fp) * 100) if (correct + fp) > 0 else 0
    recall = (correct / (correct + fn) * 100) if (correct + fn) > 0 else 0

    return jsonify({
        "correct": correct,
        "fp": fp,
        "fn": fn,
        "total_classified": correct + fp + fn,
        "precision": round(precision, 1),
        "recall": round(recall, 1),
    })


@app.route("/api/reset", methods=["DELETE"])
def reset_benchmarking():
    """Clear feedback.json and the ground_truth folder. Destructive action."""
    # Clear feedback
    try:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        with open(FEEDBACK_PATH, "w", encoding="utf-8") as f:
            json.dump([], f)
    except OSError as e:
        return jsonify({"error": f"Failed to clear feedback: {e}"}), 500

    # Clear ground truth folder
    try:
        if GROUND_TRUTH_DIR.exists():
            shutil.rmtree(GROUND_TRUTH_DIR)
        GROUND_TRUTH_DIR.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        return jsonify({"error": f"Failed to clear ground truth: {e}"}), 500

    return jsonify({"ok": True})


@app.route("/api/ground_truth", methods=["GET"])
def get_ground_truth():
    """Return a list of filenames present in the out/ground_truth/ folder."""
    GROUND_TRUTH_DIR.mkdir(parents=True, exist_ok=True)
    image_extensions = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff"}
    files = []
    for p in sorted(GROUND_TRUTH_DIR.iterdir()):
        if p.is_file() and p.suffix.lower() in image_extensions:
            files.append(p.name)
    return jsonify(files)


@app.route("/api/ground_truth/<path:filename>", methods=["GET"])
def serve_ground_truth_image(filename):
    """Serve an image from the ground truth folder."""
    base = Path(filename).name
    if base != filename:
        return jsonify({"error": "Invalid filename"}), 400
    path = GROUND_TRUTH_DIR / base
    if not path.exists() or not path.is_file():
        return jsonify({"error": "Image not found"}), 404
    return send_from_directory(str(GROUND_TRUTH_DIR), base)


@app.route("/api/summary", methods=["GET"])
def get_summary():
    """Aggregate data from all results JSON files into a pipeline summary."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    total_images = 0
    kitchen_count = 0
    bathroom_count = 0
    kb_actionable = 0
    kb_total = 0
    feature_counter: Counter[str] = Counter()
    proposal_image_counts: list[int] = []

    severity_counter: Counter[str] = Counter()
    kitchen_damage: Counter[str] = Counter()
    bathroom_damage: Counter[str] = Counter()

    p1_confidence_sum = 0.0
    p1_confidence_n = 0
    p2_confidence_sum = 0.0
    p2_confidence_n = 0

    # Per-property high-severity tracking: {property_id: {high, total}}
    property_damage: dict[str, dict[str, int]] = {}

    for path in sorted(OUT_DIR.glob("results_*.json")):
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            continue

        prop_id = data.get("property_id", path.stem)
        images = data.get("images", [])
        proposal_image_counts.append(len(images))
        total_images += len(images)
        prop_high = 0
        prop_total_dmg = 0

        for img in images:
            p1 = img.get("pass1", {})
            room = p1.get("room_type", "").lower()
            actionable = p1.get("actionable", False)

            p1_conf = p1.get("confidence")
            if p1_conf is not None:
                p1_confidence_sum += p1_conf
                p1_confidence_n += 1

            if room == "kitchen":
                kitchen_count += 1
                kb_total += 1
                if actionable:
                    kb_actionable += 1
            elif room == "bathroom":
                bathroom_count += 1
                kb_total += 1
                if actionable:
                    kb_actionable += 1

            for feature in img.get("pass2", []):
                fid = feature.get("feature_id")
                if not fid:
                    continue

                feature_counter[fid] += 1
                prop_total_dmg += 1

                sev = (feature.get("severity") or "").lower()
                if sev:
                    severity_counter[sev] += 1
                if sev == "high":
                    prop_high += 1

                if room == "kitchen":
                    kitchen_damage[fid] += 1
                elif room == "bathroom":
                    bathroom_damage[fid] += 1

                p2_conf = feature.get("confidence")
                if p2_conf is not None:
                    p2_confidence_sum += p2_conf
                    p2_confidence_n += 1

        property_damage[prop_id] = {"high": prop_high, "total": prop_total_dmg}

    actionability_rate = (kb_actionable / kb_total * 100) if kb_total > 0 else 0
    num_proposals = len(proposal_image_counts)
    avg_images = (total_images / num_proposals) if num_proposals > 0 else 0

    at_risk = sorted(
        property_damage.items(),
        key=lambda kv: (-kv[1]["high"], -kv[1]["total"]),
    )[:5]

    return jsonify({
        "pipeline_funnel": {
            "total_images": total_images,
            "kitchen_or_bathroom": kitchen_count + bathroom_count,
        },
        "room_distribution": {
            "kitchen": kitchen_count,
            "bathroom": bathroom_count,
        },
        "damage_frequency": [
            {"feature_id": fid, "count": cnt}
            for fid, cnt in feature_counter.most_common()
        ],
        "room_damage_profiles": {
            "kitchen": [
                {"feature_id": fid, "count": cnt}
                for fid, cnt in kitchen_damage.most_common()
            ],
            "bathroom": [
                {"feature_id": fid, "count": cnt}
                for fid, cnt in bathroom_damage.most_common()
            ],
        },
        "severity_breakdown": {
            "high": severity_counter.get("high", 0),
            "medium": severity_counter.get("medium", 0),
            "low": severity_counter.get("low", 0),
        },
        "confidence_metrics": {
            "pass1_avg": round(p1_confidence_sum / p1_confidence_n, 3) if p1_confidence_n else None,
            "pass1_count": p1_confidence_n,
            "pass2_avg": round(p2_confidence_sum / p2_confidence_n, 3) if p2_confidence_n else None,
            "pass2_count": p2_confidence_n,
        },
        "at_risk_properties": [
            {
                "property_id": pid,
                "high_severity_count": counts["high"],
                "total_damage_count": counts["total"],
            }
            for pid, counts in at_risk
            if counts["high"] > 0
        ],
        "actionability_rate": {
            "actionable_kb_images": kb_actionable,
            "total_kb_images": kb_total,
            "rate_percent": round(actionability_rate, 1),
        },
        "per_proposal_stats": {
            "num_proposals": num_proposals,
            "total_images": total_images,
            "avg_images_per_proposal": round(avg_images, 1),
        },
    })


if __name__ == "__main__":
    # Use 5001 to avoid conflict with macOS AirPlay Receiver on port 5000 (which returns 403 for API requests)
    app.run(debug=True, port=5001)
