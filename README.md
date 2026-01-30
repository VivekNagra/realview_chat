# RealView Chat

A property inspection review tool: run an AI pipeline on inspection images, then review results and give feedback in a web app.

---

## What’s in this project

1. **Pipeline** – Processes a folder of images with OpenAI vision (room type, issues, features) and writes `out/results.json`.
2. **Backend** – Flask API that serves results, images, and saves your feedback to `out/feedback.json`.
3. **Frontend** – React app to browse properties, see rooms/features, and submit Agree/Disagree on each finding.

---

## What you need

- **Python 3.10 or newer**
- **Node.js 18+** (for the web frontend)
- **OpenAI API key** (for the pipeline)

---

## Setup

Do this once from the project root (the folder that contains `scripts/`, `web/`, and `requirements.txt`).

### 1. Open a terminal in the project folder

- **Mac:** Open Terminal, then `cd` to the project folder (e.g. `cd ~/Desktop/RealView/realview_chat`).
- **Windows:** Open Command Prompt or PowerShell, then `cd` to the project folder (e.g. `cd C:\Users\YourName\realview_chat`).

### 2. (Optional) Create and activate a Python virtual environment

| Step | Mac / Linux | Windows (Command Prompt) | Windows (PowerShell) |
|------|-------------|--------------------------|----------------------|
| Create venv | `python3 -m venv .venv` | `python -m venv .venv` | `python -m venv .venv` |
| Activate | `source .venv/bin/activate` | `.venv\Scripts\activate.bat` | `.venv\Scripts\Activate.ps1` |

After activation, your prompt usually shows `(.venv)`.

### 3. Install Python dependencies

Same on all systems:

```bash
pip install -r requirements.txt
```

### 4. Set your OpenAI API key

The pipeline needs `OPENAI_API_KEY` to call OpenAI.

**Option A – Environment variable (current terminal only)**

| Mac / Linux | Windows (Command Prompt) | Windows (PowerShell) |
|-------------|--------------------------|----------------------|
| `export OPENAI_API_KEY=sk-your-key-here` | `set OPENAI_API_KEY=sk-your-key-here` | `$env:OPENAI_API_KEY="sk-your-key-here"` |

**Option B – `.env` file (recommended)**

Create a file named `.env` in the project root with:

```
OPENAI_API_KEY=sk-your-key-here
```

The app loads this automatically; no need to type the key in the terminal each time.

### 5. Install frontend dependencies (for the web app)

Same on all systems:

```bash
cd web/frontend
npm install
cd ../..
```

You should be back in the project root.

---

## Run the pipeline (process images)

This reads a folder of images and writes `out/results.json`. Run from the **project root**.

**Mac / Linux:**

```bash
python scripts/run_pipeline.py "/path/to/your/image/folder"
```

Example:

```bash
python scripts/run_pipeline.py "/Users/vivek/Downloads/case_2203177"
```

**Windows:**

Use your real path in quotes. Forward slashes are fine.

```bash
python scripts/run_pipeline.py "C:/Users/YourName/Downloads/case_2203177"
```

Or with backslashes (escape them in PowerShell or use a raw string):

```bash
python scripts/run_pipeline.py "C:\Users\YourName\Downloads\case_2203177"
```

**What it does:**

- Finds `.jpg`, `.jpeg`, `.png`, `.webp` in that folder (and subfolders).
- Runs Pass 1 (room type, actionable, confidence) and Pass 2 (features) via OpenAI.
- Writes `out/results.json` and prints a short summary.

---

## Run the web app (review results)

You need **two terminals**: one for the backend, one for the frontend. The frontend talks to the backend for data and images.

### Terminal 1 – Backend (Flask)

Run from the **project root**.

**Optional:** Tell the backend where your images live (so it can serve them). If you skip this, it uses a default path that may not match your machine.

| Mac / Linux | Windows (Command Prompt) | Windows (PowerShell) |
|-------------|--------------------------|----------------------|
| `export IMAGES_DIR=/path/to/your/image/folder` | `set IMAGES_DIR=C:\path\to\your\image\folder` | `$env:IMAGES_DIR="C:\path\to\your\image\folder"` |

Then start the backend (same on all systems):

```bash
python -m web.backend.app
```

You should see something like “Running on http://127.0.0.1:5000”. Leave this terminal open.

### Terminal 2 – Frontend (React)

From the **project root**:

```bash
cd web/frontend
npm run dev
```

Same on Mac and Windows. When it’s ready, open the URL shown (e.g. `http://localhost:5173`) in your browser.

**Using the app:**

- **Sidebar:** Lists properties from `out/results.json`. Click one to load it.
- **Main view:** Left = rooms and confirmed features (with Agree/Disagree). Right = images per room (loaded from the backend using the path you set in `IMAGES_DIR`).
- **Feedback:** When you click Agree or Disagree, the app sends a POST to the backend; the backend appends to `out/feedback.json` with `property_id`, `filename`, `feature_id`, and your verdict.

---

## Commands quick reference

| Task | Mac / Linux | Windows |
|------|-------------|---------|
| Install Python deps | `pip install -r requirements.txt` | Same |
| Set API key (session) | `export OPENAI_API_KEY=sk-...` | `set OPENAI_API_KEY=sk-...` (CMD) or `$env:OPENAI_API_KEY="sk-..."` (PowerShell) |
| Run pipeline | `python scripts/run_pipeline.py "/path/to/images"` | `python scripts/run_pipeline.py "C:\path\to\images"` |
| Set images dir (session) | `export IMAGES_DIR=/path/to/images` | `set IMAGES_DIR=C:\path\to\images` (CMD) or `$env:IMAGES_DIR="C:\path\to\images"` (PowerShell) |
| Start backend | `python -m web.backend.app` | Same |
| Start frontend | `cd web/frontend && npm run dev` | Same |

---

## Output files

| File | Description |
|------|-------------|
| `out/results.json` | Pipeline output: property id, timestamps, images, room types, and confirmed features. |
| `out/feedback.json` | Human feedback: one entry per Agree/Disagree (property_id, filename, feature_id, verdict). Created when you submit feedback. |

---

## Project layout (short)

```
realview_chat/
├── scripts/run_pipeline.py   # CLI to run the pipeline
├── src/realview_chat/        # Pipeline and OpenAI logic
├── web/
│   ├── backend/app.py        # Flask API (properties, images, feedback)
│   └── frontend/             # React + Vite + Tailwind app
├── out/                      # results.json, feedback.json (gitignored)
├── requirements.txt         # Python dependencies
└── .env                      # Optional: OPENAI_API_KEY (create yourself)
```

---

## Troubleshooting

- **“results.json not found”** – Run the pipeline first so that `out/results.json` exists. The backend and frontend depend on it.
- **Images don’t load in the app** – Set `IMAGES_DIR` to the same folder you passed to `run_pipeline.py` (and restart the backend).
- **OpenAI or SSL errors when running the pipeline** – Check your `OPENAI_API_KEY` and network; some corporate networks block or alter HTTPS.
