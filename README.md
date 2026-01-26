# RealView Chat (minimal)

Run a single-pass (Pass 1) OpenAI vision pipeline on a folder of images.

## Prerequisites
- Python 3.10+
- Dependencies: `pip install -r requirements.txt` (pins `openai>=1.40,<2`)
- Environment: set `OPENAI_API_KEY` (e.g., `echo "OPENAI_API_KEY=sk-..." > .env`)

## Run
```bash
python -m venv venv
.\venv\Scripts\Activate
```
## Select provider
```bash
$env:LLM_PROVIDER="google"
```
# or
```bash
$env:LLM_PROVIDER="openai"
```
## Run script
```bash
python scripts/run_pipeline.py "/Users/vivek/Downloads/case_2203177"
```

## What it does
- Recursively finds `.jpg/.jpeg/.png/.webp` under the folder.
- Calls OpenAI Responses API (Pass 1 only: room_type, actionable, confidence).
- Writes JSON to `out/results.json`.
- Prints a short summary (images found, actionable count, output path).

## Output format
```json
{
  "input_folder": "...",
  "images_total": 3,
  "results": [
    {"file": "img1.jpg", "room_type": "kitchen", "actionable": true, "confidence": 0.82}
  ]
}
```
