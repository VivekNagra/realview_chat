# RealView Chat

A property inspection review tool: run an AI pipeline on inspection images, then review results and give feedback in a web app.

---

## What’s in this project

1. **Pipeline** – Processes image folders with OpenAI vision (room type, issues, features). Writes one file per property: `out/results_{property_id}.json`. Supports a single folder or **auto-scan** of your cases directory.
2. **Backend** – Flask API (port 5001) that serves properties from `out/results_*.json`, images from a central cases folder, and reads/writes feedback in `out/feedback.json`.
3. **Frontend** – React (Vite + Tailwind) app to browse properties, see rooms/features, and submit Agree/Disagree on each finding. Feedback is loaded on startup so previous reviews show correctly.

---

## What you need

- **Python 3.10+**
- **Node.js 18+** (for the web frontend)
- **OpenAI API key** (for the pipeline)

---

## Centralized cases folder

Property images live in one place:

- **Path:** `/Users/vivek/Desktop/RealView/cases/`
- **Layout:** One folder per property: `case_<property_id>/` (e.g. `case_2203177/`).

The pipeline reads from here; the backend serves images from here. No per-run image path or `IMAGES_DIR` is needed.

---

## Setup

Do this once from the **project root** (the folder that contains `scripts/`, `web/`, and `requirements.txt`).

### 1. Open a terminal in the project folder

- **Mac:** `cd` to the project folder (e.g. `cd ~/Desktop/RealView/realview_chat`).
- **Windows:** `cd` to the project folder (e.g. `cd C:\Users\YourName\realview_chat`).

### 2. (Optional) Create and activate a Python virtual environment

| Step | Mac / Linux | Windows (Command Prompt) | Windows (PowerShell) |
|------|-------------|--------------------------|----------------------|
| Create venv | `python3 -m venv .venv` | `python -m venv .venv` | `python -m venv .venv` |
| Activate | `source .venv/bin/activate` | `.venv\Scripts\activate.bat` | `.venv\Scripts\Activate.ps1` |

### 3. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 4. Set your OpenAI API key

**Option A – `.env` file (recommended)**

Create a file named `.env` in the project root:

```
OPENAI_API_KEY=sk-your-key-here
```

**Option B – Environment variable (current terminal only)**

| Mac / Linux | Windows (CMD) | Windows (PowerShell) |
|-------------|----------------|----------------------|
| `export OPENAI_API_KEY=sk-your-key-here` | `set OPENAI_API_KEY=sk-your-key-here` | `$env:OPENAI_API_KEY="sk-your-key-here"` |

### 5. Install frontend dependencies

```bash
cd web/frontend
npm install
cd ../..
```

---

## Run the pipeline

From the **project root**.

### Auto-scan (process all new cases)

No arguments: the script scans `/Users/vivek/Desktop/RealView/cases/` for every `case_*` folder and processes only those that don’t already have `out/results_{property_id}.json`.

```bash
python scripts/run_pipeline.py
```

You’ll see: `Found [X] total cases, [Y] need processing.` Then it runs the pipeline for each new case and ends with `Successfully processed [Z] new cases.`

### Single property

**By property id** (resolves to `cases/case_<id>/`):

```bash
python scripts/run_pipeline.py 2203177
```

**By full path:**

```bash
# Mac / Linux
python scripts/run_pipeline.py "/Users/vivek/Desktop/RealView/cases/case_2203177"

# Windows
python scripts/run_pipeline.py "C:/Users/YourName/RealView/cases/case_2203177"
```

If `out/results_{property_id}.json` already exists, the script skips that property and does not call the API.

---

## Run the web app

Use **two terminals**: one for the backend, one for the frontend.

### Terminal 1 – Backend (Flask)

From the **project root**:

```bash
python -m web.backend.app
```

You should see something like **Running on http://127.0.0.1:5001**. Leave this terminal open. (The app uses port **5001** to avoid conflict with macOS AirPlay on 5000.)

### Terminal 2 – Frontend (React)

From the **project root**:

```bash
cd web/frontend
npm run dev
```

Open the URL shown (e.g. `http://localhost:5173`) in your browser. The frontend proxies `/api` to the backend on port 5001.

**Using the app:**

- **Sidebar** – Lists all properties from `out/results_*.json`. Click one to load it.
- **Header** – Shows the selected property’s id and created-at timestamp.
- **Left panel** – Rooms and confirmed features (feature_id, severity, evidence). Agree/Disagree per feature; verdicts are saved and restored from `out/feedback.json`.
- **Right panel** – Images per room, loaded from the backend using the centralized cases folder.

---

## Commands quick reference

| Task | Command |
|------|--------|
| Install Python deps | `pip install -r requirements.txt` |
| Run pipeline (auto-scan) | `python scripts/run_pipeline.py` |
| Run pipeline (one property) | `python scripts/run_pipeline.py 2203177` or `python scripts/run_pipeline.py "/path/to/case_2203177"` |
| Start backend | `python -m web.backend.app` |
| Start frontend | `cd web/frontend && npm run dev` |

---

## Output files

| File | Description |
|------|-------------|
| `out/results_{property_id}.json` | One per property: pipeline output (property_id, created_at, images, rooms, confirmed features). |
| `out/feedback.json` | All feedback entries: property_id, filename, feature_id, verdict (agree/disagree). Created/updated when you submit feedback in the app. |

The backend also supports a single legacy file `out/results.json` (one property) if no `results_*.json` files exist.

---

## Project layout

```
realview_chat/
├── scripts/run_pipeline.py   # Pipeline CLI (single or auto-scan)
├── src/realview_chat/        # Pipeline and OpenAI logic
├── web/
│   ├── backend/app.py        # Flask API on port 5001 (properties, images, feedback)
│   └── frontend/             # React + Vite + Tailwind dashboard
├── out/                      # results_*.json, feedback.json (gitignored)
├── requirements.txt          # Python dependencies
└── .env                      # Optional: OPENAI_API_KEY
```

Cases (images) live outside the repo at `/Users/vivek/Desktop/RealView/cases/case_<property_id>/`.

---

## Troubleshooting

- **“No properties found”** – Run the pipeline at least once so `out/` contains at least one `results_*.json` (or a legacy `results.json`). The dashboard reads from these files.
- **403 when loading the app** – The backend runs on **port 5001**. Ensure you started it with `python -m web.backend.app` and that the frontend proxy in `web/frontend/vite.config.js` points to `http://localhost:5001`. On macOS, port 5000 is often used by AirPlay and returns 403 for API requests.
- **Images don’t load** – Images are served from `/Users/vivek/Desktop/RealView/cases/case_<property_id>/`. Ensure that path exists and contains the filenames listed in your results JSON.
- **OpenAI or SSL errors in the pipeline** – Check `OPENAI_API_KEY` in `.env` and your network; some environments block or alter HTTPS.
