from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class SourceStatus:
    source: str
    kind: str
    status: str
    records: int
    purpose: str


class WorkspaceRepository:
    """Normalizes Google Workspace-adjacent data into one application model.

    The demo reads a CSV export to stay credential-free. In production,
    `load_recipe_rows` is replaced by the Google Sheets API adapter while the
    rest of the application remains unchanged.
    """

    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir

    def load_event(self) -> dict[str, Any]:
        return json.loads((self.data_dir / "event.json").read_text(encoding="utf-8"))

    def load_recipe_rows(self) -> list[dict[str, Any]]:
        with (self.data_dir / "recipes.csv").open(encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))
        return [
            {
                **row,
                "yield_count": int(row["yield_count"]),
                "quantity": float(row["quantity"]),
            }
            for row in rows
        ]

    def load_sop_markdown(self) -> str:
        return (self.data_dir / "assembly_sop.md").read_text(encoding="utf-8")

    def source_registry(self) -> list[SourceStatus]:
        event = self.load_event()
        recipes = self.load_recipe_rows()
        sop = self.load_sop_markdown()
        return [
            SourceStatus(
                source="Catering Operations Sheet",
                kind="Google Sheets",
                status="Synced",
                records=len(recipes),
                purpose="Recipes, yields, ingredient quantities",
            ),
            SourceStatus(
                source="Event Configuration",
                kind="JSON",
                status="Valid",
                records=1 if event else 0,
                purpose="Guest count, venue, service style, selected menu",
            ),
            SourceStatus(
                source="Assembly SOP",
                kind="Markdown",
                status="Indexed",
                records=sop.count("## "),
                purpose="Approved operational language and safety rules",
            ),
        ]
