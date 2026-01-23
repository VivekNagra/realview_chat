# realview_chat

A CLI pipeline that reads property IDs, fetches local images, and runs a 3-step OpenAI vision workflow using the Responses API with structured outputs.

## Setup

1. **Create a virtual environment (recommended)**
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your OpenAI API key.
   ```

## Configure image fetching

Replace the stub in `src/realview_chat/pipeline/property_processor.py`:

```python
from realview_chat.pipeline.property_processor import fetch_images_folder_for_property

# TODO: implement this function to return a local folder path for images.
```

## Run the pipeline

```bash
python scripts/run_pipeline.py --csv data/sample_input.csv --out out/results.jsonl
```

## Output format

Results are written as JSON Lines (JSONL) with one JSON object per property. Each record includes:
- `property_id`
- `created_at`
- `images` (pass1 + pass2 per image)
- `rooms` (pass2.5 consolidation per room)

## Notes

- Images are loaded from local files and sent to the model as base64 data URLs.
- Pass 2 uses a feature whitelist defined in `src/realview_chat/openai_client/schemas.py`.
- Pass 2.5 only runs when at least two actionable images are available for a room.
