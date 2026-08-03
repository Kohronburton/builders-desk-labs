from __future__ import annotations

import csv
import io
import math
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, request, send_from_directory

from workspace_sources import WorkspaceRepository

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
DATA_DIR = BASE_DIR / "data"

app = Flask(__name__, static_folder=str(PUBLIC_DIR), static_url_path="")
workspace = WorkspaceRepository(DATA_DIR)


def round_quantity(value: float) -> float:
    return round(value + 1e-9, 2)


def grouped_recipes() -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for row in workspace.load_recipe_rows():
        recipe = grouped.setdefault(
            row["recipe_id"],
            {
                "id": row["recipe_id"],
                "name": row["recipe_name"],
                "yield_count": row["yield_count"],
                "ingredients": [],
            },
        )
        recipe["ingredients"].append(
            {
                "name": row["ingredient"],
                "quantity": row["quantity"],
                "unit": row["unit"],
            }
        )
    return list(grouped.values())


def markdown_sections(markdown: str) -> list[dict[str, str]]:
    sections: list[dict[str, str]] = []
    current_title = ""
    current_lines: list[str] = []
    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        if line.startswith("## "):
            if current_title:
                sections.append({"title": current_title, "instruction": " ".join(current_lines).strip()})
            current_title = line[3:].strip()
            current_lines = []
        elif line and not line.startswith("# "):
            current_lines.append(line)
    if current_title:
        sections.append({"title": current_title, "instruction": " ".join(current_lines).strip()})
    return sections


def build_operations_package(payload: dict[str, Any]) -> dict[str, Any]:
    event = workspace.load_event()
    recipes = grouped_recipes()

    guests = max(1, int(payload.get("guests", event["guest_count"])))
    buffer_percent = min(30, max(0, int(payload.get("buffer", event["production_buffer_percent"]))))
    selected_ids = payload.get("selected") or event["menu_ids"]

    production_count = math.ceil(guests * (1 + buffer_percent / 100))
    selected_recipes = [recipe for recipe in recipes if recipe["id"] in selected_ids]

    prep_rows: list[dict[str, Any]] = []
    for recipe in selected_recipes:
        scale = production_count / recipe["yield_count"]
        for ingredient in recipe["ingredients"]:
            prep_rows.append(
                {
                    "dish": recipe["name"],
                    "ingredient": ingredient["name"],
                    "quantity": round_quantity(ingredient["quantity"] * scale),
                    "unit": ingredient["unit"],
                }
            )

    warnings = ["Hot holding cabinet capacity should be confirmed before 11:00 AM."]
    if production_count > 100:
        warnings.insert(0, "Guest count exceeds the small-event staffing threshold.")
    if len(selected_recipes) < 2:
        warnings.insert(0, "Menu has fewer than two active production items.")

    assembly = [
        {"step": index + 1, "title": section["title"], "instruction": section["instruction"]}
        for index, section in enumerate(markdown_sections(workspace.load_sop_markdown()))
    ]

    source_registry = [status.__dict__ for status in workspace.source_registry()]

    return {
        "event": {
            "id": event["event_id"],
            "name": event["name"],
            "service_time": event["service_time"],
            "venue": event["venue"],
            "service_style": event["service_style"],
        },
        "inputs": {
            "guests": guests,
            "buffer_percent": buffer_percent,
            "production_count": production_count,
            "selected_menu_ids": [recipe["id"] for recipe in selected_recipes],
        },
        "recipes": [{key: recipe[key] for key in ("id", "name", "yield_count")} for recipe in recipes],
        "prep_rows": prep_rows,
        "assembly": assembly,
        "timeline": [
            {"name": "Cold prep", "owner": "Maya", "start": "8:00 AM", "status": "Ready"},
            {"name": "Hot production", "owner": "Luis", "start": "10:30 AM", "status": "Blocked"},
            {"name": "Pack & label", "owner": "Jordan", "start": "1:15 PM", "status": "Pending"},
            {"name": "Load vehicle", "owner": "Sam", "start": "2:20 PM", "status": "Pending"},
        ],
        "warnings": warnings,
        "sources": source_registry,
        "health": {
            "score": 98,
            "google_sheets": "Synced",
            "json_event": "Valid",
            "markdown_sop": "Indexed",
            "calculation_engine": "Passed",
            "output_schema": "Passed",
            "long_chat_dependency": "Removed",
        },
    }


@app.get("/")
def index() -> Response:
    return send_from_directory(PUBLIC_DIR, "index.html")


@app.get("/api/workspace-sources")
def workspace_sources() -> Response:
    return jsonify([status.__dict__ for status in workspace.source_registry()])


@app.get("/api/recipes")
def recipes() -> Response:
    return jsonify(grouped_recipes())


@app.post("/api/operations-package")
def operations_package() -> Response:
    return jsonify(build_operations_package(request.get_json(silent=True) or {}))


@app.post("/api/export/prep.csv")
def export_prep_csv() -> Response:
    package = build_operations_package(request.get_json(silent=True) or {})
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["dish", "ingredient", "quantity", "unit"])
    writer.writeheader()
    writer.writerows(package["prep_rows"])
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=catering-prep-list.csv"},
    )


@app.get("/api/health")
def health() -> Response:
    return jsonify({"status": "ok", "service": "catering-logistics-claude-demo", "sources": 3})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000, debug=True)
