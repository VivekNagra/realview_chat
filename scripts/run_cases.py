import pandas as pd
import shutil
from pathlib import Path
import openpyxl
from openpyxl.styles import PatternFill
import subprocess
import sys
import os

# --- Projektets root (hvor run_pipeline og cases-base ligger) ---
PROJECT_ROOT = Path(__file__).resolve().parents[1]
cases_base = Path(r"C:\Users\ermin\Documents\GitHub\realview_chat\cases") # Hvor pipeline forventer cases
cases_base.mkdir(parents=True, exist_ok=True)

# --- Tilføj PROJECT_ROOT til path så run_pipeline kan importeres ---
sys.path.append(str(PROJECT_ROOT))

# --- Brugertilpassede stier (Excel, download-script og downloads kan ligge hvor som helst) ---
excel_file = Path(r"C:\Users\ermin\Desktop\Realview\Overblik.xlsx")       # Excel-fil med ID'er
download_script = Path(r"C:\Users\ermin\Desktop\Realview\students26a.txt")  # Script der downloader cases
download_base = Path(r"C:\Users\ermin\Desktop\Realview")        # Hvor download-scriptet lægger filer

max_cases = 2  # antal ID'er der køres i denne batch, sæt til None for alle

# --- Læs ID'er fra Excel ---
df = pd.read_excel(excel_file)
ids = df["proposal_id"].tolist()

# --- Importer pipeline funktioner ---
from run_pipeline import run_single_mode, create_client
from realview_chat.config import load_config

# --- Initialiser pipeline client ---
config = load_config()
client = create_client(config)

# --- 1. Kør download-script for hver ID ---
for i, case_id in enumerate(ids):
    if max_cases and i >= max_cases:
        print(f"Stopper efter {max_cases} cases.")
        break

    print(f"\nKører download-script for ID: {case_id}...")
    # Her antager vi at dit “script” kan køres som python-fil, hvis det er en txt skal du måske ændre extension til .py
    # Kør download-script i `download_base` så filer lander der hvor vi forventer
    subprocess.run(["python", str(download_script), str(case_id)], check=True, cwd=str(download_base))

    

# --- 2. Flyt downloadede mapper til cases_base ---
for case_id in ids[:max_cases]:
    source_folder = download_base / f"case_{case_id}"
    destination_folder = cases_base / f"case_{case_id}"

    # Hvis download-scriptet alligevel lagde casen i projekt-roden, tjek også dér
    alt_source = PROJECT_ROOT / f"case_{case_id}"

    if not source_folder.exists() and alt_source.exists():
        print(f"Fundet case i projekt-root i stedet for download_base: {alt_source}")
        source_folder = alt_source

    print(f"Flytter {source_folder} → {destination_folder}")

    try:
        # Prøv rename først (hurtigt på samme disk), fald tilbage til shutil.move hvis det fejler
        os.rename(str(source_folder), str(destination_folder))
        print(f"✅ Flytning lykkedes")
    except FileExistsError:
        print(f"❌ Destination eksisterer allerede: {destination_folder}")
    except OSError:
        try:
            shutil.move(str(source_folder), str(destination_folder))
            print(f"✅ Flytning lykkedes via shutil.move")
        except Exception as e:
            print(f"❌ Kunne ikke flytte {source_folder}: {e}")
    except Exception as e:
        print(f"❌ Kunne ikke flytte {source_folder}: {e}")




# --- 3. Kør pipeline på alle cases i cases_base ---
for i, case_id in enumerate(ids):
    if max_cases and i >= max_cases:
        break

    case_folder = cases_base / f"case_{case_id}"
    print(f"\nKører pipeline for case: {case_id}...")
    run_single_mode(client, str(case_folder))

print("\nAlle valgte cases er færdige.")
