"""CSV reader for property IDs."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Iterable


def read_property_ids(csv_path: Path, id_column: str = "id") -> Iterable[str]:
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    with csv_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if id_column not in reader.fieldnames:
            raise ValueError(f"CSV must include '{id_column}' column")

        for row in reader:
            value = (row.get(id_column) or "").strip()
            if value:
                yield value
